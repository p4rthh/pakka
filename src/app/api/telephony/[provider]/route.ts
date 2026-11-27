import { error, json } from "@/server/http";
import { adapters, missingEnv } from "@/telephony/adapter";

/**
 * Telephony webhook: DOCUMENTED STUB, NOT WIRED (needs paid Exotel/Twilio
 * accounts). It parses the provider's payload so the shape can be tested, then
 * answers 501. See docs/TELEPHONY.md for wiring it to a session.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const adapter = adapters[(await ctx.params).provider];
  if (!adapter) return error(404, "unknown telephony provider", { providers: Object.keys(adapters) });
  let body: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = (await req.json()) as Record<string, unknown>;
    else body = Object.fromEntries((await req.formData()).entries());
  } catch {
    return error(400, "unreadable webhook body");
  }
  const missing = missingEnv(adapter, process.env);
  return json(
    {
      error: "telephony not wired",
      message: missing.length ? `${missing.join(", ")} key not set` : "adapter is a stub; see docs/TELEPHONY.md",
      parsed: adapter.parseWebhook(body),
    },
    501,
  );
}
