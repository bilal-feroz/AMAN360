import type { ApprovedAction, SafetyPolicy, Bilingual } from "@/domain/types";

/**
 * POLICY-2026-01 — the authority-defined, versioned safety policy for the training scenario.
 *
 * Everything in this file is *approved content*: the communication layer may select, simplify,
 * translate or reformat it, but may never change the action, the facts, the severity or the
 * geography. Arabic and English wording was written for this prototype and requires expert review
 * of emergency terminology before any real use (see SAFETY_MODEL.md).
 */

export const POLICY_VERSION = "POLICY-2026-01";

export const SAFETY_POLICY: SafetyPolicy = {
  version: POLICY_VERSION,
  name: "Heavy rainfall & localized flooding — public guidance policy (training)",
  effectiveFrom: "2026-01-01T00:00:00+04:00",
  expiresAt: "2026-12-31T23:59:59+04:00",
  status: "active",
  closureApproachMeters: 1500,
  boundaryUncertaintyMeters: 25,
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
      description: {
        en: "The hazard source must be verified before any guidance can be prepared or published.",
        ar: "يجب التحقق من مصدر الخطر قبل إعداد أي إرشادات أو نشرها.",
      },
    },
    {
      id: "R-01-CONFLICT",
      priority: 1,
      outcome: "BLOCK",
      description: {
        en: "Conflicting critical facts block publication and require operator review.",
        ar: "تمنع الحقائق الحرجة المتعارضة النشر وتتطلب مراجعة المشغّل.",
      },
    },
    {
      id: "R-02-EXPIRED",
      priority: 2,
      outcome: "BLOCK",
      description: {
        en: "Expired incidents or expired policies cannot be used to publish guidance.",
        ar: "لا يمكن استخدام الحوادث أو السياسات منتهية الصلاحية لنشر الإرشادات.",
      },
    },
    {
      id: "R-10-NOLOC",
      priority: 10,
      outcome: "REVIEW",
      description: {
        en: "Missing, stale or invalid location: do not infer impact — route to operator review.",
        ar: "الموقع مفقود أو قديم أو غير صالح: لا يُستنتج التأثر — يُحال إلى مراجعة المشغّل.",
      },
    },
    {
      id: "R-20-ZONE",
      priority: 20,
      outcome: "SEND",
      actionId: "ACT-INDOOR-01",
      description: {
        en: "Recipient is inside the verified affected zone (boundary and location uncertainty count as inside).",
        ar: "المستلم داخل المنطقة المتأثرة المؤكدة (يُعدّ الحدّ وهامش عدم دقة الموقع ضمن المنطقة).",
      },
    },
    {
      id: "R-30-CLOSURE",
      priority: 30,
      outcome: "SEND",
      actionId: "ACT-ROAD-02",
      description: {
        en: "Recipient is driving on a shared route that crosses a confirmed road closure.",
        ar: "المستلم يقود على مسار مُشارك يمر عبر إغلاق طريق مؤكد.",
      },
    },
    {
      id: "R-90-OUTSIDE",
      priority: 90,
      outcome: "NO_ACTION",
      description: {
        en: "Recipient is outside the affected zone and not approaching a closure: no emergency instruction is sent.",
        ar: "المستلم خارج المنطقة المتأثرة ولا يقترب من إغلاق: لا تُرسل أي تعليمات طوارئ.",
      },
    },
  ],
};

/** Claims the communication layer may never introduce, in either language. */
export const GLOBAL_FORBIDDEN_CLAIMS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "evacuation", label: "Evacuation instruction", pattern: /evacuat|إخلاء|اخلاء|أخلِ|غادروا المنطقة/i },
  {
    id: "dispatch",
    label: "Claim that emergency services are responding",
    pattern:
      /(ambulance|police|rescue|civil defen[cs]e|responders?|help)\s+(is|are|has been|have been)\s+(dispatched|sent|on (the|its|their) way|coming)|(الإسعاف|الشرطة|الدفاع المدني|فرق الإنقاذ|المساعدة).{0,20}(في الطريق|أُرسلت|ارسلت|تم إرسال|قادمة)/i,
  },
  {
    id: "route",
    label: "Alternative route or detour suggestion",
    pattern: /alternative route|alternate route|detour|instead,? (take|use)|take .{1,30} instead|طريق بديل|مسار بديل|تحويلة|سلوك طريق/i,
  },
  { id: "severity", label: "Severity escalation wording", pattern: /catastroph|extreme danger|life-threatening flood|كارثي|خطر شديد جدا/i },
  { id: "medical", label: "Unsupported medical or rescue guidance", pattern: /\b(cpr|tourniquet|first aid steps)\b|إنعاش قلبي|عاصبة/i },
  { id: "url", label: "Links", pattern: /https?:\/\/|www\./i },
];

