import type { BuyerType, Catalogue, Qty, Sku, StockCard, StockCardItem } from "./types";

export function skuById(catalogue: Catalogue, id: string): Sku | undefined {
  return catalogue.skus.find((s) => s.id === id);
}

export function rateFor(sku: Sku, buyerType: BuyerType): number {
  return buyerType === "wholesaler" ? sku.price.wholesale : sku.price.retail;
}

/** Quantity converted to the SKU's base unit, or null when the unit does not apply. */
export function toBaseQty(sku: Sku, qty: Qty): number | null {
  const unit = qty.unit ?? sku.baseUnit;
  const factor = sku.unitFactors[unit];
  if (factor === undefined) {
    // "500 gram" of something sold by the kilo
    if (unit === "gram" && sku.unitFactors.kg !== undefined) return (qty.value / 1000) * sku.unitFactors.kg;
    return null;
  }
  return Math.round(qty.value * factor * 1000) / 1000;
}

/**
 * Nearest in-stock alternative for a SKU: same category, sharing a variety tag
 * if possible (basmati for basmati), then closest price.
 */
export function nearestAlternative(catalogue: Catalogue, sku: Sku): Sku | undefined {
  const pool = catalogue.skus.filter((s) => s.category === sku.category && s.id !== sku.id && s.stock > 0);
  const sameTag = pool.filter((s) => s.tags.some((t) => sku.tags.includes(t)));
  const ranked = (sameTag.length ? sameTag : pool).sort(
    (a, b) => Math.abs(a.price.retail - sku.price.retail) - Math.abs(b.price.retail - sku.price.retail),
  );
  return ranked[0];
}

function cardItem(catalogue: Catalogue, sku: Sku, buyerType: BuyerType): StockCardItem {
  return {
    skuId: sku.id,
    name: sku.name,
    brand: sku.brand,
    pack: sku.pack,
    pricePerUnit: rateFor(sku, buyerType),
    baseUnit: sku.baseUnit,
    stock: sku.stock,
    inStock: sku.stock > 0,
    alternativeId: sku.stock > 0 ? undefined : nearestAlternative(catalogue, sku)?.id,
  };
}

/** Stock card for a set of SKUs: in-stock first (cheapest first), out-of-stock last. */
export function buildStockCard(
  catalogue: Catalogue,
  skuIds: string[],
  buyerType: BuyerType,
  title: string,
  utterance: number,
): StockCard {
  const skus = skuIds.map((id) => skuById(catalogue, id)).filter((s): s is Sku => !!s);
  // An out-of-stock single item also shows its alternatives, so the shopkeeper can offer one.
  if (skus.length === 1 && skus[0].stock === 0) {
    const alt = nearestAlternative(catalogue, skus[0]);
    for (const s of catalogue.skus) {
      if (s.category === skus[0].category && s.stock > 0 && s.id !== skus[0].id && (s === alt || s.tags.some((t) => skus[0].tags.includes(t)))) skus.push(s);
    }
  }
  const items = skus
    .map((s) => cardItem(catalogue, s, buyerType))
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.pricePerUnit - b.pricePerUnit);
  const categories = new Set(skus.map((s) => s.category));
  return { title, category: categories.size === 1 ? [...categories][0] : "", items, utterance };
}

export function categoryLabel(catalogue: Catalogue, id: string): string {
  return catalogue.categories.find((c) => c.id === id)?.label ?? id;
}
