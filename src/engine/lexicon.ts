import type { Unit } from "./types";

// Spoken-language lexicon for Hinglish, Hindi (Devanagari) and Marathi-English
// shop talk. Everything is reduced to lowercase Latin tokens first, so the
// rest of the engine only ever sees one script.

/** Devanagari word -> canonical Latin token(s). */
export const DEVANAGARI: Record<string, string> = {
  // negation / commands
  "नहीं": "nahi", "नही": "nahi", "नइ": "nahi", "मत": "mat", "नको": "nako", "नका": "naka",
  "हटा": "hata", "हटाओ": "hatao", "कैंसल": "cancel", "रहने": "rehne", "छोड़": "chhod", "छोड़ो": "chhodo",
  "दे": "de", "दो": "do", "देदो": "dedo", "देना": "dena", "दीजिए": "dijiye", "दीजिये": "dijiye",
  "भेज": "bhej", "भेजो": "bhejo", "भेजना": "bhejna", "भेजिए": "bhejiye", "चाहिए": "chahiye", "चाहिये": "chahiye",
  "लो": "lo", "ले": "le", "लूंगा": "lunga", "लूँगा": "lunga", "लूंगी": "lungi", "लिख": "likh", "लिखो": "likho",
  "कर": "kar", "करो": "karo", "रख": "rakh", "रखो": "rakho", "चलेगा": "chalega", "चलेगी": "chalegi",
  "ठीक": "theek", "हाँ": "haan", "हां": "haan", "हा": "haan", "जी": "ji", "बस": "bas", "फाइनल": "final",
  "सही": "sahi", "पक्का": "pakka", "वही": "wahi", "वो": "woh", "वह": "woh", "यह": "yeh", "ये": "yeh",
  // questions
  "क्या": "kya", "कौन": "kaun", "कौनसा": "kaunsa", "सा": "sa", "कितने": "kitne", "कितना": "kitna", "कितनी": "kitni",
  "मिलेगा": "milega", "मिलेगी": "milegi", "रेट": "rate", "भाव": "bhav", "दिखाओ": "dikhao", "बताओ": "batao",
  // price
  "महंगा": "mehenga", "महँगा": "mehenga", "मेहंगा": "mehenga", "महंगी": "mehngi", "ज्यादा": "zyada", "ज़्यादा": "zyada",
  "सस्ता": "sasta", "रुपये": "rupaye", "रुपए": "rupaye", "रुपया": "rupaye", "रुपय": "rupaye",
  // grammar words
  "है": "hai", "हैं": "hai", "का": "ka", "की": "ki", "के": "ke", "में": "mein", "मे": "mein", "से": "se", "को": "ko",
  "और": "aur", "भी": "bhi", "ही": "hi", "वाला": "wala", "वाली": "wali", "वाले": "wale", "जगह": "jagah", "बदले": "badle",
  "तो": "toh", "मुझे": "mujhe", "हमें": "hume", "भैया": "bhaiya", "भाई": "bhai", "बहुत": "bahut", "अभी": "abhi",
  "इतना": "itna", "हो": "ho", "गया": "gaya", "कुछ": "kuch", "बाकी": "baaki", "टोटल": "total",
  // numbers
  "एक": "ek", "तीन": "teen", "चार": "char", "पांच": "paanch", "पाँच": "paanch", "छह": "chhe", "छः": "chhe",
  "सात": "saat", "आठ": "aath", "नौ": "nau", "दस": "das", "बारह": "barah", "पंद्रह": "pandrah", "बीस": "bees",
  "पच्चीस": "pachees", "तीस": "tees", "चालीस": "chalis", "पचास": "pachas", "सौ": "sau",
  "डेढ़": "dedh", "डेढ": "dedh", "ढाई": "dhai", "आधा": "aadha", "सवा": "sawa", "साढ़े": "sadhe",
  // units
  "किलो": "kilo", "केजी": "kg", "ग्राम": "gram", "पैकेट": "packet", "पाकिट": "packet", "लीटर": "litre",
  "बोरी": "bori", "बोरा": "bori", "डब्बा": "dabba", "डिब्बा": "dabba", "डब्बे": "dabba", "पेटी": "dabba", "पीस": "piece",
  // products and categories
  "चावल": "chawal", "चांवल": "chawal", "बासमती": "basmati", "कोलम": "kolam", "इंडिया": "india", "गेट": "gate",
  "दावत": "daawat", "कोहिनूर": "kohinoor", "सोना": "sona", "मसूरी": "masoori", "इंद्रायणी": "indrayani", "आंबेमोहर": "ambemohar",
  "आटा": "atta", "आशीर्वाद": "aashirvaad", "पिल्सबरी": "pillsbury", "दाल": "dal", "डाळ": "dal", "तूर": "toor", "तुअर": "toor",
  "अरहर": "arhar", "मूंग": "moong", "मूँग": "moong", "चना": "chana", "मसूर": "masoor", "उड़द": "urad", "उडद": "urad",
  "तेल": "tel", "फॉर्च्यून": "fortune", "फार्च्यून": "fortune", "सफोला": "saffola", "धारा": "dhara", "सरसों": "sarson",
  "नमक": "namak", "टाटा": "tata", "चीनी": "cheeni", "शक्कर": "shakkar", "गुड़": "gud", "गुड": "gud",
  "मसाला": "masala", "हल्दी": "haldi", "मिर्ची": "mirchi", "मिर्च": "mirchi", "चाय": "chai", "पत्ती": "patti",
  "साबुन": "sabun", "लक्स": "lux", "डेटॉल": "dettol", "बिस्कुट": "biscuit", "पारले": "parle", "पोहा": "poha",
  "सर्फ": "surf", "एक्सेल": "excel",
  // Marathi
  "द्या": "dya", "पाठवा": "pathva", "पाहिजे": "pahije", "हवं": "hava", "हवे": "hava", "तांदूळ": "tandul",
  "साखर": "sakhar", "मीठ": "mith", "गूळ": "gul", "किती": "kiti", "आहे": "ahe", "बरोबर": "barobar", "ऐवजी": "aivaji",
  "पोहे": "pohe",
};

