import { catalogue } from "@/data/catalogue";
import { rateFor } from "@/engine";
import { json } from "@/server/http";

/** Catalogue with the price that applies to the buyer type (?buyerType=wholesaler|household). */
export function GET(req: Request) {
  const buyerType = new URL(req.url).searchParams.get("buyerType") === "wholesaler" ? "wholesaler" : "household";
  return json({
    shopName: catalogue.shopName[buyerType],
    buyerType,
    categories: catalogue.categories.map(({ id, label }) => ({ id, label })),
    skus: catalogue.skus.map((s) => ({
      id: s.id,
      name: s.name,
      brand: s.brand,
      category: s.category,
      pack: s.pack,
      baseUnit: s.baseUnit,
      price: rateFor(s, buyerType),
      stock: s.stock,
      rack: s.rack,
    })),
  });
}
