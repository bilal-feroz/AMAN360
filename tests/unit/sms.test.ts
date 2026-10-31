import { describe, expect, it } from "vitest";
import { matchSmsQuestion, normaliseDigits, parseSms, replyLanguage, smsAlert, smsAnswer, smsReply, smsSegments, SMS_LANGS, SMS_REVIEW } from "@/domain/comms/sms";
import { MESH_NODES, meshLinks, meshRoute, WIFI_RANGE_M } from "@/domain/mesh";
import { APPROVED_ANSWERS } from "@/scenario/policy";
import population from "@/scenario/population.json";
import { HAZARD_POLYGON } from "@/scenario/scenario";
import * as turf from "@turf/turf";

const facts = {
  zone: { en: "Al Majaz — blocks between Jamal Abdul Naser St and Al Wahda St", ar: "المجاز — المربعات الواقعة بين شارع جمال عبد الناصر وشارع الوحدة" },
  closure: { en: "Al Wahda Street near Al Majaz (both directions)", ar: "شارع الوحدة قرب المجاز (الاتجاهين)" },
  validUntil: "2026-10-31T16:00:00.000Z",
};

describe("SMS replies are parsed deterministically", () => {
  it("reads numbered replies in every digit script", () => {
    expect(parseSms("1")).toEqual({ kind: "safe" });
    expect(parseSms("١")).toEqual({ kind: "safe" }); // Arabic-Indic
    expect(parseSms("۲")).toEqual({ kind: "help", details: null }); // Urdu / Persian
    expect(parseSms("२ पानी अंदर")).toEqual({ kind: "help", details: "पानी अंदर" }); // Devanagari
    expect(parseSms("৩")).toEqual({ kind: "question", text: null }); // Bengali
    expect(normaliseDigits("൨")).toBe("2"); // Malayalam
    expect(parseSms("3. is it safe to drive?")).toEqual({ kind: "question", text: "is it safe to drive?" });
  });

  it("does not read a house number or a count as a menu choice", () => {
    expect(parseSms("12 people trapped, help").kind).toBe("help");
    expect(parseSms("2nd floor flooded, need help")).toEqual({ kind: "help", details: "2nd floor flooded, need help" });
  });

  it("understands help and safe words in each community language", () => {
    for (const t of ["help", "مساعدة", "मदद चाहिए", "madad chahiye", "مدد چاہیے", "സഹായം വേണം", "সাহায্য দরকার", "tulong po"]) expect(parseSms(t).kind, t).toBe("help");
    for (const t of ["I am safe", "أنا بخير", "हम सुरक्षित हैं", "ہم محفوظ ہیں", "ഞങ്ങൾ സുരക്ഷിതരാണ്", "আমরা নিরাপদ", "ligtas kami"]) expect(parseSms(t).kind, t).toBe("safe");
  });

  it("treats 'not safe' as a help request (safer to over-escalate)", () => {
    for (const t of ["not safe", "I'm not safe", "मैं सुरक्षित नहीं हूँ", "میں محفوظ نہیں ہوں", "hindi ligtas", "لست بخير"]) expect(parseSms(t).kind, t).toBe("help");
  });

  it("never drops a message: long unknown text goes to a person, short noise gets the menu", () => {
    expect(parseSms("the building manager says something about the lift")).toEqual({ kind: "freeform", text: "the building manager says something about the lift" });
    expect(parseSms("ok").kind).toBe("unknown");
    expect(parseSms("   ").kind).toBe("unknown");
  });

  it("uses what the last SMS asked for", () => {
    expect(parseSms("water on the ground floor", "help_details")).toEqual({ kind: "help", details: "water on the ground floor" });
    expect(parseSms("parking", "question")).toEqual({ kind: "question", text: "parking" });
  });

  it("switches language by command or by name", () => {
    expect(parseSms("LANG HI")).toEqual({ kind: "language", lang: "hi" });
    expect(parseSms("language urdu")).toEqual({ kind: "language", lang: "ur" });
    expect(parseSms("മലയാളം")).toEqual({ kind: "language", lang: "ml" });
    expect(parseSms("Tagalog")).toEqual({ kind: "language", lang: "tl" });
  });

  it("replies in the script a person writes in, but never guesses English from Latin text", () => {
    expect(replyLanguage("पानी घर में आ गया है", "en")).toBe("hi");
    expect(replyLanguage("پانی گھر میں آ گیا ہے", "hi")).toBe("ur");
    expect(replyLanguage("water in the house", "hi")).toBe("hi");
    expect(replyLanguage("madad chahiye", "ur")).toBe("ur");
  });

  it("matches questions in any supported language to approved answers only", () => {
    expect(matchSmsQuestion("क्या मैं गाड़ी चला सकता हूँ?")).toBe("Q-DRIVE");
    expect(matchSmsQuestion("can I move my car from the underground parking")).toBe("Q-PARKING");
    expect(matchSmsQuestion("kailan matatapos?")).toBe("Q-UNTIL");
    expect(matchSmsQuestion("is the bridge collapsed")).toBeNull();
    // Rescue / boat / hospital questions always go to a person, even when a road is mentioned.
    expect(matchSmsQuestion("can a boat rescue us from the road?")).toBeNull();
    expect(matchSmsQuestion("क्या नाव से बचाव आएगा, सड़क बंद है?")).toBeNull();
    expect(matchSmsQuestion("may ambulansya ba sa kalsada?")).toBeNull();
    for (const id of ["Q-DRIVE", "Q-UNTIL", "Q-PARKING", "Q-HELP"]) expect(APPROVED_ANSWERS.some((a) => a.id === id)).toBe(true);
  });
});

