import type { Lang } from "../types";
import { detectLanguage } from "../language";
import { formatUntil, type MessageFacts } from "./facts";
import { isEscalationTopic } from "./classify";

/**
 * Two-way SMS for phones without mobile data (U-Report style: numbered replies, any handset).
 *
 * Outbound text comes only from the short approved templates below, with facts filled in by
 * code. Replies are parsed deterministically: a leading 1 / 2 / 3 (in any digit script), then
 * keywords in each language. Anything else is never dropped: a short unknown reply gets the menu
 * again, a longer one is passed to a person on the operations team.
 *
 * English and Arabic follow the approved in-app wording. The other languages are drafts that
 * need native-speaker sign-off before real use (see SMS_REVIEW).
 */

export const SMS_LANGS = ["en", "ar", "hi", "ur", "ml", "bn", "tl"] as const;
export type SmsLang = (typeof SMS_LANGS)[number];
export const isSmsLang = (x: unknown): x is SmsLang => SMS_LANGS.includes(x as SmsLang);

/** Translation status of each language's templates. */
export const SMS_REVIEW: Record<SmsLang, "approved" | "needs_native_review"> = {
  en: "approved",
  ar: "approved",
  hi: "needs_native_review",
  ur: "needs_native_review",
  ml: "needs_native_review",
  bn: "needs_native_review",
  tl: "needs_native_review",
};

type Texts = Record<SmsLang, string>;

const ALERTS: Record<string, Texts> = {
  "ACT-INDOOR-01": {
    en: "AMAN Sharjah: Flood risk in {zone} until {until}. Stay indoors. Avoid basements, underground parking and flooded streets.",
    ar: "أمان الشارقة: خطر فيضان في {zone} حتى {until}. ابقَ في الداخل وتجنّب الطوابق السفلية والمواقف تحت الأرض والشوارع المغمورة.",
    hi: "AMAN शारजाह: {zone} में {until} तक बाढ़ का खतरा। घर के अंदर रहें। बेसमेंट, भूमिगत पार्किंग और पानी भरी सड़कों से दूर रहें।",
    ur: "امان شارجہ: {zone} میں {until} تک سیلاب کا خطرہ۔ گھر کے اندر رہیں۔ تہہ خانے، زیرِ زمین پارکنگ اور پانی والی سڑکوں سے دور رہیں۔",
    ml: "AMAN ഷാർജ: {zone} ഭാഗത്ത് {until} വരെ വെള്ളപ്പൊക്ക സാധ്യത. വീടിനുള്ളിൽ തുടരുക. ബേസ്മെന്റ്, ഭൂഗർഭ പാർക്കിംഗ്, വെള്ളം കയറിയ റോഡുകൾ ഒഴിവാക്കുക.",
    bn: "AMAN শারজাহ: {zone} এলাকায় {until} পর্যন্ত বন্যার ঝুঁকি। ঘরের ভিতরে থাকুন। বেসমেন্ট, মাটির নিচের পার্কিং ও পানি জমা রাস্তা এড়িয়ে চলুন।",
    tl: "AMAN Sharjah: May panganib ng baha sa {zone} hanggang {until}. Manatili sa loob. Iwasan ang basement, underground parking at bahang kalye.",
  },
  "ACT-ROAD-02": {
    en: "AMAN Sharjah: {closure} is closed until {until} due to flood risk. Do not enter. Follow officials on site. Do not text while driving.",
    ar: "أمان الشارقة: {closure} مغلق حتى {until} بسبب خطر الفيضان. لا تدخل واتبع توجيهات المسؤولين في الموقع. لا تستخدم هاتفك أثناء القيادة.",
    hi: "AMAN शारजाह: बाढ़ के खतरे के कारण {closure} {until} तक बंद है। अंदर न जाएं। मौके पर मौजूद अधिकारियों का पालन करें। गाड़ी चलाते समय मैसेज न करें।",
    ur: "امان شارجہ: سیلاب کے خطرے کی وجہ سے {closure} {until} تک بند ہے۔ اندر نہ جائیں۔ موقع پر موجود اہلکاروں کی ہدایات پر عمل کریں۔ گاڑی چلاتے ہوئے میسج نہ کریں۔",
    ml: "AMAN ഷാർജ: വെള്ളപ്പൊക്ക സാധ്യത കാരണം {closure} {until} വരെ അടച്ചിരിക്കുന്നു. പ്രവേശിക്കരുത്. സ്ഥലത്തെ ഉദ്യോഗസ്ഥരുടെ നിർദേശം പാലിക്കുക. വാഹനമോടിക്കുമ്പോൾ മെസേജ് അയക്കരുത്.",
    bn: "AMAN শারজাহ: বন্যার ঝুঁকির কারণে {closure} {until} পর্যন্ত বন্ধ। প্রবেশ করবেন না। ঘটনাস্থলের কর্মকর্তাদের নির্দেশ মানুন। গাড়ি চালানোর সময় মেসেজ করবেন না।",
    tl: "AMAN Sharjah: Sarado ang {closure} hanggang {until} dahil sa panganib ng baha. Huwag pumasok. Sundin ang mga opisyal sa lugar. Huwag mag-text habang nagmamaneho.",
  },
};

