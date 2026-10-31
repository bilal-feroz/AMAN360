import type { ApprovedAction, SafetyPolicy } from "@/domain/types";

/**
 * POLICY-2026-02 — residential high-rise fire (training drill).
 *
 * Same contract as the flood policy: approved content only. The authority (Civil Defence) decides
 * whether a building is evacuated, evacuated floor by floor or told to stay put; this policy only
 * holds approved wording for full evacuation, so any other instruction blocks publication
 * (R-03-MODE) until wording for it is approved. AMAN never chooses between evacuating and staying.
 * Wording written for this prototype; it needs Civil Defence and emergency-terminology review.
 */

export const FIRE_POLICY_VERSION = "POLICY-2026-02";

export const FIRE_POLICY: SafetyPolicy = {
  version: FIRE_POLICY_VERSION,
  name: "Residential high-rise fire — public guidance policy (training)",
  effectiveFrom: "2026-01-01T00:00:00+04:00",
  expiresAt: "2026-12-31T23:59:59+04:00",
  status: "active",
  closureApproachMeters: 1500,
  boundaryUncertaintyMeters: 25,
  approvedInstructionModes: ["full_evacuation"],
  approvedContacts: [
    { label: { en: "Police (UAE)", ar: "الشرطة (الإمارات)" }, number: "999" },
    { label: { en: "Ambulance (UAE)", ar: "الإسعاف (الإمارات)" }, number: "998" },
    { label: { en: "Civil Defence (UAE)", ar: "الدفاع المدني (الإمارات)" }, number: "997" },
  ],
  rules: [
    {
      id: "R-00-VERIFY",
      priority: 0,
      outcome: "BLOCK",
      description: { en: "The fire report must come from a verified Civil Defence feed before any guidance is prepared or published.", ar: "يجب أن يصدر بلاغ الحريق عن موجز دفاع مدني موثّق قبل إعداد أي إرشادات أو نشرها." },
    },
    {
      id: "R-01-CONFLICT",
      priority: 1,
      outcome: "BLOCK",
      description: { en: "Conflicting critical facts (building, fire floor, instruction) block publication and require operator review.", ar: "تمنع الحقائق الحرجة المتعارضة (المبنى، طابق الحريق، التعليمات) النشر وتتطلب مراجعة المشغّل." },
    },
    {
      id: "R-02-EXPIRED",
      priority: 2,
      outcome: "BLOCK",
      description: { en: "Expired incidents or expired policies cannot be used to publish guidance.", ar: "لا يمكن استخدام الحوادث أو السياسات منتهية الصلاحية لنشر الإرشادات." },
    },
    {
      id: "R-03-MODE",
      priority: 3,
      outcome: "BLOCK",
      description: {
        en: "Guidance is published only for an authority instruction this policy has approved wording for (full evacuation in this drill). AMAN never chooses between evacuating and staying put.",
        ar: "تُنشر الإرشادات فقط لتعليمات الجهة المختصة التي تملك هذه السياسة صياغة معتمدة لها (الإخلاء الكامل في هذا التمرين). لا يختار أمان أبدًا بين الإخلاء والبقاء.",
      },
    },
    {
      id: "R-10-NOLOC",
      priority: 10,
      outcome: "REVIEW",
      description: { en: "Missing, stale or invalid location: do not infer impact — route to operator review.", ar: "الموقع مفقود أو قديم أو غير صالح: لا يُستنتج التأثر — يُحال إلى مراجعة المشغّل." },
    },
    {
      id: "R-40-FIRE-ABOVE",
      priority: 40,
      outcome: "SEND",
      actionId: "ACT-FIRE-ABOVE",
      description: {
        en: "Recipient lives in the building on the fire floor or above — or their floor is unknown (precautionary).",
        ar: "يسكن المستلم في المبنى في طابق الحريق أو أعلى منه — أو أن طابقه غير معروف (احترازيًا).",
      },
    },
    {
      id: "R-41-FIRE-BELOW",
      priority: 41,
      outcome: "SEND",
      actionId: "ACT-FIRE-BELOW",
      description: { en: "Recipient lives in the building below the fire floor.", ar: "يسكن المستلم في المبنى في طابق أدنى من طابق الحريق." },
    },
    {
      id: "R-42-SMOKE",
      priority: 42,
      outcome: "SEND",
      actionId: "ACT-FIRE-SMOKE",
      description: { en: "Recipient is in the verified smoke area downwind of the building.", ar: "المستلم داخل منطقة الدخان المؤكدة باتجاه الرياح من المبنى." },
    },
    {
      id: "R-43-ACCESS",
      priority: 43,
      outcome: "SEND",
      actionId: "ACT-FIRE-ROAD",
      description: { en: "Recipient is driving toward a road closed to keep Civil Defence access clear.", ar: "المستلم يقود باتجاه طريق مغلق لإبقاء وصول الدفاع المدني مفتوحًا." },
    },
    {
      id: "R-90-OUTSIDE",
      priority: 90,
      outcome: "NO_ACTION",
      description: {
        en: "Recipient is outside the building and the smoke area and not driving toward a closure: no emergency instruction is sent.",
        ar: "المستلم خارج المبنى ومنطقة الدخان ولا يتجه إلى إغلاق: لا تُرسل أي تعليمات طوارئ.",
      },
    },
  ],
};