export type CueKind =
  | "neg"
  | "commit"
  | "accept"
  | "question"
  | "priceneg"
  | "swap"
  | "readback"
  | "done"
  | "boundary";

/**
 * Multi-word cue phrases. Matched longest-first, so "nahi chahiye" (neg)
 * beats "chahiye" (commit) and "aur kuch nahi" (done) beats "nahi" (neg).
 */
const CUE_LIST: Array<[CueKind, string[]]> = [
  ["done", ["bas itna hi", "bas itna", "itna hi", "itnaich", "ho gaya", "ho gya", "aur kuch nahi", "kuch nahi aur", "baki kuch nahi", "thats all", "that is all", "bas"]],
  ["neg", ["nahi chahiye", "nahi chaiye", "nako", "naka", "nahi pahije", "nai pahije", "nahi", "nahin", "nai", "mat", "cancel", "hata do", "hata", "hatao", "remove", "rehne do", "rahne do", "chhod do", "chod do", "chhodo", "no", "not", "dont", "skip"]],
  ["swap", ["ki jagah pe", "ki jagah", "ke jagah", "ke badle", "ki badle", "badle mein", "instead of", "instead", "aivaji"]],
  ["priceneg", ["bahut mehenga", "mehenga", "mehnga", "mahenga", "mahanga", "mehngi", "mahangi", "mahag", "mahaag", "costly", "expensive", "zyada hai", "jyada hai", "sasta wala", "sasta", "saste"]],
  ["question", ["kya kya", "kya hai", "kya bhav", "kaun sa", "kaunsa", "konsa", "kon sa", "kaun kaun", "kaunse", "konse", "hai kya", "milega", "milegi", "milenge", "available", "kitne ka", "kitne", "kitna", "kitni", "rate", "bhav", "bhaav", "price", "dikhao", "batao", "bataiye", "options", "which", "what", "kay kay", "ahe ka", "aahe ka", "kiti", "kuthla"]],
  ["readback", ["toh final", "to final", "order final", "final", "total", "read back", "repeat karta", "repeat karti", "confirm karta", "confirm karti", "sab milake", "ekun"]],
  ["accept", ["theek hai", "thik hai", "theek", "chalega", "chalegi", "chalel", "ok", "okay", "haan ji", "ji haan", "haan", "han", "haa", "yes", "wahi", "vahi", "sahi hai", "barobar", "pakka", "done", "correct"]],
  ["commit", ["pack kar do", "pack karo", "pathvun dya", "de dijiye", "de dena", "de do", "dedo", "dena", "dijiye", "dijie", "bhej do", "bhej dena", "bhejna", "bhejo", "bhejiye", "bhej", "le lunga", "le lungi", "lunga", "lungi", "le lo", "lelo", "likh lo", "likho", "likh do", "likh lijiye", "rakh do", "rakhna", "rakho", "add karo", "add kar do", "add", "kar do", "kardo", "karo", "chahiye", "chahie", "chaiye", "dya", "dyaa", "pathva", "pathav", "pahije", "hava", "ghya", "give", "send", "want", "need", "take", "de", "do"]],
  ["boundary", ["aur", "and", "phir", "plus", "also", "actually", "matlab", "wait", "ruko", "sorry", "arre", "accha", "achha"]],
];

