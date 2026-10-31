// Real-world replay data: public social videos about the 12–20 October 2026 storm in Sharjah,
// retrieved once through the Oriane video-search API (https://connect.oriane.xyz/rest/docs).
//
//   node --env-file=.env.local scripts/fetch-social.mjs
//
// Each query costs Oriane credits, so raw responses are cached in .data/oriane/ (gitignored) and a
// query that already has a cached response is never sent again. scripts/build-replay.mts turns the
// raw responses into the minimal, privacy-reduced dataset the app ships with.

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEY = process.env.ORIANE_API_KEY?.trim();
if (!KEY) {
  console.error("ORIANE_API_KEY is not set (add it to .env.local)");
  process.exit(1);
}
const OUT = path.resolve(".data/oriane");
mkdirSync(OUT, { recursive: true });

const WINDOW = { after: "2026-10-10", before: "2026-10-25" };

// Places in the Emirate of Sharjah (English + Arabic spellings seen in captions).
const SHARJAH_PLACES = [
  "Sharjah", "sharjah", "الشارقة", "Khor Fakkan", "Khorfakkan", "خورفكان", "خور فكان", "Kalba", "كلباء",
  "Dibba Al Hisn", "دبا الحصن", "Madam", "مدام", "Maleha", "Mleiha", "مليحة", "Al Dhaid", "Dhaid", "الذيد",
  "Mahafiz", "محافيظ", "Batayih", "البطائح", "Hamriyah", "الحمرية", "Nahwa", "نحوة", "Wadi Shees", "شيص",
  "Rafisah", "الرفيعة", "Muwaileh", "مويلح", "Al Nahda", "النهدة", "Al Majaz", "المجاز",
];
const WEATHER = [
  "rain", "Rain", "flood", "Flood", "storm", "Storm", "hail", "Hail", "wadi", "Wadi", "thunder",
  "مطر", "أمطار", "امطار", "الأمطار", "سيول", "السيول", "عاصفة", "برد", "البرد", "وادي", "الأودية", "رعد", "هطول",
];
const WEATHER_TAGS = ["مركز_العاصفة", "الشارقة_للأخبار", "امطار_الامارات", "أمطار_الإمارات", "uaerain", "uaeweather", "sharjahrain", "stormcenter", "uae_weather"];

// Most of Sharjah's residents are not Arabic or English speakers: the same storm in the languages
// of its largest communities (Hindi, Urdu, Malayalam, Tamil, Bengali, Tagalog, Persian, Nepali).
const SHARJAH_ANY_SCRIPT = [
  ...SHARJAH_PLACES,
  "शारजाह", "शारजा", "ഷാർജ", "ഷാര്‍ജ", "ஷார்ஜா", "শারজাহ", "শারজা", "شارجہ", "شارجه", "शारजाह में", "Sharjah me", "Sharjah mein",
];
const WEATHER_ANY_LANGUAGE = [
  ...WEATHER,
  // Hindi (Devanagari + romanised)
  "बारिश", "बाढ़", "ओले", "तूफान", "बरसात", "baarish", "barish", "toofan", "olay",
  // Urdu / Persian
  "بارش", "سیلاب", "اولے", "طوفان", "باران", "سیل", "تگرگ",
  // Malayalam
  "മഴ", "വെള്ളപ്പൊക്കം", "ആലിപ്പഴ", "കൊടുങ്കാറ്റ്",
  // Tamil
  "மழை", "வெள்ளம்", "ஆலங்கட்டி", "புயல்",
  // Bengali
  "বৃষ্টি", "বন্যা", "শিলাবৃষ্টি", "ঝড়",
  // Tagalog / Nepali
  "ulan", "baha", "bagyo", "yelo", "वर्षा", "असिना",
];
const OTHER_LANGUAGES = ["hi", "ur", "ml", "ta", "bn", "tl", "fil", "fa", "ne", "ps", "si", "te"];

const inc = (values) => ({ includesExactly: { values } });

