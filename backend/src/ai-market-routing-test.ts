import assert from "node:assert/strict";
import {
  coherentMarketHint,
  pickAiConfigForMarket,
  providerMarketRegionFromConfig,
  resolveAiMarketRegion
} from "./ai-market-routing.js";
import type { AiModelConfig } from "./types.js";

function config(overrides: Partial<AiModelConfig>): AiModelConfig {
  return {
    id: "x",
    provider: "openai",
    protocol: "openai-compatible",
    name: "t",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "k",
    enabled: true,
    temperature: 0.1,
    useLeadFinder: true,
    useWebsiteParse: true,
    useScoring: true,
    useEmailDraft: true,
    useExam: false,
    ownerId: "o",
    teamId: "t",
    updatedAt: "2026-11-06T00:00:00.000Z",
    ...overrides
  };
}

assert.equal(resolveAiMarketRegion("中国"), "domestic");
assert.equal(resolveAiMarketRegion("CN"), "domestic");
assert.equal(resolveAiMarketRegion("cn"), "domestic");
assert.equal(resolveAiMarketRegion("HK"), "domestic");
assert.equal(resolveAiMarketRegion("MO"), "domestic");
assert.equal(resolveAiMarketRegion("TW"), "domestic");
assert.equal(resolveAiMarketRegion("Hong Kong"), "domestic");
assert.equal(resolveAiMarketRegion("香港"), "domestic");
assert.equal(resolveAiMarketRegion("澳门"), "domestic");
assert.equal(resolveAiMarketRegion("澳门特别行政区"), "domestic");
assert.equal(resolveAiMarketRegion("台湾"), "domestic");
assert.equal(resolveAiMarketRegion("台灣"), "domestic");
assert.equal(resolveAiMarketRegion("中国台湾"), "domestic");
assert.equal(resolveAiMarketRegion("CNY"), "domestic");
assert.equal(resolveAiMarketRegion("Germany"), "international");
assert.equal(resolveAiMarketRegion("USA"), "international");
assert.equal(resolveAiMarketRegion("美国"), "international");
assert.equal(resolveAiMarketRegion("Canada"), "international");
assert.equal(resolveAiMarketRegion("Morocco"), "international");
assert.equal(resolveAiMarketRegion(""), "international");

assert.equal(coherentMarketHint(""), null);
assert.equal(coherentMarketHint("待核实"), null);
assert.equal(coherentMarketHint("your market"), null);
assert.equal(coherentMarketHint("global"), null);
assert.equal(coherentMarketHint("全球"), null);
assert.equal(coherentMarketHint("中国"), "中国");
assert.equal(coherentMarketHint("中国、香港"), "中国");
assert.equal(coherentMarketHint("中国,美国"), null);
assert.equal(coherentMarketHint("USA"), "USA");

const deepseek = config({
  id: "ds",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  updatedAt: "2026-11-06T01:00:00.000Z"
});
const openai = config({
  id: "oa",
  provider: "openai",
  updatedAt: "2026-11-06T02:00:00.000Z"
});
const customDeepseekHost = config({
  id: "custom-ds",
  provider: "custom",
  baseUrl: "https://api.deepseek.com/v1",
  updatedAt: "2026-11-06T00:30:00.000Z"
});

assert.equal(providerMarketRegionFromConfig(deepseek), "domestic");
assert.equal(providerMarketRegionFromConfig(openai), "international");
assert.equal(providerMarketRegionFromConfig(customDeepseekHost), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "qwen",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "moonshot",
  baseUrl: "https://api.moonshot.cn/v1"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "zhipu",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "baidu",
  baseUrl: "https://qianfan.baidubce.com/v2"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "volcengine",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "siliconflow",
  baseUrl: "https://api.siliconflow.cn/v1"
})), "domestic");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "anthropic",
  protocol: "anthropic",
  baseUrl: "https://api.anthropic.com/v1"
})), "international");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "gemini",
  protocol: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta"
})), "international");
assert.equal(providerMarketRegionFromConfig(config({
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1"
})), "unknown");

assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "中国", useCase: "scoring" })?.id, "ds");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "CN", useCase: "scoring" })?.id, "ds");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "HK", useCase: "emailDraft" })?.id, "ds");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "台湾", useCase: "leadFinder" })?.id, "ds");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "USA", useCase: "scoring" })?.id, "oa");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "美国", useCase: "scoring" })?.id, "oa");
assert.equal(pickAiConfigForMarket([openai, deepseek], { countryOrMarket: "Germany", useCase: "emailDraft" })?.id, "oa");
// No hint → prefer newest enabled (openai)
assert.equal(pickAiConfigForMarket([deepseek, openai], { useCase: "scoring" })?.id, "oa");
assert.equal(pickAiConfigForMarket([deepseek, openai], { countryOrMarket: "待核实", useCase: "scoring" })?.id, "oa");
// Missing regional match falls back
assert.equal(pickAiConfigForMarket([openai], { countryOrMarket: "中国", useCase: "scoring" })?.id, "oa");
assert.equal(pickAiConfigForMarket([deepseek], { countryOrMarket: "USA", useCase: "scoring" })?.id, "ds");
// Unusable domestic config must not block a ready international model
assert.equal(pickAiConfigForMarket([
  config({ id: "ds-off", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", enabled: false, apiKey: "" }),
  openai
], { countryOrMarket: "中国", useCase: "scoring" })?.id, "oa");
// Mixed markets do not force one region
assert.equal(pickAiConfigForMarket([deepseek, openai], { countryOrMarket: "中国,美国", useCase: "scoring" })?.id, "oa");

console.log(JSON.stringify({ ok: true, aiMarketRouting: true }));