const UNTIL = "{{until}}";
const ZONE = "{{zone}}";
const CLOSURE = "{{closure}}";

export const APPROVED_ACTIONS: ApprovedAction[] = [
  {
    id: "ACT-INDOOR-01",
    policyVersion: POLICY_VERSION,
    title: { en: "Stay indoors — flood risk in your area", ar: "البقاء في الداخل — خطر فيضان في منطقتك" },
    lockedFacts: [ZONE, UNTIL],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["drive", "قُد"],
    templates: {
      en: {
        standard: {
          headline: "Flood risk in your area — stay indoors",
          body: `Heavy rainfall has created a verified flood risk in ${ZONE} until ${UNTIL}. Stay indoors and follow these steps.`,
          steps: [
            { id: "s1", text: "Stay inside your building. Go out only if officials instruct you to." },
            { id: "s2", text: "Do not use basements or underground parking while the warning is active." },
            { id: "s3", text: "Keep away from flooded streets, drains and electrical equipment exposed to water." },
            { id: "s4", text: "If water enters your home, move to a higher floor." },
            { id: "s5", text: "Tap “I am safe” or “I need help” so the operations team knows your status." },
          ],
        },
        plain: {
          headline: "Stay inside. There is a flood risk near you.",
          body: `There is a flood risk in ${ZONE} until ${UNTIL}.`,
          steps: [
            { id: "s1", text: "Stay inside." },
            { id: "s2", text: "Do not go to basements or underground parking." },
            { id: "s3", text: "Stay away from water in the street." },
            { id: "s4", text: "If water comes inside, go upstairs." },
            { id: "s5", text: "Tell us if you are safe or if you need help." },
          ],
        },
        audio: {
          headline: "Flood risk warning for your area. Please stay indoors.",
          body: `A verified flood risk is in effect for ${ZONE}, until ${UNTIL}. Please stay indoors.`,
          steps: [
            { id: "s1", text: "Step one. Stay inside your building. Go out only if officials instruct you to." },
            { id: "s2", text: "Step two. Do not use basements or underground parking while the warning is active." },
            { id: "s3", text: "Step three. Keep away from flooded streets, drains, and electrical equipment exposed to water." },
            { id: "s4", text: "Step four. If water enters your home, move to a higher floor." },
            { id: "s5", text: "Step five. Use the I am safe button, or the I need help button, so the operations team knows your status." },
          ],
        },
      },
      ar: {
        standard: {
          headline: "خطر فيضان في منطقتك — يُرجى البقاء في الداخل",
          body: `تسبّبت الأمطار الغزيرة في خطر فيضان مؤكَّد في ${ZONE} حتى ${UNTIL}. يُرجى البقاء في الداخل واتباع الخطوات التالية.`,
          steps: [
            { id: "s1", text: "ابقَ داخل المبنى، ولا تخرج إلا بتوجيه من الجهات المختصة." },
            { id: "s2", text: "لا تستخدم الطوابق السفلية أو مواقف السيارات تحت الأرض طوال فترة التحذير." },
            { id: "s3", text: "ابتعد عن الشوارع المغمورة بالمياه وفتحات التصريف والمعدات الكهربائية المعرّضة للمياه." },
            { id: "s4", text: "إذا دخلت المياه إلى منزلك، فانتقل إلى طابق أعلى." },
            { id: "s5", text: "اضغط «أنا بخير» أو «أحتاج إلى مساعدة» ليعرف فريق العمليات وضعك." },
          ],
        },
        plain: {
          headline: "ابقَ في الداخل. يوجد خطر فيضان قريب منك.",
          body: `يوجد خطر فيضان في ${ZONE} حتى ${UNTIL}.`,
          steps: [
            { id: "s1", text: "ابقَ في الداخل." },
            { id: "s2", text: "لا تنزل إلى الطوابق السفلية أو المواقف تحت الأرض." },
            { id: "s3", text: "ابتعد عن المياه في الشارع." },
            { id: "s4", text: "إذا دخلت المياه، فاصعد إلى طابق أعلى." },
            { id: "s5", text: "أخبرنا إن كنت بخير أو تحتاج إلى مساعدة." },
          ],
        },
        audio: {
          headline: "تحذير من خطر فيضان في منطقتك. يُرجى البقاء في الداخل.",
          body: `يوجد خطر فيضان مؤكَّد في ${ZONE} حتى ${UNTIL}. يُرجى البقاء في الداخل.`,
          steps: [
            { id: "s1", text: "الخطوة الأولى. ابقَ داخل المبنى، ولا تخرج إلا بتوجيه من الجهات المختصة." },
            { id: "s2", text: "الخطوة الثانية. لا تستخدم الطوابق السفلية أو مواقف السيارات تحت الأرض طوال فترة التحذير." },
            { id: "s3", text: "الخطوة الثالثة. ابتعد عن الشوارع المغمورة بالمياه وفتحات التصريف والمعدات الكهربائية المعرّضة للمياه." },
            { id: "s4", text: "الخطوة الرابعة. إذا دخلت المياه إلى منزلك، فانتقل إلى طابق أعلى." },
            { id: "s5", text: "الخطوة الخامسة. استخدم زر أنا بخير، أو زر أحتاج إلى مساعدة، ليعرف فريق العمليات وضعك." },
          ],
        },
      },
    },
  },
  {
    id: "ACT-ROAD-02",
    policyVersion: POLICY_VERSION,
    title: { en: "Confirmed road closure ahead — do not enter", ar: "إغلاق طريق مؤكَّد أمامك — لا تدخل" },
    lockedFacts: [CLOSURE, UNTIL],
    allowedOperations: ["select_template", "simplify", "translate", "reformat", "explain"],
    forbiddenTerms: ["stay indoors", "ابقَ في الداخل"],
    templates: {
      en: {
        standard: {
          headline: `Road closed ahead: ${CLOSURE}`,
          body: `A confirmed closure is in place on ${CLOSURE} because of flood risk, until ${UNTIL}. Do not enter the closed section. Follow only the directions given by officials on site.`,
          steps: [
            { id: "r1", text: "Do not drive into the closed section or through standing water." },
            { id: "r2", text: "Follow directions from police and traffic officials on site." },
            { id: "r3", text: "Slow down and keep a safe distance — visibility and road grip may be reduced." },
            { id: "r4", text: "When it is safe to stop, tap “I am safe” or “I need help”. Do not use your phone while driving." },
          ],
        },
        plain: {
          headline: `Road closed: ${CLOSURE}`,
          body: `${CLOSURE} is closed until ${UNTIL}. Do not drive there. Follow officials on site.`,
          steps: [
            { id: "r1", text: "Do not drive into the closed road or into water." },
            { id: "r2", text: "Do what police and traffic officials tell you." },
            { id: "r3", text: "Drive slowly and keep space from other cars." },
            { id: "r4", text: "Only when you are stopped safely: tell us if you are safe or need help." },
          ],
        },
        audio: {
          headline: `Road closure ahead on ${CLOSURE}. Do not enter.`,
          body: `A confirmed closure is in place on ${CLOSURE}, until ${UNTIL}, because of flood risk. Follow only the directions given by officials on site.`,
          steps: [
            { id: "r1", text: "Step one. Do not drive into the closed section, or through standing water." },
            { id: "r2", text: "Step two. Follow directions from police and traffic officials on site." },
            { id: "r3", text: "Step three. Slow down and keep a safe distance. Visibility and road grip may be reduced." },
            { id: "r4", text: "Step four. Only when it is safe to stop, use the I am safe button, or the I need help button. Do not use your phone while driving." },
          ],
        },
      },
      ar: {
        standard: {
          headline: `طريق مغلق أمامك: ${CLOSURE}`,
          body: `يوجد إغلاق مؤكَّد على ${CLOSURE} بسبب خطر الفيضان حتى ${UNTIL}. لا تدخل الجزء المغلق، واتبع فقط توجيهات المسؤولين في الموقع.`,
          steps: [
            { id: "r1", text: "لا تقُد مركبتك إلى الجزء المغلق أو عبر المياه المتجمّعة." },
            { id: "r2", text: "اتبع توجيهات الشرطة ومسؤولي المرور في الموقع." },
            { id: "r3", text: "خفّف السرعة وحافظ على مسافة آمنة — فقد تقلّ الرؤية وتماسك الطريق." },
            { id: "r4", text: "عندما يكون التوقف آمنًا، اضغط «أنا بخير» أو «أحتاج إلى مساعدة». لا تستخدم هاتفك أثناء القيادة." },
          ],
        },
        plain: {
          headline: `الطريق مغلق: ${CLOSURE}`,
          body: `${CLOSURE} مغلق حتى ${UNTIL}. لا تقُد هناك، واتبع المسؤولين في الموقع.`,
          steps: [
            { id: "r1", text: "لا تدخل الطريق المغلق ولا تقُد في المياه." },
            { id: "r2", text: "اتبع ما تقوله الشرطة ومسؤولو المرور." },
            { id: "r3", text: "قُد ببطء واترك مسافة بينك وبين السيارات الأخرى." },
            { id: "r4", text: "عندما تتوقف في مكان آمن فقط: أخبرنا إن كنت بخير أو تحتاج إلى مساعدة." },
          ],
        },
        audio: {
          headline: `إغلاق طريق أمامك على ${CLOSURE}. لا تدخل.`,
          body: `يوجد إغلاق مؤكَّد على ${CLOSURE} حتى ${UNTIL} بسبب خطر الفيضان. اتبع فقط توجيهات المسؤولين في الموقع.`,
          steps: [
            { id: "r1", text: "الخطوة الأولى. لا تقُد مركبتك إلى الجزء المغلق، أو عبر المياه المتجمّعة." },
            { id: "r2", text: "الخطوة الثانية. اتبع توجيهات الشرطة ومسؤولي المرور في الموقع." },
            { id: "r3", text: "الخطوة الثالثة. خفّف السرعة وحافظ على مسافة آمنة، فقد تقلّ الرؤية وتماسك الطريق." },
            { id: "r4", text: "الخطوة الرابعة. فقط عندما يكون التوقف آمنًا، استخدم زر أنا بخير، أو زر أحتاج إلى مساعدة. لا تستخدم هاتفك أثناء القيادة." },
          ],
        },
      },
    },
  },
];