const MENU: Texts = {
  en: "Reply 1 = I am safe, 2 = I need help, 3 = Question. Life in danger? Call 999.",
  ar: "للرد: 1 = أنا بخير، 2 = أحتاج مساعدة، 3 = سؤال. الحياة في خطر؟ اتصل 999.",
  hi: "जवाब दें: 1 = मैं सुरक्षित हूँ, 2 = मुझे मदद चाहिए, 3 = सवाल। जान को खतरा? 999 पर कॉल करें।",
  ur: "جواب دیں: 1 = میں محفوظ ہوں، 2 = مجھے مدد چاہیے، 3 = سوال۔ جان کو خطرہ؟ 999 پر کال کریں۔",
  ml: "മറുപടി: 1 = സുരക്ഷിതം, 2 = സഹായം വേണം, 3 = ചോദ്യം. ജീവന് അപകടമുണ്ടെങ്കിൽ 999 വിളിക്കുക.",
  bn: "উত্তর দিন: 1 = আমি নিরাপদ, 2 = সাহায্য দরকার, 3 = প্রশ্ন। জীবন ঝুঁকিতে? 999-এ কল করুন।",
  tl: "Sumagot: 1 = Ligtas ako, 2 = Kailangan ko ng tulong, 3 = Tanong. Nasa panganib ang buhay? Tumawag sa 999.",
};

