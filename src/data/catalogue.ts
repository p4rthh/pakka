import type { Catalogue, Sku } from "../engine/types";

// Seeded catalogue of a Mumbai kirana / wholesaler. Prices are illustrative
// retail and wholesale rupee rates per base unit, not real quotes.

type SkuSeed = Omit<Sku, "price" | "unitFactors" | "tags" | "aliases"> & {
  retail: number;
  wholesale?: number;
  unitFactors?: Sku["unitFactors"];
  tags?: string[];
  aliases?: string[];
};

const LOOSE_GRAIN = { kg: 1, gram: 0.001, bori: 25 } as const;
const OIL = { litre: 1, dabba: 15 } as const;
const BISCUIT = { packet: 1, dabba: 24 } as const;

function sku(seed: SkuSeed): Sku {
  const { retail, wholesale, unitFactors, tags, aliases, ...rest } = seed;
  return {
    ...rest,
    price: { retail, wholesale: wholesale ?? Math.round(retail * 0.9 * 100) / 100 },
    unitFactors: { [seed.baseUnit]: 1, ...(unitFactors ?? {}) },
    tags: tags ?? [],
    aliases: aliases ?? [],
  };
}

const skus: Sku[] = [
  // Rice
  sku({ id: "rice-india-gate", brand: "India Gate", name: "India Gate Classic Basmati", category: "rice", spoken: "India Gate basmati", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 150, wholesale: 138, stock: 0, aliases: ["india gate", "indiagate"], tags: ["basmati"], rack: "A1" }),
  sku({ id: "rice-daawat", brand: "Daawat", name: "Daawat Rozana Basmati", category: "rice", spoken: "Daawat basmati", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 105, wholesale: 96, stock: 40, aliases: ["daawat", "dawat", "davat", "daawath"], tags: ["basmati"], rack: "A1" }),
  sku({ id: "rice-kohinoor", brand: "Kohinoor", name: "Kohinoor Super Basmati", category: "rice", spoken: "Kohinoor basmati", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 135, wholesale: 124, stock: 15, aliases: ["kohinoor", "kohinur"], tags: ["basmati"], rack: "A1" }),
  sku({ id: "rice-kolam", brand: "Wada", name: "Wada Kolam Rice", category: "rice", spoken: "Kolam", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 62, wholesale: 56, stock: 300, aliases: ["kolam", "wada kolam", "colam"], tags: ["everyday"], rack: "A2" }),
  sku({ id: "rice-sona-masoori", brand: "Loose", name: "Sona Masoori Rice", category: "rice", spoken: "Sona Masoori", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 58, wholesale: 52, stock: 120, aliases: ["sona masoori", "sona masuri", "sona"], tags: ["everyday"], rack: "A2" }),
  sku({ id: "rice-indrayani", brand: "Loose", name: "Indrayani Rice", category: "rice", spoken: "Indrayani", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 72, wholesale: 65, stock: 60, aliases: ["indrayani", "indrayan"], tags: ["fragrant"], rack: "A2" }),
  sku({ id: "rice-ambemohar", brand: "Loose", name: "Ambemohar Rice", category: "rice", spoken: "Ambemohar", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 95, wholesale: 86, stock: 25, aliases: ["ambemohar", "ambe mohar"], tags: ["fragrant"], rack: "A2" }),

  // Atta
  sku({ id: "atta-aashirvaad-5", brand: "Aashirvaad", name: "Aashirvaad Whole Wheat Atta", category: "atta", spoken: "Aashirvaad atta", pack: "5 kg packet", baseUnit: "packet", unitFactors: { kg: 0.2 }, retail: 285, wholesale: 268, stock: 30, aliases: ["aashirvaad", "ashirvaad", "ashirwad", "aashirwad", "ashirvad"], rack: "B1" }),
  sku({ id: "atta-pillsbury-5", brand: "Pillsbury", name: "Pillsbury Chakki Fresh Atta", category: "atta", spoken: "Pillsbury atta", pack: "5 kg packet", baseUnit: "packet", unitFactors: { kg: 0.2 }, retail: 265, wholesale: 249, stock: 12, aliases: ["pillsbury", "pilsbury"], rack: "B1" }),
  sku({ id: "atta-loose", brand: "Loose", name: "Chakki Atta (loose)", category: "atta", spoken: "loose atta", pack: "loose / kg", baseUnit: "kg", unitFactors: { ...LOOSE_GRAIN, bori: 50 }, retail: 42, wholesale: 37, stock: 150, aliases: ["loose atta", "chakki atta", "khula atta"], rack: "B1" }),

  // Dal
  sku({ id: "dal-toor", brand: "Loose", name: "Toor Dal", category: "dal", spoken: "toor dal", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 165, wholesale: 150, stock: 80, aliases: ["toor", "tur", "tuvar", "arhar"], rack: "C1" }),
  sku({ id: "dal-moong", brand: "Loose", name: "Moong Dal", category: "dal", spoken: "moong dal", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 130, wholesale: 118, stock: 50, aliases: ["moong", "mung"], rack: "C1" }),
  sku({ id: "dal-chana", brand: "Loose", name: "Chana Dal", category: "dal", spoken: "chana dal", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 95, wholesale: 86, stock: 60, aliases: ["chana", "channa"], rack: "C1" }),
  sku({ id: "dal-masoor", brand: "Loose", name: "Masoor Dal", category: "dal", spoken: "masoor dal", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 110, wholesale: 100, stock: 0, aliases: ["masoor", "masur"], rack: "C2" }),
  sku({ id: "dal-urad", brand: "Loose", name: "Urad Dal", category: "dal", spoken: "urad dal", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 140, wholesale: 127, stock: 35, aliases: ["urad", "udad"], rack: "C2" }),

  // Oil
  sku({ id: "oil-fortune-sunflower", brand: "Fortune", name: "Fortune Sunlite Sunflower Oil", category: "oil", spoken: "Fortune tel", pack: "1 L pouch", baseUnit: "litre", unitFactors: OIL, retail: 165, wholesale: 152, stock: 90, aliases: ["fortune", "fortun", "sunlite"], tags: ["sunflower"], rack: "D1" }),
  sku({ id: "oil-saffola-gold", brand: "Saffola", name: "Saffola Gold Oil", category: "oil", spoken: "Saffola", pack: "1 L pouch", baseUnit: "litre", unitFactors: OIL, retail: 210, wholesale: 193, stock: 40, aliases: ["saffola", "safola"], tags: ["blended"], rack: "D1" }),
  sku({ id: "oil-dhara-mustard", brand: "Dhara", name: "Dhara Kachi Ghani Mustard Oil", category: "oil", spoken: "Dhara sarson tel", pack: "1 L bottle", baseUnit: "litre", unitFactors: OIL, retail: 185, wholesale: 170, stock: 25, aliases: ["dhara", "sarson", "mustard"], tags: ["mustard"], rack: "D2" }),
  sku({ id: "oil-freedom-sunflower", brand: "Freedom", name: "Freedom Sunflower Oil", category: "oil", spoken: "Freedom tel", pack: "1 L pouch", baseUnit: "litre", unitFactors: OIL, retail: 150, wholesale: 138, stock: 0, aliases: ["freedom"], tags: ["sunflower"], rack: "D2" }),

  // Salt
  sku({ id: "salt-tata", brand: "Tata", name: "Tata Salt", category: "salt", spoken: "Tata namak", pack: "1 kg packet", baseUnit: "packet", unitFactors: { kg: 1 }, retail: 28, wholesale: 25, stock: 200, aliases: ["tata"], rack: "E1" }),
  sku({ id: "salt-annapurna", brand: "Annapurna", name: "Annapurna Salt", category: "salt", spoken: "Annapurna namak", pack: "1 kg packet", baseUnit: "packet", unitFactors: { kg: 1 }, retail: 24, wholesale: 21, stock: 60, aliases: ["annapurna", "anapurna"], rack: "E1" }),

  // Sugar and jaggery
  sku({ id: "sugar-loose", brand: "Loose", name: "Sugar (loose)", category: "sugar", spoken: "cheeni", pack: "loose / kg", baseUnit: "kg", unitFactors: { ...LOOSE_GRAIN, bori: 50 }, retail: 46, wholesale: 41, stock: 400, rack: "E2" }),
  sku({ id: "jaggery-kolhapuri", brand: "Kolhapuri", name: "Kolhapuri Gul (jaggery)", category: "jaggery", spoken: "gud", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 70, wholesale: 63, stock: 40, aliases: ["kolhapuri"], rack: "E2" }),

  // Masala
  sku({ id: "masala-everest-garam", brand: "Everest", name: "Everest Garam Masala", category: "masala", spoken: "Everest garam masala", pack: "100 g packet", baseUnit: "packet", retail: 82, wholesale: 74, stock: 30, aliases: ["everest garam", "garam"], rack: "F1" }),
  sku({ id: "masala-mdh-chana", brand: "MDH", name: "MDH Chana Masala", category: "masala", spoken: "MDH chana masala", pack: "100 g packet", baseUnit: "packet", retail: 78, wholesale: 70, stock: 20, aliases: ["mdh"], rack: "F1" }),
  sku({ id: "masala-everest-haldi", brand: "Everest", name: "Everest Turmeric Powder", category: "masala", spoken: "haldi", pack: "200 g packet", baseUnit: "packet", retail: 62, wholesale: 56, stock: 40, aliases: ["haldi", "turmeric", "halad"], rack: "F1" }),
  sku({ id: "masala-everest-mirchi", brand: "Everest", name: "Everest Tikhalal Chilli Powder", category: "masala", spoken: "lal mirchi", pack: "200 g packet", baseUnit: "packet", retail: 88, wholesale: 79, stock: 35, aliases: ["mirchi", "mirch", "tikhalal", "chilli"], rack: "F2" }),
  sku({ id: "masala-badshah-pavbhaji", brand: "Badshah", name: "Badshah Pav Bhaji Masala", category: "masala", spoken: "pav bhaji masala", pack: "100 g packet", baseUnit: "packet", retail: 70, wholesale: 63, stock: 25, aliases: ["badshah", "pav bhaji", "pavbhaji"], rack: "F2" }),

  // Tea
  sku({ id: "tea-tata-gold", brand: "Tata", name: "Tata Tea Gold", category: "tea", spoken: "Tata chai", pack: "500 g packet", baseUnit: "packet", retail: 310, wholesale: 285, stock: 30, aliases: ["tata", "tata gold"], rack: "G1" }),
  sku({ id: "tea-red-label", brand: "Brooke Bond", name: "Red Label Tea", category: "tea", spoken: "Red Label", pack: "500 g packet", baseUnit: "packet", retail: 290, wholesale: 266, stock: 22, aliases: ["red label", "brooke bond"], rack: "G1" }),

  // Soap and detergent
  sku({ id: "soap-lux", brand: "Lux", name: "Lux Soap", category: "soap", spoken: "Lux", pack: "100 g bar", baseUnit: "piece", unitFactors: { packet: 1, dabba: 48 }, retail: 38, wholesale: 34, stock: 120, aliases: ["lux"], rack: "H1" }),
  sku({ id: "soap-lifebuoy", brand: "Lifebuoy", name: "Lifebuoy Soap", category: "soap", spoken: "Lifebuoy", pack: "100 g bar", baseUnit: "piece", unitFactors: { packet: 1, dabba: 48 }, retail: 32, wholesale: 29, stock: 150, aliases: ["lifebuoy", "lifeboy"], rack: "H1" }),
  sku({ id: "soap-dettol", brand: "Dettol", name: "Dettol Soap", category: "soap", spoken: "Dettol", pack: "125 g bar", baseUnit: "piece", unitFactors: { packet: 1, dabba: 48 }, retail: 52, wholesale: 47, stock: 0, aliases: ["dettol", "detol"], rack: "H1" }),
  sku({ id: "soap-santoor", brand: "Santoor", name: "Santoor Soap", category: "soap", spoken: "Santoor", pack: "100 g bar", baseUnit: "piece", unitFactors: { packet: 1, dabba: 48 }, retail: 36, wholesale: 32, stock: 90, aliases: ["santoor", "santur"], rack: "H2" }),
  sku({ id: "detergent-surf-excel", brand: "Surf Excel", name: "Surf Excel Easy Wash", category: "detergent", spoken: "Surf Excel", pack: "1 kg packet", baseUnit: "packet", retail: 140, wholesale: 128, stock: 45, aliases: ["surf excel", "surf"], rack: "H2" }),
  sku({ id: "detergent-tide", brand: "Tide", name: "Tide Plus", category: "detergent", spoken: "Tide", pack: "1 kg packet", baseUnit: "packet", retail: 115, wholesale: 105, stock: 30, aliases: ["tide"], rack: "H2" }),

  // Biscuits
  sku({ id: "biscuit-parle-g", brand: "Parle", name: "Parle-G", category: "biscuit", spoken: "Parle G", pack: "80 g packet", baseUnit: "packet", unitFactors: BISCUIT, retail: 10, wholesale: 8.5, stock: 600, aliases: ["parle g", "parleg", "parle ji"], rack: "J1" }),
  sku({ id: "biscuit-good-day", brand: "Britannia", name: "Britannia Good Day", category: "biscuit", spoken: "Good Day", pack: "100 g packet", baseUnit: "packet", unitFactors: BISCUIT, retail: 30, wholesale: 27, stock: 200, aliases: ["good day", "goodday"], rack: "J1" }),
  sku({ id: "biscuit-marie-gold", brand: "Britannia", name: "Britannia Marie Gold", category: "biscuit", spoken: "Marie Gold", pack: "120 g packet", baseUnit: "packet", unitFactors: BISCUIT, retail: 30, wholesale: 27, stock: 150, aliases: ["marie", "mari gold", "marie gold"], rack: "J1" }),
  sku({ id: "biscuit-monaco", brand: "Parle", name: "Parle Monaco", category: "biscuit", spoken: "Monaco", pack: "75 g packet", baseUnit: "packet", unitFactors: BISCUIT, retail: 30, wholesale: 27, stock: 80, aliases: ["monaco"], rack: "J2" }),
  sku({ id: "biscuit-bourbon", brand: "Britannia", name: "Britannia Bourbon", category: "biscuit", spoken: "Bourbon", pack: "120 g packet", baseUnit: "packet", unitFactors: BISCUIT, retail: 35, wholesale: 31, stock: 0, aliases: ["bourbon", "borbon"], rack: "J2" }),

  // Poha
  sku({ id: "poha-thick", brand: "Loose", name: "Poha (thick)", category: "poha", spoken: "poha", pack: "loose / kg", baseUnit: "kg", unitFactors: LOOSE_GRAIN, retail: 60, wholesale: 54, stock: 70, aliases: [], rack: "B2" }),
];

