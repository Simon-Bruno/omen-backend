// LangSmith Configuration Service
import { wrapAISDK } from "langsmith/experimental/vercel";
import * as aiSDK from "ai";

export interface LangSmithConfig {
  enabled: boolean;
  apiKey?: string;
  project?: string;
  endpoint?: string;
}

export function getLangSmithConfig(): LangSmithConfig {
  const enabled = process.env.LANGCHAIN_TRACING_V2 === "true";
  
  return {
    enabled,
    apiKey: process.env.LANGCHAIN_API_KEY,
    project: process.env.LANGCHAIN_PROJECT || "omen-backend",
    endpoint: process.env.LANGCHAIN_ENDPOINT || "https://api.smith.langchain.com",
  };
}

export function createLangSmithWrapper() {
  const config = getLangSmithConfig();
  
  if (!config.enabled || !config.apiKey) {
    console.log("[LANGSMITH] Tracing disabled or API key not provided");
    return aiSDK;
  }

  console.log(`[LANGSMITH] Tracing enabled for project: ${config.project}`);
  return wrapAISDK(aiSDK);
}

// Export the wrapped AI SDK
export const ai = createLangSmithWrapper();