const REPLIES: Record<"safe" | "help" | "help_details" | "ask" | "escalated" | "forwarded" | "unknown" | "no_alert" | "lang_set" | "closed", Texts> = {
  safe: {
    en: "AMAN: Thank you. We have recorded that you are safe. Reply 2 at any time if you need help.",
    ar: "أمان: شكرًا لك. سجّلنا أنك بخير. أرسل 2 في أي وقت إذا احتجت إلى مساعدة.",
    hi: "AMAN: धन्यवाद। हमने दर्ज कर लिया है कि आप सुरक्षित हैं। मदद चाहिए तो कभी भी 2 भेजें।",
    ur: "امان: شکریہ۔ ہم نے درج کر لیا ہے کہ آپ محفوظ ہیں۔ مدد چاہیے تو کسی بھی وقت 2 بھیجیں۔",
    ml: "AMAN: നന്ദി. നിങ്ങൾ സുരക്ഷിതരാണെന്ന് രേഖപ്പെടുത്തി. സഹായം വേണമെങ്കിൽ എപ്പോൾ വേണമെങ്കിലും 2 അയക്കുക.",
    bn: "AMAN: ধন্যবাদ। আপনি নিরাপদ আছেন বলে আমরা লিখে রেখেছি। সাহায্য লাগলে যেকোনো সময় 2 পাঠান।",
    tl: "AMAN: Salamat. Naitala naming ligtas ka. Mag-reply ng 2 anumang oras kung kailangan mo ng tulong.",
  },
  help: {
    en: "AMAN: Your help request is recorded. An operator will review it. Reply with details: what is happening and how many people. If life is in danger, call 999.",
    ar: "أمان: سُجّل طلب المساعدة وسيراجعه أحد المشغّلين. أرسل التفاصيل: ماذا يحدث وكم عدد الأشخاص. إذا كانت الحياة في خطر، اتصل 999.",
    hi: "AMAN: आपका मदद अनुरोध दर्ज हो गया है। एक ऑपरेटर इसे देखेगा। जानकारी भेजें: क्या हो रहा है और कितने लोग हैं। जान को खतरा हो तो 999 पर कॉल करें।",
    ur: "امان: آپ کی مدد کی درخواست درج ہو گئی ہے۔ ایک آپریٹر اسے دیکھے گا۔ تفصیل بھیجیں: کیا ہو رہا ہے اور کتنے لوگ ہیں۔ جان کو خطرہ ہو تو 999 پر کال کریں۔",
    ml: "AMAN: നിങ്ങളുടെ സഹായ അഭ്യർത്ഥന രേഖപ്പെടുത്തി. ഒരു ഓപ്പറേറ്റർ പരിശോധിക്കും. എന്താണ് സംഭവിക്കുന്നത്, എത്ര പേർ ഉണ്ട് എന്ന് അയക്കുക. ജീവന് അപകടമുണ്ടെങ്കിൽ 999 വിളിക്കുക.",
    bn: "AMAN: আপনার সাহায্যের অনুরোধ লিখে রাখা হয়েছে। একজন অপারেটর এটি দেখবেন। বিবরণ পাঠান: কী হচ্ছে এবং কতজন আছেন। জীবন ঝুঁকিতে থাকলে 999-এ কল করুন।",
    tl: "AMAN: Naitala ang iyong hiling na tulong. Susuriin ito ng isang operator. Ipadala ang detalye: ano ang nangyayari at ilan kayo. Kung nasa panganib ang buhay, tumawag sa 999.",
  },
  help_details: {
    en: "AMAN: Your help request and details are recorded. An operator will review it. This is not an emergency call. If life is in danger, call 999.",
    ar: "أمان: سُجّل طلب المساعدة والتفاصيل، وسيراجعه أحد المشغّلين. هذه ليست مكالمة طوارئ. إذا كانت الحياة في خطر، اتصل 999.",
    hi: "AMAN: आपका मदद अनुरोध और जानकारी दर्ज हो गई है। एक ऑपरेटर इसे देखेगा। यह आपातकालीन कॉल नहीं है। जान को खतरा हो तो 999 पर कॉल करें।",
    ur: "امان: آپ کی مدد کی درخواست اور تفصیل درج ہو گئی ہے۔ ایک آپریٹر اسے دیکھے گا۔ یہ ایمرجنسی کال نہیں ہے۔ جان کو خطرہ ہو تو 999 پر کال کریں۔",
    ml: "AMAN: നിങ്ങളുടെ സഹായ അഭ്യർത്ഥനയും വിവരങ്ങളും രേഖപ്പെടുത്തി. ഒരു ഓപ്പറേറ്റർ പരിശോധിക്കും. ഇത് എമർജൻസി കോൾ അല്ല. ജീവന് അപകടമുണ്ടെങ്കിൽ 999 വിളിക്കുക.",
    bn: "AMAN: আপনার সাহায্যের অনুরোধ ও বিবরণ লিখে রাখা হয়েছে। একজন অপারেটর এটি দেখবেন। এটি জরুরি কল নয়। জীবন ঝুঁকিতে থাকলে 999-এ কল করুন।",
    tl: "AMAN: Naitala ang iyong hiling na tulong at mga detalye. Susuriin ito ng isang operator. Hindi ito emergency call. Kung nasa panganib ang buhay, tumawag sa 999.",
  },
  ask: {
    en: "AMAN: Send your question in one message. Only official answers are sent. Example: Is it safe to drive?",
    ar: "أمان: أرسل سؤالك في رسالة واحدة. نرسل الإجابات الرسمية فقط. مثال: هل القيادة آمنة؟",
    hi: "AMAN: अपना सवाल एक मैसेज में भेजें। केवल आधिकारिक जवाब भेजे जाते हैं। उदाहरण: क्या गाड़ी चलाना सुरक्षित है?",
    ur: "امان: اپنا سوال ایک میسج میں بھیجیں۔ صرف سرکاری جواب بھیجے جاتے ہیں۔ مثال: کیا گاڑی چلانا محفوظ ہے؟",
    ml: "AMAN: നിങ്ങളുടെ ചോദ്യം ഒരു മെസേജിൽ അയക്കുക. ഔദ്യോഗിക മറുപടികൾ മാത്രമേ അയക്കൂ. ഉദാ: വാഹനമോടിക്കുന്നത് സുരക്ഷിതമാണോ?",
    bn: "AMAN: আপনার প্রশ্ন একটি মেসেজে পাঠান। শুধু সরকারি উত্তর পাঠানো হয়। উদাহরণ: গাড়ি চালানো কি নিরাপদ?",
    tl: "AMAN: Ipadala ang iyong tanong sa isang mensahe. Opisyal na sagot lamang ang ipinapadala. Halimbawa: Ligtas bang magmaneho?",
  },
  escalated: {
    en: "AMAN: Thank you. There is no approved answer yet, so your question was passed to the operations team. Follow only official updates.",
    ar: "أمان: شكرًا لك. لا توجد إجابة معتمدة بعد، لذلك أُحيل سؤالك إلى فريق العمليات. اتبع التحديثات الرسمية فقط.",
    hi: "AMAN: धन्यवाद। अभी इसका कोई आधिकारिक जवाब नहीं है, इसलिए आपका सवाल ऑपरेशन टीम को भेज दिया गया है। केवल आधिकारिक जानकारी पर भरोसा करें।",
    ur: "امان: شکریہ۔ ابھی اس کا کوئی منظور شدہ جواب نہیں ہے، اس لیے آپ کا سوال آپریشنز ٹیم کو بھیج دیا گیا ہے۔ صرف سرکاری اطلاعات پر عمل کریں۔",
    ml: "AMAN: നന്ദി. ഇതിന് ഇപ്പോൾ അംഗീകൃത മറുപടി ഇല്ലാത്തതിനാൽ നിങ്ങളുടെ ചോദ്യം ഓപ്പറേഷൻസ് ടീമിന് കൈമാറി. ഔദ്യോഗിക അറിയിപ്പുകൾ മാത്രം പിന്തുടരുക.",
    bn: "AMAN: ধন্যবাদ। এখনও কোনো অনুমোদিত উত্তর নেই, তাই আপনার প্রশ্ন অপারেশন টিমের কাছে পাঠানো হয়েছে। শুধু সরকারি তথ্য অনুসরণ করুন।",
    tl: "AMAN: Salamat. Wala pang aprubadong sagot, kaya ipinasa ang iyong tanong sa operations team. Sundin lamang ang mga opisyal na update.",
  },
  forwarded: {
    en: "AMAN: Thank you. A person on the operations team will read your message. Reply 2 if you need help. Life in danger? Call 999.",
    ar: "أمان: شكرًا لك. سيقرأ أحد أفراد فريق العمليات رسالتك. أرسل 2 إذا احتجت إلى مساعدة. الحياة في خطر؟ اتصل 999.",
    hi: "AMAN: धन्यवाद। ऑपरेशन टीम का एक व्यक्ति आपका मैसेज पढ़ेगा। मदद चाहिए तो 2 भेजें। जान को खतरा? 999 पर कॉल करें।",
    ur: "امان: شکریہ۔ آپریشنز ٹیم کا ایک فرد آپ کا میسج پڑھے گا۔ مدد چاہیے تو 2 بھیجیں۔ جان کو خطرہ؟ 999 پر کال کریں۔",
    ml: "AMAN: നന്ദി. ഓപ്പറേഷൻസ് ടീമിലെ ഒരാൾ നിങ്ങളുടെ മെസേജ് വായിക്കും. സഹായം വേണമെങ്കിൽ 2 അയക്കുക. ജീവന് അപകടമുണ്ടെങ്കിൽ 999 വിളിക്കുക.",
    bn: "AMAN: ধন্যবাদ। অপারেশন টিমের একজন আপনার মেসেজ পড়বেন। সাহায্য লাগলে 2 পাঠান। জীবন ঝুঁকিতে? 999-এ কল করুন।",
    tl: "AMAN: Salamat. Babasahin ng isang tao sa operations team ang iyong mensahe. Mag-reply ng 2 kung kailangan mo ng tulong. Nasa panganib ang buhay? Tumawag sa 999.",
  },
  unknown: {
    en: "AMAN: Sorry, we did not understand.",
    ar: "أمان: عذرًا، لم نفهم رسالتك.",
    hi: "AMAN: माफ़ कीजिए, हम समझ नहीं पाए।",
    ur: "امان: معذرت، ہم سمجھ نہیں سکے۔",
    ml: "AMAN: ക്ഷമിക്കണം, മനസ്സിലായില്ല.",
    bn: "AMAN: দুঃখিত, আমরা বুঝতে পারিনি।",
    tl: "AMAN: Paumanhin, hindi namin naintindihan.",
  },
  no_alert: {
    en: "AMAN: There is no active alert for your number right now. In an emergency, call 999.",
    ar: "أمان: لا يوجد تنبيه نشط لرقمك الآن. في حالات الطوارئ، اتصل 999.",
    hi: "AMAN: अभी आपके नंबर के लिए कोई सक्रिय चेतावनी नहीं है। आपात स्थिति में 999 पर कॉल करें।",
    ur: "امان: اس وقت آپ کے نمبر کے لیے کوئی فعال وارننگ نہیں ہے۔ ایمرجنسی میں 999 پر کال کریں۔",
    ml: "AMAN: ഇപ്പോൾ നിങ്ങളുടെ നമ്പറിന് സജീവ മുന്നറിയിപ്പുകളൊന്നുമില്ല. അടിയന്തര സാഹചര്യത്തിൽ 999 വിളിക്കുക.",
    bn: "AMAN: এখন আপনার নম্বরের জন্য কোনো সক্রিয় সতর্কতা নেই। জরুরি অবস্থায় 999-এ কল করুন।",
    tl: "AMAN: Walang aktibong babala para sa iyong numero ngayon. Sa emergency, tumawag sa 999.",
  },
  closed: {
    en: "AMAN: This alert has ended. Thank you. In an emergency, call 999.",
    ar: "أمان: انتهى هذا التنبيه. شكرًا لك. في حالات الطوارئ، اتصل 999.",
    hi: "AMAN: यह चेतावनी समाप्त हो गई है। धन्यवाद। आपात स्थिति में 999 पर कॉल करें।",
    ur: "امان: یہ وارننگ ختم ہو گئی ہے۔ شکریہ۔ ایمرجنسی میں 999 پر کال کریں۔",
    ml: "AMAN: ഈ മുന്നറിയിപ്പ് അവസാനിച്ചു. നന്ദി. അടിയന്തര സാഹചര്യത്തിൽ 999 വിളിക്കുക.",
    bn: "AMAN: এই সতর্কতা শেষ হয়েছে। ধন্যবাদ। জরুরি অবস্থায় 999-এ কল করুন।",
    tl: "AMAN: Tapos na ang babalang ito. Salamat. Sa emergency, tumawag sa 999.",
  },
  lang_set: {
    en: "AMAN: Messages will now be in English.",
    ar: "أمان: ستصلك الرسائل الآن باللغة العربية.",
    hi: "AMAN: अब संदेश हिन्दी में आएंगे।",
    ur: "امان: اب پیغامات اردو میں آئیں گے۔",
    ml: "AMAN: ഇനി സന്ദേശങ്ങൾ മലയാളത്തിൽ ലഭിക്കും.",
    bn: "AMAN: এখন থেকে বার্তা বাংলায় আসবে।",
    tl: "AMAN: Tagalog na ang mga mensahe mula ngayon.",
  },
};