describe("keyword fallback when Claude is unavailable", () => {
  it("raises urgent help texts to P1 in every SMS language", async () => {
    const { classifyHelpText } = await import("@/domain/comms/classify");
    for (const t of ["पानी घर में आ गया है, मेरी माँ चल नहीं सकती", "پانی گھر میں آ گیا ہے، والد بزرگ ہیں", "വെള്ളം കയറി, കുഞ്ഞ് ഉണ്ട്", "পানি ঢুকছে, বাচ্চা আছে", "pumapasok ang tubig, may sanggol", "pani ghar me aa gaya"]) {
      expect(classifyHelpText(t).priority, t).toBe("P1");
    }
    expect(classifyHelpText("please send information").priority).toBe("P2");
  });
});

describe("SMS templates", () => {
  it("exist for every language and action, keep facts locked and always offer 999", () => {
    for (const lang of SMS_LANGS) {
      for (const action of ["ACT-INDOOR-01", "ACT-ROAD-02"]) {
        const text = smsAlert(action, lang, facts)!;
        expect(text, `${action} ${lang}`).toBeTruthy();
        expect(text).not.toMatch(/\{(zone|closure|until)\}/);
        expect(text).toContain("999");
        expect(text).toMatch(/1.*2.*3/s);
      }
      for (const id of ["Q-DRIVE", "Q-UNTIL", "Q-PARKING", "Q-HELP"]) expect(smsAnswer(id, lang, facts)).toBeTruthy();
      for (const kind of ["safe", "help", "help_details", "ask", "escalated", "forwarded", "unknown", "no_alert", "lang_set", "closed"] as const) expect(smsReply(kind, lang)).toBeTruthy();
    }
    expect(smsAlert("ACT-UNKNOWN", "en", facts)).toBeNull();
  });

  it("uses the short place name so alerts stay within a few segments", () => {
    const en = smsAlert("ACT-INDOOR-01", "en", facts)!;
    expect(en).toContain("Al Majaz until");
    expect(en).not.toContain("blocks between");
    expect(smsSegments(en).segments).toBeLessThanOrEqual(2);
    for (const lang of SMS_LANGS) expect(smsSegments(smsAlert("ACT-INDOOR-01", lang, facts)!).segments, lang).toBeLessThanOrEqual(5);
  });

  it("help replies never promise that help is coming", () => {
    for (const lang of SMS_LANGS) for (const kind of ["help", "help_details"] as const) expect(smsReply(kind, lang)).toContain("999");
    expect(smsReply("help", "en")).not.toMatch(/on (the|its) way|dispatched|coming/i);
  });

  it("marks only English and Arabic as approved wording", () => {
    expect(Object.entries(SMS_REVIEW).filter(([, v]) => v === "approved").map(([k]) => k)).toEqual(["en", "ar"]);
  });

  it("counts segments like a network does", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ encoding: "GSM-7", segments: 1, chars: 160 });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("€".repeat(80)).chars).toBe(160); // extension characters count twice
    expect(smsSegments("मदद".repeat(20))).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(smsSegments("म".repeat(71)).segments).toBe(2);
  });
});

describe("mesh relay fallback", () => {
  it("routes every in-zone resident to a gateway within Wi-Fi range of a relay", () => {
    const inZone = (population.recipients as { location: { coordinates: number[] } | null }[]).filter(
      (r) => r.location && Number.isFinite(r.location.coordinates[0]) && turf.booleanPointInPolygon(r.location.coordinates, HAZARD_POLYGON),
    );
    expect(inZone.length).toBeGreaterThan(50);
    for (const r of inZone) {
      const route = meshRoute(r.location!.coordinates as [number, number]);
      expect(route).not.toBeNull();
      expect(route!.wifiDistanceM).toBeLessThanOrEqual(WIFI_RANGE_M);
      expect(route!.path.at(-1)).toBe("G1");
      expect(route!.hops).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns null out of range and keeps every node connected", () => {
    expect(meshRoute([55.5, 25.4])).toBeNull();
    const links = meshLinks();
    for (const n of MESH_NODES) expect(links.some(([a, b]) => a.id === n.id || b.id === n.id), n.id).toBe(true);
  });
});