export const CUES: Array<{ kind: CueKind; words: string[] }> = CUE_LIST.flatMap(([kind, phrases]) =>
  phrases.map((p) => ({ kind, words: p.split(" ") })),
).sort((a, b) => b.words.length - a.words.length);

/** Spoken unit word -> Unit. */
export const UNIT_WORDS: Record<string, Unit> = {
  kilo: "kg", kilos: "kg", kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", killo: "kg",
  gram: "gram", grams: "gram", gm: "gram", gms: "gram",
  litre: "litre", litres: "litre", liter: "litre", liters: "litre", ltr: "litre", lit: "litre",
  packet: "packet", packets: "packet", pkt: "packet", paket: "packet", pudi: "packet", pudiya: "packet", pack: "packet", packs: "packet", pouch: "packet",
  bori: "bori", bora: "bori", boriya: "bori", bag: "bori", bags: "bori", sack: "bori", gooni: "bori",
  dabba: "dabba", dabbe: "dabba", dibba: "dabba", dibbe: "dabba", tin: "dabba", peti: "dabba", box: "dabba", carton: "dabba",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", nag: "piece", vadi: "piece", wadi: "piece",
};

/** How a unit is said out loud in read-back. */
export const UNIT_SPOKEN: Record<Unit, string> = {
  kg: "kilo", gram: "gram", litre: "litre", packet: "packet", piece: "piece", bori: "bori", dabba: "dabba",
};

export const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, don: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, pach: 5, five: 5, chhe: 6, chhah: 6, saha: 6, six: 6, saat: 7, seven: 7,
  aath: 8, eight: 8, nau: 9, nine: 9, das: 10, daha: 10, ten: 10, barah: 12, bara: 12, twelve: 12,
  pandrah: 15, fifteen: 15, bees: 20, vees: 20, twenty: 20, pachees: 25, pachchis: 25, pachis: 25,
  tees: 30, thirty: 30, chalis: 40, forty: 40, pachas: 50, pannas: 50, fifty: 50, sau: 100, hundred: 100,
  dedh: 1.5, dhai: 2.5, aadha: 0.5, adha: 0.5, half: 0.5,
};

/** Number words that are also common verbs/articles: only a quantity when a unit follows. */
export const WEAK_NUMBER_WORDS = new Set(["do", "ek", "don", "one", "saat", "das", "sau", "char", "bara", "half"]);

/** Words that mark a preceding/following number as a price, not a quantity. */
export const PRICE_AFTER = new Set(["rupaye", "rupay", "rupees", "rupee", "rupya", "rupaiye", "rs", "rupiya", "wala", "wali", "wale"]);
export const PRICE_BEFORE = new Set(["rs", "inr", "₹"]);

/** Joiners allowed inside one product mention: "tata ka namak", "kolam wala chawal". */
export const JOINERS = new Set(["ka", "ki", "ke", "wala", "wali", "wale", "vala", "chi", "cha", "che"]);

/** Function words ignored when looking for an unknown product name. */
export const STOPWORDS = new Set([
  "hai", "hain", "he", "ka", "ki", "ke", "ko", "se", "mein", "me", "main", "pe", "par", "toh", "to", "bhi", "hi",
  "ji", "bhaiya", "bhai", "bhaisaab", "sir", "madam", "didi", "uncle", "aunty", "please", "plz", "mujhe", "hume", "humko",
  "mera", "meri", "mere", "apna", "aap", "tum", "woh", "wo", "yeh", "ye", "is", "us", "isko", "usko", "ek", "the", "a", "an",
  "kya", "kuch", "sab", "abhi", "aaj", "kal", "bahut", "thoda", "zara", "jaldi", "order", "list", "likhiye", "baaki", "baki",
  "wala", "wali", "wale", "sa", "si", "se", "na", "ne", "re", "ho", "hua", "gaya", "tha", "thi", "ahe", "aahe", "mala",
  "amhala", "pan", "namaste", "namaskar", "kaise", "kaisa", "kaisi", "haal", "kem", "cho", "ani", "aani", "ghar", "of", "for", "me", "my", "i", "we", "you", "it", "is", "are", "also",
]);