/** Short SMS versions of the approved answers (same ids as APPROVED_ANSWERS). */
const ANSWERS: Record<string, Texts> = {
  "Q-DRIVE": {
    en: "AMAN: Avoid driving in the warning area until {until}. {closure} is closed. Follow only officials on site.",
    ar: "أمان: تجنّب القيادة في منطقة التحذير حتى {until}. {closure} مغلق. اتبع فقط توجيهات المسؤولين في الموقع.",
    hi: "AMAN: {until} तक चेतावनी वाले इलाके में गाड़ी न चलाएं। {closure} बंद है। केवल मौके पर मौजूद अधिकारियों का पालन करें।",
    ur: "امان: {until} تک وارننگ والے علاقے میں گاڑی نہ چلائیں۔ {closure} بند ہے۔ صرف موقع پر موجود اہلکاروں کی ہدایات پر عمل کریں۔",
    ml: "AMAN: {until} വരെ മുന്നറിയിപ്പ് പ്രദേശത്ത് വാഹനമോടിക്കരുത്. {closure} അടച്ചിരിക്കുന്നു. സ്ഥലത്തെ ഉദ്യോഗസ്ഥരുടെ നിർദേശം മാത്രം പാലിക്കുക.",
    bn: "AMAN: {until} পর্যন্ত সতর্কতা এলাকায় গাড়ি চালাবেন না। {closure} বন্ধ। শুধু ঘটনাস্থলের কর্মকর্তাদের নির্দেশ মানুন।",
    tl: "AMAN: Iwasang magmaneho sa lugar ng babala hanggang {until}. Sarado ang {closure}. Sundin lamang ang mga opisyal sa lugar.",
  },
  "Q-UNTIL": {
    en: "AMAN: The warning is valid until {until}. We will text you if this changes.",
    ar: "أمان: التحذير ساري حتى {until}. سنرسل لك رسالة إذا تغيّر ذلك.",
    hi: "AMAN: चेतावनी {until} तक लागू है। बदलाव होने पर हम आपको मैसेज करेंगे।",
    ur: "امان: وارننگ {until} تک نافذ ہے۔ تبدیلی ہونے پر ہم آپ کو میسج کریں گے۔",
    ml: "AMAN: മുന്നറിയിപ്പ് {until} വരെ നിലവിലുണ്ട്. മാറ്റമുണ്ടായാൽ ഞങ്ങൾ മെസേജ് അയക്കും.",
    bn: "AMAN: সতর্কতা {until} পর্যন্ত বহাল। পরিবর্তন হলে আমরা আপনাকে মেসেজ করব।",
    tl: "AMAN: May bisa ang babala hanggang {until}. Magte-text kami kung may pagbabago.",
  },
  "Q-PARKING": {
    en: "AMAN: No. Do not use basements or underground parking while the warning is active.",
    ar: "أمان: لا. لا تستخدم الطوابق السفلية أو المواقف تحت الأرض طوال فترة التحذير.",
    hi: "AMAN: नहीं। चेतावनी के दौरान बेसमेंट या भूमिगत पार्किंग का उपयोग न करें।",
    ur: "امان: نہیں۔ وارننگ کے دوران تہہ خانے یا زیرِ زمین پارکنگ استعمال نہ کریں۔",
    ml: "AMAN: ഇല്ല. മുന്നറിയിപ്പ് നിലവിലുള്ളപ്പോൾ ബേസ്മെന്റോ ഭൂഗർഭ പാർക്കിംഗോ ഉപയോഗിക്കരുത്.",
    bn: "AMAN: না। সতর্কতা চলাকালীন বেসমেন্ট বা মাটির নিচের পার্কিং ব্যবহার করবেন না।",
    tl: "AMAN: Hindi. Huwag gamitin ang basement o underground parking habang may babala.",
  },
  "Q-HELP": {
    en: "AMAN: Reply 2 to ask for help. An operator will review it. If life is in danger, call 999.",
    ar: "أمان: أرسل 2 لطلب المساعدة وسيراجعه أحد المشغّلين. إذا كانت الحياة في خطر، اتصل 999.",
    hi: "AMAN: मदद के लिए 2 भेजें। एक ऑपरेटर इसे देखेगा। जान को खतरा हो तो 999 पर कॉल करें।",
    ur: "امان: مدد کے لیے 2 بھیجیں۔ ایک آپریٹر اسے دیکھے گا۔ جان کو خطرہ ہو تو 999 پر کال کریں۔",
    ml: "AMAN: സഹായത്തിന് 2 അയക്കുക. ഒരു ഓപ്പറേറ്റർ പരിശോധിക്കും. ജീവന് അപകടമുണ്ടെങ്കിൽ 999 വിളിക്കുക.",
    bn: "AMAN: সাহায্যের জন্য 2 পাঠান। একজন অপারেটর এটি দেখবেন। জীবন ঝুঁকিতে থাকলে 999-এ কল করুন।",
    tl: "AMAN: Mag-reply ng 2 para humingi ng tulong. Susuriin ito ng isang operator. Kung nasa panganib ang buhay, tumawag sa 999.",
  },
};

