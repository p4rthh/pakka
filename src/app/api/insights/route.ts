import { json } from "@/server/http";
import { dailyInsights } from "@/server/store";

export const dynamic = "force-dynamic";

/** Daily view: sales lost to missing stock, swaps, not-stocked asks, brand asks. ?date=YYYY-MM-DD */
export function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  return json(dailyInsights(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined));
}