const QUERIES = {
  // 1. Sharjah place named in the caption + weather words in caption or speech
  "caption-place-weather": {
    limit: 50,
    sort: "viewsCount:desc",
    body: {
      operator: "and",
      filters: { publishedAt: WINDOW, caption: inc(SHARJAH_PLACES) },
      queries: [{ operator: "or", filters: { caption: inc(WEATHER), transcript: inc(WEATHER), hashtags: inc(WEATHER_TAGS) } }],
    },
  },
  // 1b. Second page of query 1 (68 matches in total)
  "caption-place-weather-p2": { offsetOf: "caption-place-weather", offset: 50, limit: 50, sort: "viewsCount:desc" },
  // 2. Sharjah place spoken or shown on screen (TikTok overlays, news clips)
  "speech-screen-place-weather": {
    limit: 40,
    sort: "viewsCount:desc",
    body: {
      operator: "and",
      filters: { publishedAt: WINDOW },
      queries: [
        { operator: "or", filters: { transcript: inc(SHARJAH_PLACES), onScreenText: inc(SHARJAH_PLACES) } },
        { operator: "or", filters: { caption: inc(WEATHER), transcript: inc(WEATHER), onScreenText: inc(WEATHER) } },
      ],
    },
  },
  // 4. Spoken in another community language, naming Sharjah (any script) and the weather
  "languages-speech": {
    limit: 50,
    sort: "viewsCount:desc",
    body: {
      operator: "and",
      filters: { publishedAt: WINDOW, transcriptLanguage: { includes: OTHER_LANGUAGES } },
      queries: [
        { operator: "or", filters: { caption: inc(SHARJAH_ANY_SCRIPT), transcript: inc(SHARJAH_ANY_SCRIPT), onScreenText: inc(SHARJAH_ANY_SCRIPT) } },
        { operator: "or", filters: { caption: inc(WEATHER_ANY_LANGUAGE), transcript: inc(WEATHER_ANY_LANGUAGE), onScreenText: inc(WEATHER_ANY_LANGUAGE) } },
      ],
    },
  },
  // 5. Captioned in another community language
  "languages-caption": {
    limit: 50,
    sort: "viewsCount:desc",
    body: {
      operator: "and",
      filters: { publishedAt: WINDOW, captionLanguage: { includes: OTHER_LANGUAGES } },
      queries: [
        { operator: "or", filters: { caption: inc(SHARJAH_ANY_SCRIPT), transcript: inc(SHARJAH_ANY_SCRIPT), onScreenText: inc(SHARJAH_ANY_SCRIPT), hashtags: inc(["sharjah", "uae", "dubai"]) } },
        { operator: "or", filters: { caption: inc(WEATHER_ANY_LANGUAGE), transcript: inc(WEATHER_ANY_LANGUAGE), onScreenText: inc(WEATHER_ANY_LANGUAGE) } },
      ],
    },
  },
  // 6. South Asian speech about the UAE weather (the place is often only "UAE"; Claude and the
  //    gazetteer then decide whether a Sharjah place is actually named or shown)
  "languages-uae-weather": {
    limit: 50,
    sort: "viewsCount:desc",
    body: {
      operator: "and",
      filters: { publishedAt: WINDOW, transcriptLanguage: { includes: ["hi", "ur", "ml", "ta", "bn", "ne", "te", "pa"] } },
      queries: [
        {
          operator: "or",
          filters: {
            caption: inc([...SHARJAH_ANY_SCRIPT, "UAE", "uae", "यूएई", "യുഎഇ", "யுஏஇ", "Dubai", "دبئی", "दुबई", "ദുബായ്"]),
            hashtags: inc(["uae", "dubai", "sharjah", "uaerain", "uaeweather", "dubairain"]),
            onScreenText: inc(["UAE", "Sharjah", "Dubai"]),
          },
        },
        { operator: "or", filters: { caption: inc(WEATHER_ANY_LANGUAGE), transcript: inc(WEATHER_ANY_LANGUAGE), onScreenText: inc(WEATHER_ANY_LANGUAGE) } },
      ],
    },
  },
  // 3. UAE weather-reporting hashtags (place resolved later from caption / frames)
  "weather-hashtags": {
    limit: 50,
    sort: "viewsCount:desc",
    body: { operator: "and", filters: { publishedAt: WINDOW, hashtags: inc(WEATHER_TAGS) } },
  },
};

const only = process.argv.slice(2);
for (const [name, q] of Object.entries(QUERIES)) {
  if (only.length && !only.includes(name)) continue;
  const file = path.join(OUT, `raw-${name}.json`);
  if (existsSync(file)) {
    console.log(`cached  ${name}`);
    continue;
  }
  const body = q.offsetOf ? QUERIES[q.offsetOf].body : q.body;
  const url = `https://connect.oriane.xyz/rest/contents/search?limit=${q.limit}&offset=${q.offset ?? 0}&projection=full&sort=${encodeURIComponent(q.sort)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 206) {
    console.error(`failed  ${name}: HTTP ${res.status}`, JSON.stringify(json).slice(0, 300));
    continue;
  }
  writeFileSync(file, JSON.stringify({ query: name, fetchedAt: new Date().toISOString(), request: q, response: json }, null, 1));
  console.log(`fetched ${name}: ${json.data?.results?.length ?? 0} of ${json.metadata?.pagination?.totalCount ?? "?"} matches`);
}