// ---- outbound ------------------------------------------------------------------------------

/** Place names stay in English or Arabic; other languages use the English official name. */
function smsFacts(facts: MessageFacts, lang: SmsLang): Record<string, string> {
  const base: Lang = lang === "ar" ? "ar" : "en";
  const until =
    lang === "en" || lang === "ar"
      ? formatUntil(facts.validUntil, base)
      : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(facts.validUntil));
  // SMS is billed per segment: keep the place, drop the descriptive tail ("Al Majaz — blocks …").
  const short = (s: string) => s.split(" — ")[0].replace(/\s*\([^)]*\)/g, "").trim();
  return { "{zone}": short(facts.zone[base]), "{closure}": short(facts.closure[base]), "{until}": until };
}

const fill = (text: string, v: Record<string, string>) => text.replace(/\{(zone|closure|until)\}/g, (m) => v[m] ?? m);

export function smsAlert(actionId: string, lang: SmsLang, facts: MessageFacts): string | null {
  const t = ALERTS[actionId]?.[lang];
  return t ? `${fill(t, smsFacts(facts, lang))}\n${MENU[lang]}` : null;
}

export type SmsReplyKind = keyof typeof REPLIES;

export function smsReply(kind: SmsReplyKind, lang: SmsLang): string {
  return kind === "unknown" ? `${REPLIES.unknown[lang]} ${MENU[lang]}` : REPLIES[kind][lang];
}