// The "drive" forbidden term for ACT-INDOOR-01 must not trip on approved wording; keep exact-word checks.
export function actionById(id: string): ApprovedAction | undefined {
  return APPROVED_ACTIONS.find((a) => a.id === id);
}

/** Approved clarifications: the only answers the clarification flow may give. */
export interface ApprovedAnswer {
  id: string;
  question: Bilingual;
  answer: Bilingual;
  keywords: { en: string[]; ar: string[] };
  appliesTo: string[]; // action ids
}

export const APPROVED_ANSWERS: ApprovedAnswer[] = [
  {
    id: "Q-DRIVE",
    question: { en: "Is it safe to drive?", ar: "هل القيادة آمنة؟" },
    answer: {
      en: `Avoid driving in the warning area until ${UNTIL}. ${CLOSURE} is closed. Follow only the directions given by officials on site.`,
      ar: `تجنّب القيادة في منطقة التحذير حتى ${UNTIL}. ${CLOSURE} مغلق. اتبع فقط توجيهات المسؤولين في الموقع.`,
    },
    keywords: { en: ["drive", "driving", "car", "road", "go out by car"], ar: ["قيادة", "القيادة", "أقود", "سيارة", "السيارة", "الطريق"] },
    appliesTo: ["ACT-INDOOR-01", "ACT-ROAD-02"],
  },
  {
    id: "Q-UNTIL",
    question: { en: "How long will the warning last?", ar: "متى ينتهي التحذير؟" },
    answer: {
      en: `The warning is valid until ${UNTIL}. You will receive an update in AMAN if this changes.`,
      ar: `التحذير ساري حتى ${UNTIL}. ستصلك رسالة تحديث عبر أمان إذا تغيّر ذلك.`,
    },
    keywords: { en: ["how long", "until", "end", "when", "last", "over"], ar: ["متى", "ينتهي", "حتى", "مدة", "كم"] },
    appliesTo: ["ACT-INDOOR-01", "ACT-ROAD-02"],
  },
  {
    id: "Q-PARKING",
    question: { en: "Can I move my car from the underground parking?", ar: "هل يمكنني نقل سيارتي من الموقف تحت الأرض؟" },
    answer: {
      en: "No. Do not use basements or underground parking while the warning is active.",
      ar: "لا. لا تستخدم الطوابق السفلية أو مواقف السيارات تحت الأرض طوال فترة التحذير.",
    },
    keywords: { en: ["parking", "basement", "garage", "underground", "move my car"], ar: ["موقف", "المواقف", "الموقف", "تحت الأرض", "الطابق السفلي", "القبو"] },
    appliesTo: ["ACT-INDOOR-01"],
  },
  {
    id: "Q-HELP",
    question: { en: "How do I get help?", ar: "كيف أحصل على المساعدة؟" },
    answer: {
      en: "Tap “I need help”. The operations team will review your request. In a life-threatening emergency, call 999.",
      ar: "اضغط «أحتاج إلى مساعدة»، وسيراجع فريق العمليات طلبك. في حالة الطوارئ التي تهدد الحياة، اتصل بالرقم 999.",
    },
    keywords: { en: ["help", "assist", "emergency", "call"], ar: ["مساعدة", "المساعدة", "النجدة", "طوارئ", "اتصل"] },
    appliesTo: ["ACT-INDOOR-01", "ACT-ROAD-02"],
  },
];

/** Predefined questions offered in the citizen app (subset of approved answers + two that escalate). */
export const PREDEFINED_QUESTIONS: { id: string; question: Bilingual }[] = [
  ...APPROVED_ANSWERS.map((a) => ({ id: a.id, question: a.question })),
  { id: "Q-SHELTER", question: { en: "Where is the nearest shelter?", ar: "أين أقرب مركز إيواء؟" } },
  { id: "Q-WATER-LEVEL", question: { en: "Will the water reach my building?", ar: "هل ستصل المياه إلى مبناي؟" } },
];
