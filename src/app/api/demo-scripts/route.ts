import { demoScripts } from "@/data/scripts";
import { json } from "@/server/http";

export function GET() {
  return json(demoScripts.map(({ lines, ...meta }) => ({ ...meta, lineCount: lines.length })));
}