export function smsAnswer(answerId: string, lang: SmsLang, facts: MessageFacts): string | null {
  const t = ANSWERS[answerId]?.[lang];
  return t ? fill(t, smsFacts(facts, lang)) : null;
}

// ---- segments ------------------------------------------------------------------------------

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** How the network would bill this text: GSM-7 fits 160 characters, Unicode (UCS-2) only 70. */
export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; segments: number; chars: number } {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return { encoding: "GSM-7", segments: units <= 160 ? 1 : Math.ceil(units / 153), chars: units };
  const u16 = text.length;
  return { encoding: "UCS-2", segments: u16 <= 70 ? 1 : Math.ceil(u16 / 67), chars: u16 };
}

// ---- inbound -------------------------------------------------------------------------------

const DIGITS: [number, number][] = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic (Urdu, Persian)
  [0x0966, 0x096f], // Devanagari
  [0x09e6, 0x09ef], // Bengali
  [0x0d66, 0x0d6f], // Malayalam
];

export function normaliseDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९০-৯൦-൯]/g, (ch) => {
    const c = ch.charCodeAt(0);
    const range = DIGITS.find(([a, b]) => c >= a && c <= b)!;
    return String(c - range[0]);
  });
}

const HELP_WORDS = [
  "help", "sos", "rescue", "emergency", "trapped", "injured", "urgent",
  "مساعدة", "مساعده", "النجدة", "ساعدوني", "ساعدني", "انقاذ", "إنقاذ", "محاصر", "محاصرين",
  "मदद", "बचाओ", "बचाइए", "सहायता", "फंसे", "फँसे", "madad", "bachao", "bachaao",
  "مدد", "بچاؤ", "بچاو", "پھنسے",
  "സഹായം", "സഹായിക്കൂ", "രക്ഷിക്കൂ", "രക്ഷിക്കണം", "sahayam",
  "সাহায্য", "বাঁচাও", "বাচাও", "আটকে", "sahajjo", "bachao",
  "tulong", "saklolo", "tulungan", "naipit",
];
const SAFE_WORDS = [
  "safe", "i am ok", "im ok", "i'm ok", "all ok", "fine",
  "آمن", "بخير", "سالم", "سالمين",
  "सुरक्षित", "ठीक हूँ", "ठीक हूं", "ठीक है", "surakshit", "theek", "thik",
  "محفوظ", "ٹھیک", "mehfooz", "mahfooz",
  "സുരക്ഷിത", "surakshitham",
  "নিরাপদ", "ভালো আছি", "nirapod", "nirapad",
  "ligtas", "ok lang", "okay lang",
];
const NEGATION = /\b(not|no|never|isn'?t|aren'?t|can'?t|hindi|nahi|nahin)\b|ليس|لست|غير|مش|لا\s|नहीं|नही|نہیں|نہ\s|അല്ല|ഇല്ല|নই|না/i;
const QUESTION_WORDS = /\?|؟|\b(how|when|what|where|why|can i|is it|should|kab|kya|kaise|kahan|kailan|paano|saan|ano|bakit)\b|متى|كيف|هل|أين|اين|ماذا|क्या|कब|कैसे|कहाँ|کیا|کب|کیسے|کہاں|എപ്പോൾ|എങ്ങനെ|എവിടെ|ആണോ|ഉണ്ടോ|কখন|কীভাবে|কি\s|কোথায়/i;

const LANG_ALIASES: Record<string, SmsLang> = {
  en: "en", eng: "en", english: "en",
  ar: "ar", arabic: "ar", "العربية": "ar", "عربي": "ar",
  hi: "hi", hindi: "hi", "हिन्दी": "hi", "हिंदी": "hi",
  ur: "ur", urdu: "ur", "اردو": "ur",
  ml: "ml", malayalam: "ml", "മലയാളം": "ml",
  bn: "bn", bangla: "bn", bengali: "bn", "বাংলা": "bn",
  tl: "tl", fil: "tl", tagalog: "tl", filipino: "tl",
};

export type ParsedSms =
  | { kind: "safe" }
  | { kind: "help"; details: string | null }
  | { kind: "question"; text: string | null }
  | { kind: "language"; lang: SmsLang }
  | { kind: "freeform"; text: string }
  | { kind: "unknown" };

const has = (text: string, words: string[]) => words.some((w) => (/^[a-z' ]+$/.test(w) ? new RegExp(`\\b${w}\\b`, "i").test(text) : text.includes(w)));

/** Deterministic reply parser. `awaiting` is what the previous SMS asked for. */
export function parseSms(raw: string, awaiting: "help_details" | "question" | null = null): ParsedSms {
  const text = normaliseDigits(raw.normalize("NFC")).replace(/\s+/g, " ").trim().slice(0, 480);
  if (!text) return { kind: "unknown" };
  const lower = text.toLowerCase();

  const lang = lower.match(/^(?:lang(?:uage)?|bhasha|lugha|لغة)\s+(.+)$/i)?.[1]?.trim() ?? (LANG_ALIASES[lower] ? lower : null);
  if (lang && LANG_ALIASES[lang]) return { kind: "language", lang: LANG_ALIASES[lang] };

  const lead = text.match(/^([123])(?:$|[\s.,:;)\-–—]+(.*))/s);
  if (lead) {
    const rest = lead[2]?.trim() || null;
    if (lead[1] === "1") return { kind: "safe" };
    if (lead[1] === "2") return { kind: "help", details: rest };
    return { kind: "question", text: rest };
  }

  // Safer to over-escalate: any help word, or "not safe", is a help request.
  if (has(lower, HELP_WORDS)) return { kind: "help", details: text };
  if (has(lower, SAFE_WORDS)) return NEGATION.test(` ${lower} `) ? { kind: "help", details: text } : { kind: "safe" };
  if (awaiting === "help_details") return { kind: "help", details: text };
  if (awaiting === "question" || QUESTION_WORDS.test(` ${lower} `)) return { kind: "question", text };
  return text.split(" ").length >= 3 ? { kind: "freeform", text } : { kind: "unknown" };
}

const QUESTION_KEYWORDS: [string, string[]][] = [
  ["Q-PARKING", ["parking", "basement", "garage", "underground", "موقف", "المواقف", "تحت الأرض", "القبو", "पार्किंग", "बेसमेंट", "پارکنگ", "تہہ خانے", "بیسمنٹ", "പാർക്കിംഗ്", "ബേസ്മെന്റ്", "পার্কিং", "বেসমেন্ট", "paradahan"]],
  ["Q-DRIVE", ["drive", "driving", "car", "road", "قيادة", "القيادة", "سيارة", "السيارة", "الطريق", "गाड़ी", "गाडी", "ड्राइव", "कार", "सड़क", "gaadi", "gadi", "گاڑی", "ڈرائیو", "سڑک", "gaari", "വാഹന", "ഡ്രൈവ്", "കാർ", "റോഡ്", "গাড়ি", "ড্রাইভ", "রাস্তা", "magmaneho", "maneho", "kotse", "sasakyan", "kalsada"]],
  ["Q-UNTIL", ["how long", "until", "when", "end", "متى", "ينتهي", "حتى", "مدة", "कब तक", "कब", "खत्म", "kab tak", "کب تک", "کب", "ختم", "എപ്പോൾ", "എത്ര നേരം", "വരെ", "কখন", "কতক্ষণ", "শেষ", "kailan", "hanggang", "gaano katagal"]],
];

/** Matches an SMS question to an approved answer id, in any supported language. Questions about
 *  rescue, shelter, medical help and the like are never auto-answered: they go to a person. */
export function matchSmsQuestion(text: string): string | null {
  if (isEscalationTopic(text)) return null;
  const lower = normaliseDigits(text).toLowerCase();
  for (const [id, words] of QUESTION_KEYWORDS) if (has(lower, words)) return id;
  return null;
}

/** Replies follow the language a person writes in, when its script makes that clear. */
export function replyLanguage(text: string, current: SmsLang): SmsLang {
  const detected = detectLanguage(text, null);
  if (!detected || detected === current) return current;
  if (detected === "fil") return "tl";
  // Latin script is also used for romanised Hindi and Urdu, so English never switches by itself.
  return isSmsLang(detected) && detected !== "en" ? detected : current;
}