export const catalogue: Catalogue = {
  shopName: {
    household: "Sharma Kirana Stores, Dadar",
    wholesaler: "Shah Traders, Masjid Bunder",
  },
  categories: [
    { id: "rice", label: "Rice", words: ["rice", "chawal", "chaval", "tandul"] },
    { id: "atta", label: "Atta", words: ["atta", "aata", "aatta", "flour", "peeth", "pith", "gehu"] },
    { id: "dal", label: "Dal", words: ["dal", "daal", "dhal", "dali", "pulses"] },
    { id: "oil", label: "Oil", words: ["tel", "oil", "tael"] },
    { id: "salt", label: "Salt", words: ["namak", "salt", "meeth", "mith"] },
    { id: "sugar", label: "Sugar", words: ["cheeni", "chini", "shakkar", "sakhar", "sugar"] },
    { id: "jaggery", label: "Jaggery", words: ["gud", "gul", "jaggery"] },
    { id: "masala", label: "Masala", words: ["masala", "masale"] },
    { id: "tea", label: "Tea", words: ["chai patti", "chaipatti", "tea", "chai"] },
    { id: "soap", label: "Soap", words: ["sabun", "soap", "saabun", "sabu"] },
    { id: "detergent", label: "Detergent", words: ["detergent", "washing powder", "kapde ka powder"] },
    { id: "biscuit", label: "Biscuits", words: ["biscuit", "biscuits", "biskut", "biskit"] },
    { id: "poha", label: "Poha", words: ["poha", "pohe", "pauva"] },
  ],
  skus,
};
