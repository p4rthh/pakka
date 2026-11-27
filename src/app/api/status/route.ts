import { json } from "@/server/http";
import { llmStatus } from "@/server/store";
import { adapters, missingEnv } from "@/telephony/adapter";

export const dynamic = "force-dynamic";

/** What is configured. Key-dependent features report "key not set" here. */
export function GET() {
  const llm = llmStatus();
  return json({
    app: "Pakka",
    llm: { provider: llm.provider, model: llm.model, configured: !!llm.provider, message: llm.message },
    telephony: Object.values(adapters).map((a) => {
      const missing = missingEnv(a, process.env);
      return {
        provider: a.provider,
        wired: false,
        message: missing.length ? `${missing.join(", ")} key not set; telephony adapter is a documented stub` : "keys present, but the adapter is a documented stub (not wired)",
      };
    }),
  });
}