const ZONE = "{{zone}}";
const UNTIL = "{{until}}";
const CLOSURE = "{{closure}}";
const FLOOR = "{{floor}}";
const ASSEMBLY = "{{assembly}}";

export const FIRE_ACTIONS: ApprovedAction[] = [
  {
    id: "ACT-FIRE-ABOVE",
    policyVersion: FIRE_POLICY_VERSION,
    title: { en: "Fire in your building — leave by the stairs", ar: "حريق في مبناك — غادر عبر الدرج" },
    lockedFacts: [ZONE, FLOOR, ASSEMBLY],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["stay indoors", "ابقَ في الداخل"],
    templates: {
      en: {
        standard: {
          headline: `Fire in ${ZONE} — leave now by the stairs`,
          body: `Civil Defence has confirmed a fire on ${FLOOR} of ${ZONE}. Leave the building now by the stairs if the way is clear, and gather at ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "Leave now by the nearest stairs. Do not use lifts." },
            { id: "f2", text: "If the corridor or stairs are full of smoke, stay in your flat: close the door and block the gaps with wet towels or clothes." },
            { id: "f3", text: "Stay low, where the air is clearer, and keep the door closed." },
            { id: "f4", text: "If you cannot get out, call 997 and tap “I'm still inside” with your floor." },
            { id: "f5", text: `Once you are out, go to ${ASSEMBLY} and tap “I'm out”. Do not go back inside.` },
          ],
        },
        plain: {
          headline: "Fire in your building. Leave now by the stairs.",
          body: `There is a fire on ${FLOOR} of ${ZONE}. Go to ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "Use the stairs. Do not use lifts." },
            { id: "f2", text: "If there is a lot of smoke outside your door, stay inside and close the door." },
            { id: "f3", text: "Stay low, near the floor." },
            { id: "f4", text: "If you cannot get out, call 997 and tell us your floor." },
            { id: "f5", text: `When you are out, go to ${ASSEMBLY} and tell us.` },
          ],
        },
        audio: {
          headline: "Fire in your building. Please leave now by the stairs.",
          body: `Civil Defence has confirmed a fire on ${FLOOR} of ${ZONE}. Please leave the building by the stairs if the way is clear, and gather at ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "Step one. Leave by the nearest stairs. Do not use lifts." },
            { id: "f2", text: "Step two. If the corridor or stairs are full of smoke, stay in your flat, close the door, and block the gaps with wet towels or clothes." },
            { id: "f3", text: "Step three. Stay low, where the air is clearer, and keep the door closed." },
            { id: "f4", text: "Step four. If you cannot get out, call nine nine seven, and use the I'm still inside button with your floor." },
            { id: "f5", text: `Step five. Once you are out, go to ${ASSEMBLY}, and use the I'm out button. Do not go back inside.` },
          ],
        },
      },
      ar: {
        standard: {
          headline: `حريق في ${ZONE} — غادر الآن عبر الدرج`,
          body: `أكّد الدفاع المدني وجود حريق في ${FLOOR} من ${ZONE}. غادر المبنى الآن عبر الدرج إذا كان الممر آمنًا، وتوجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "غادر الآن عبر أقرب درج. لا تستخدم المصاعد." },
            { id: "f2", text: "إذا امتلأ الممر أو الدرج بالدخان، فابقَ في شقتك: أغلق الباب وسُدّ الفتحات بمناشف أو ملابس مبللة." },
            { id: "f3", text: "ابقَ منخفضًا حيث يكون الهواء أنقى، وأبقِ الباب مغلقًا." },
            { id: "f4", text: "إذا لم تتمكن من الخروج، فاتصل بالرقم 997 واضغط «ما زلت في الداخل» مع رقم طابقك." },
            { id: "f5", text: `بعد خروجك، توجّه إلى ${ASSEMBLY} واضغط «خرجت من المبنى». لا تعد إلى الداخل.` },
          ],
        },
        plain: {
          headline: "حريق في مبناك. غادر الآن عبر الدرج.",
          body: `يوجد حريق في ${FLOOR} من ${ZONE}. توجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "استخدم الدرج. لا تستخدم المصاعد." },
            { id: "f2", text: "إذا كان الدخان كثيفًا خارج بابك، فابقَ في الداخل وأغلق الباب." },
            { id: "f3", text: "ابقَ منخفضًا قرب الأرض." },
            { id: "f4", text: "إذا لم تستطع الخروج، فاتصل بالرقم 997 وأخبرنا برقم طابقك." },
            { id: "f5", text: `عندما تخرج، توجّه إلى ${ASSEMBLY} وأخبرنا.` },
          ],
        },
        audio: {
          headline: "حريق في مبناك. يُرجى المغادرة الآن عبر الدرج.",
          body: `أكّد الدفاع المدني وجود حريق في ${FLOOR} من ${ZONE}. يُرجى مغادرة المبنى عبر الدرج إذا كان الممر آمنًا، والتوجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "f1", text: "الخطوة الأولى. غادر عبر أقرب درج. لا تستخدم المصاعد." },
            { id: "f2", text: "الخطوة الثانية. إذا امتلأ الممر أو الدرج بالدخان، فابقَ في شقتك، وأغلق الباب، وسُدّ الفتحات بمناشف أو ملابس مبللة." },
            { id: "f3", text: "الخطوة الثالثة. ابقَ منخفضًا حيث يكون الهواء أنقى، وأبقِ الباب مغلقًا." },
            { id: "f4", text: "الخطوة الرابعة. إذا لم تتمكن من الخروج، فاتصل بالرقم تسعة تسعة سبعة، واستخدم زر ما زلت في الداخل مع رقم طابقك." },
            { id: "f5", text: `الخطوة الخامسة. بعد خروجك، توجّه إلى ${ASSEMBLY}، واستخدم زر خرجت من المبنى. لا تعد إلى الداخل.` },
          ],
        },
      },
    },
  },
  {
    id: "ACT-FIRE-BELOW",
    policyVersion: FIRE_POLICY_VERSION,
    title: { en: "Fire above you — leave calmly by the stairs", ar: "حريق في طابق أعلى — غادر بهدوء عبر الدرج" },
    lockedFacts: [ZONE, FLOOR, ASSEMBLY],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["stay in your flat", "ابقَ في شقتك"],
    templates: {
      en: {
        standard: {
          headline: `Fire above you in ${ZONE} — leave calmly by the stairs`,
          body: `Civil Defence has confirmed a fire on ${FLOOR} of ${ZONE}. Leave the building now by the stairs and gather at ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "Leave now by the nearest stairs. Do not use lifts." },
            { id: "b2", text: "Take only your phone and keys. Do not stop to collect belongings." },
            { id: "b3", text: "Keep to one side of the stairs so firefighters can pass." },
            { id: "b4", text: "Help a neighbour only if it is safe for you to do so." },
            { id: "b5", text: `Once you are out, go to ${ASSEMBLY} and tap “I'm out”. Do not go back inside.` },
          ],
        },
        plain: {
          headline: "Fire upstairs. Leave now by the stairs.",
          body: `There is a fire on ${FLOOR} of ${ZONE}. Go to ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "Use the stairs. Do not use lifts." },
            { id: "b2", text: "Take your phone and keys only." },
            { id: "b3", text: "Keep to the side of the stairs." },
            { id: "b4", text: "Help others only if you are safe." },
            { id: "b5", text: `When you are out, go to ${ASSEMBLY} and tell us.` },
          ],
        },
        audio: {
          headline: "Fire above you in your building. Please leave calmly by the stairs.",
          body: `Civil Defence has confirmed a fire on ${FLOOR} of ${ZONE}. Please leave the building by the stairs, and gather at ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "Step one. Leave by the nearest stairs. Do not use lifts." },
            { id: "b2", text: "Step two. Take only your phone and keys. Do not stop to collect belongings." },
            { id: "b3", text: "Step three. Keep to one side of the stairs, so firefighters can pass." },
            { id: "b4", text: "Step four. Help a neighbour only if it is safe for you to do so." },
            { id: "b5", text: `Step five. Once you are out, go to ${ASSEMBLY}, and use the I'm out button. Do not go back inside.` },
          ],
        },
      },
      ar: {
        standard: {
          headline: `حريق في طابق أعلى منك في ${ZONE} — غادر بهدوء عبر الدرج`,
          body: `أكّد الدفاع المدني وجود حريق في ${FLOOR} من ${ZONE}. غادر المبنى الآن عبر الدرج وتوجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "غادر الآن عبر أقرب درج. لا تستخدم المصاعد." },
            { id: "b2", text: "خذ هاتفك ومفاتيحك فقط، ولا تتوقف لجمع أغراضك." },
            { id: "b3", text: "التزم جانبًا واحدًا من الدرج ليتمكن رجال الإطفاء من المرور." },
            { id: "b4", text: "ساعد جارك فقط إذا كان ذلك آمنًا لك." },
            { id: "b5", text: `بعد خروجك، توجّه إلى ${ASSEMBLY} واضغط «خرجت من المبنى». لا تعد إلى الداخل.` },
          ],
        },
        plain: {
          headline: "حريق في طابق أعلى. غادر الآن عبر الدرج.",
          body: `يوجد حريق في ${FLOOR} من ${ZONE}. توجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "استخدم الدرج. لا تستخدم المصاعد." },
            { id: "b2", text: "خذ هاتفك ومفاتيحك فقط." },
            { id: "b3", text: "التزم جانب الدرج." },
            { id: "b4", text: "ساعد غيرك فقط إذا كنت بأمان." },
            { id: "b5", text: `عندما تخرج، توجّه إلى ${ASSEMBLY} وأخبرنا.` },
          ],
        },
        audio: {
          headline: "حريق في طابق أعلى منك في مبناك. يُرجى المغادرة بهدوء عبر الدرج.",
          body: `أكّد الدفاع المدني وجود حريق في ${FLOOR} من ${ZONE}. يُرجى مغادرة المبنى عبر الدرج، والتوجّه إلى ${ASSEMBLY}.`,
          steps: [
            { id: "b1", text: "الخطوة الأولى. غادر عبر أقرب درج. لا تستخدم المصاعد." },
            { id: "b2", text: "الخطوة الثانية. خذ هاتفك ومفاتيحك فقط، ولا تتوقف لجمع أغراضك." },
            { id: "b3", text: "الخطوة الثالثة. التزم جانبًا واحدًا من الدرج، ليتمكن رجال الإطفاء من المرور." },
            { id: "b4", text: "الخطوة الرابعة. ساعد جارك فقط إذا كان ذلك آمنًا لك." },
            { id: "b5", text: `الخطوة الخامسة. بعد خروجك، توجّه إلى ${ASSEMBLY}، واستخدم زر خرجت من المبنى. لا تعد إلى الداخل.` },
          ],
        },
      },
    },
  },
  {
    id: "ACT-FIRE-SMOKE",
    policyVersion: FIRE_POLICY_VERSION,
    title: { en: "Smoke nearby — keep windows closed", ar: "دخان قريب — أبقِ النوافذ مغلقة" },
    lockedFacts: [ZONE, UNTIL],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["leave the building", "غادر المبنى"],
    templates: {
      en: {
        standard: {
          headline: `Smoke from a fire at ${ZONE} — keep windows closed`,
          body: `Smoke from a confirmed fire at ${ZONE} is drifting over your area until ${UNTIL}. Stay inside and keep the smoke out.`,
          steps: [
            { id: "k1", text: "Stay inside and close all windows and doors." },
            { id: "k2", text: "Switch off air conditioning that brings in outside air, and close vents." },
            { id: "k3", text: "If smoke gets inside or you have trouble breathing, move to a room away from the smoke and tap “I need help”." },
            { id: "k4", text: `Keep the roads near ${ZONE} clear for fire engines.` },
            { id: "k5", text: "Tap “I am safe” or “I need help” so the operations team knows your status." },
          ],
        },
        plain: {
          headline: "Smoke near you. Keep windows closed.",
          body: `There is smoke from a fire at ${ZONE} until ${UNTIL}.`,
          steps: [
            { id: "k1", text: "Stay inside. Close windows and doors." },
            { id: "k2", text: "Turn off air conditioning that takes air from outside." },
            { id: "k3", text: "If smoke comes in or breathing is hard, tell us you need help." },
            { id: "k4", text: `Keep the roads near ${ZONE} clear.` },
            { id: "k5", text: "Tell us if you are safe or if you need help." },
          ],
        },
        audio: {
          headline: "Smoke warning for your area. Please keep windows closed.",
          body: `Smoke from a confirmed fire at ${ZONE} is drifting over your area, until ${UNTIL}. Please stay inside.`,
          steps: [
            { id: "k1", text: "Step one. Stay inside, and close all windows and doors." },
            { id: "k2", text: "Step two. Switch off air conditioning that brings in outside air, and close vents." },
            { id: "k3", text: "Step three. If smoke gets inside, or you have trouble breathing, move to a room away from the smoke, and use the I need help button." },
            { id: "k4", text: `Step four. Keep the roads near ${ZONE} clear for fire engines.` },
            { id: "k5", text: "Step five. Use the I am safe button, or the I need help button, so the operations team knows your status." },
          ],
        },
      },
      ar: {
        standard: {
          headline: `دخان من حريق في ${ZONE} — أبقِ النوافذ مغلقة`,
          body: `يتجه دخان من حريق مؤكَّد في ${ZONE} نحو منطقتك حتى ${UNTIL}. ابقَ في الداخل وامنع دخول الدخان.`,
          steps: [
            { id: "k1", text: "ابقَ في الداخل وأغلق جميع النوافذ والأبواب." },
            { id: "k2", text: "أطفئ المكيّف الذي يسحب الهواء من الخارج، وأغلق فتحات التهوية." },
            { id: "k3", text: "إذا دخل الدخان أو شعرت بصعوبة في التنفس، فانتقل إلى غرفة بعيدة عن الدخان واضغط «أحتاج إلى مساعدة»." },
            { id: "k4", text: `أبقِ الطرق القريبة من ${ZONE} خالية لسيارات الإطفاء.` },
            { id: "k5", text: "اضغط «أنا بخير» أو «أحتاج إلى مساعدة» ليعرف فريق العمليات وضعك." },
          ],
        },
        plain: {
          headline: "دخان قريب منك. أبقِ النوافذ مغلقة.",
          body: `يوجد دخان من حريق في ${ZONE} حتى ${UNTIL}.`,
          steps: [
            { id: "k1", text: "ابقَ في الداخل. أغلق النوافذ والأبواب." },
            { id: "k2", text: "أطفئ المكيّف الذي يأخذ الهواء من الخارج." },
            { id: "k3", text: "إذا دخل الدخان أو صعب التنفس، فأخبرنا أنك تحتاج إلى مساعدة." },
            { id: "k4", text: `أبقِ الطرق القريبة من ${ZONE} خالية.` },
            { id: "k5", text: "أخبرنا إن كنت بخير أو تحتاج إلى مساعدة." },
          ],
        },
        audio: {
          headline: "تحذير من الدخان في منطقتك. يُرجى إبقاء النوافذ مغلقة.",
          body: `يتجه دخان من حريق مؤكَّد في ${ZONE} نحو منطقتك حتى ${UNTIL}. يُرجى البقاء في الداخل.`,
          steps: [
            { id: "k1", text: "الخطوة الأولى. ابقَ في الداخل، وأغلق جميع النوافذ والأبواب." },
            { id: "k2", text: "الخطوة الثانية. أطفئ المكيّف الذي يسحب الهواء من الخارج، وأغلق فتحات التهوية." },
            { id: "k3", text: "الخطوة الثالثة. إذا دخل الدخان، أو شعرت بصعوبة في التنفس، فانتقل إلى غرفة بعيدة عن الدخان، واستخدم زر أحتاج إلى مساعدة." },
            { id: "k4", text: `الخطوة الرابعة. أبقِ الطرق القريبة من ${ZONE} خالية لسيارات الإطفاء.` },
            { id: "k5", text: "الخطوة الخامسة. استخدم زر أنا بخير، أو زر أحتاج إلى مساعدة، ليعرف فريق العمليات وضعك." },
          ],
        },
      },
    },
  },
  {
    id: "ACT-FIRE-ROAD",
    policyVersion: FIRE_POLICY_VERSION,
    title: { en: "Road closed for Civil Defence — do not enter", ar: "طريق مغلق للدفاع المدني — لا تدخل" },
    lockedFacts: [CLOSURE, UNTIL],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["stay indoors", "ابقَ في الداخل"],
    templates: {
      en: {
        standard: {
          headline: `Road closed for Civil Defence: ${CLOSURE}`,
          body: `${CLOSURE} is closed until ${UNTIL} to keep access clear for Civil Defence at a fire in ${ZONE}. Do not enter the closed section. Follow only the directions given by officials on site.`,
          steps: [
            { id: "d1", text: "Do not drive into the closed section." },
            { id: "d2", text: "Pull over and let emergency vehicles pass." },
            { id: "d3", text: "Follow directions from police and traffic officials on site." },
            { id: "d4", text: "When it is safe to stop, tap “I am safe” or “I need help”. Do not use your phone while driving." },
          ],
        },
        plain: {
          headline: `Road closed: ${CLOSURE}`,
          body: `${CLOSURE} is closed until ${UNTIL} for a fire nearby. Do not drive there.`,
          steps: [
            { id: "d1", text: "Do not drive into the closed road." },
            { id: "d2", text: "Move aside for emergency vehicles." },
            { id: "d3", text: "Do what police and traffic officials tell you." },
            { id: "d4", text: "Only when you are stopped safely: tell us if you are safe or need help." },
          ],
        },
        audio: {
          headline: `Road closure on ${CLOSURE}, to keep access clear for Civil Defence. Do not enter.`,
          body: `${CLOSURE} is closed until ${UNTIL}, because of a fire nearby. Follow only the directions given by officials on site.`,
          steps: [
            { id: "d1", text: "Step one. Do not drive into the closed section." },
            { id: "d2", text: "Step two. Pull over, and let emergency vehicles pass." },
            { id: "d3", text: "Step three. Follow directions from police and traffic officials on site." },
            { id: "d4", text: "Step four. Only when it is safe to stop, use the I am safe button, or the I need help button. Do not use your phone while driving." },
          ],
        },
      },
      ar: {
        standard: {
          headline: `طريق مغلق للدفاع المدني: ${CLOSURE}`,
          body: `${CLOSURE} مغلق حتى ${UNTIL} لإبقاء الوصول مفتوحًا أمام الدفاع المدني بسبب حريق في ${ZONE}. لا تدخل الجزء المغلق، واتبع فقط توجيهات المسؤولين في الموقع.`,
          steps: [
            { id: "d1", text: "لا تقُد مركبتك إلى الجزء المغلق." },
            { id: "d2", text: "تنحَّ جانبًا وأفسح المجال لمركبات الطوارئ." },
            { id: "d3", text: "اتبع توجيهات الشرطة ومسؤولي المرور في الموقع." },
            { id: "d4", text: "عندما يكون التوقف آمنًا، اضغط «أنا بخير» أو «أحتاج إلى مساعدة». لا تستخدم هاتفك أثناء القيادة." },
          ],
        },
        plain: {
          headline: `الطريق مغلق: ${CLOSURE}`,
          body: `${CLOSURE} مغلق حتى ${UNTIL} بسبب حريق قريب. لا تقُد هناك.`,
          steps: [
            { id: "d1", text: "لا تدخل الطريق المغلق." },
            { id: "d2", text: "تنحَّ جانبًا لمركبات الطوارئ." },
            { id: "d3", text: "اتبع ما تقوله الشرطة ومسؤولو المرور." },
            { id: "d4", text: "عندما تتوقف في مكان آمن فقط: أخبرنا إن كنت بخير أو تحتاج إلى مساعدة." },
          ],
        },
        audio: {
          headline: `إغلاق طريق على ${CLOSURE} لإبقاء الوصول مفتوحًا أمام الدفاع المدني. لا تدخل.`,
          body: `${CLOSURE} مغلق حتى ${UNTIL} بسبب حريق قريب. اتبع فقط توجيهات المسؤولين في الموقع.`,
          steps: [
            { id: "d1", text: "الخطوة الأولى. لا تقُد مركبتك إلى الجزء المغلق." },
            { id: "d2", text: "الخطوة الثانية. تنحَّ جانبًا، وأفسح المجال لمركبات الطوارئ." },
            { id: "d3", text: "الخطوة الثالثة. اتبع توجيهات الشرطة ومسؤولي المرور في الموقع." },
            { id: "d4", text: "الخطوة الرابعة. فقط عندما يكون التوقف آمنًا، استخدم زر أنا بخير، أو زر أحتاج إلى مساعدة. لا تستخدم هاتفك أثناء القيادة." },
          ],
        },
      },
    },
  },
];
