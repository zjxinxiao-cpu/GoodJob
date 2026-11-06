import type { AiModelConfig } from "./types.js";

/** 国内客户（含港澳台）走国内模型；其余走国际模型。 */
export type AiMarketRegion = "domestic" | "international";

const DOMESTIC_COUNTRY_TOKENS = [
  "中国", "内地", "大陆", "中华人民共和国", "china", "prc", "cn",
  "香港", "hong kong", "hk", "澳门", "macao", "macau", "mo",
  "台湾", "台灣", "taiwan", "tw"
];

/** 前端预设里的国内供应商 code */
export const DOMESTIC_AI_PROVIDERS = new Set([
  "deepseek", "qwen", "moonshot", "zhipu", "baidu", "volcengine", "siliconflow"
]);

/** 前端预设里的国际供应商 code */
export const INTERNATIONAL_AI_PROVIDERS = new Set([
  "openai", "anthropic", "gemini", "mistral", "groq", "openrouter"
]);

export type AiUseCaseFlag = "leadFinder" | "websiteParse" | "scoring" | "emailDraft" | "exam";

const USE_CASE_FLAG: Record<AiUseCaseFlag, keyof AiModelConfig> = {
  leadFinder: "useLeadFinder",
  websiteParse: "useWebsiteParse",
  scoring: "useScoring",
  emailDraft: "useEmailDraft",
  exam: "useExam"
};

/** 没有真实国家/市场时不强制分流，沿用「任意可用配置」。 */
const NON_MARKET_HINTS = new Set([
  "", "未知", "未知市场", "待核实", "待维护", "待确认", "—", "-",
  "n/a", "na", "none", "null", "unknown", "your market",
  "global", "worldwide", "all", "any", "全球", "不限", "全部"
]);

export function normalizeCountryToken(value: string | undefined | null) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function matchesDomesticToken(haystack: string, token: string) {
  if (haystack === token) return true;
  // 两三位 ISO 码按整词匹配，避免 canada / morocco 被 cn / mo 误判成国内。
  if (/^[a-z]{2,3}$/.test(token)) {
    return new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(token);
}

export function resolveAiMarketRegion(countryOrMarket: string | undefined | null): AiMarketRegion {
  const raw = String(countryOrMarket || "").trim();
  if (!raw) return "international";
  const lower = normalizeCountryToken(raw);
  if (DOMESTIC_COUNTRY_TOKENS.some((token) => matchesDomesticToken(lower, token))) {
    return "domestic";
  }
  // ISO-ish short codes already covered above; treat CNY settlement hints as domestic
  if (/^cn(y)?$/i.test(raw) || /中国|内地|大陆/.test(raw)) return "domestic";
  return "international";
}

function marketParts(value: string | undefined | null) {
  return String(value || "")
    .split(/[,，、;；|/]+/u)
    .map((part) => part.trim())
    .filter((part) => {
      const lower = normalizeCountryToken(part);
      return Boolean(part) && !NON_MARKET_HINTS.has(part) && !NON_MARKET_HINTS.has(lower);
    });
}

/**
 * 单一国家/市场才作为分流提示。
 * 空值、占位文案，或国内外混在同一串里时返回 null，交给原有选择逻辑。
 */
export function coherentMarketHint(value: string | undefined | null): string | null {
  const parts = marketParts(value);
  if (!parts.length) return null;
  const regions = new Set(parts.map((part) => resolveAiMarketRegion(part)));
  if (regions.size !== 1) return null;
  return parts[0] ?? null;
}

export function providerMarketRegion(provider: string): AiMarketRegion | "unknown" {
  const code = String(provider || "").trim().toLocaleLowerCase("en-US");
  if (DOMESTIC_AI_PROVIDERS.has(code)) return "domestic";
  if (INTERNATIONAL_AI_PROVIDERS.has(code)) return "international";
  // Heuristic from base hostnames is applied by callers that have baseUrl;
  // bare provider strings outside the preset list stay unknown.
  return "unknown";
}

export function providerMarketRegionFromConfig(config: Pick<AiModelConfig, "provider" | "baseUrl">): AiMarketRegion | "unknown" {
  const fromProvider = providerMarketRegion(config.provider);
  if (fromProvider !== "unknown") return fromProvider;
  const host = (() => {
    try {
      return new URL(config.baseUrl).hostname.toLocaleLowerCase("en-US");
    } catch {
      return "";
    }
  })();
  if (!host) return "unknown";
  if (
    host.includes("deepseek.com")
    || host.includes("dashscope.aliyuncs.com")
    || host.includes("moonshot.cn")
    || host.includes("bigmodel.cn")
    || host.includes("baidubce.com")
    || host.includes("volces.com")
    || host.includes("siliconflow.cn")
  ) {
    return "domestic";
  }
  if (
    host.includes("openai.com")
    || host.includes("anthropic.com")
    || host.includes("googleapis.com")
    || host.includes("generativelanguage.googleapis.com")
    || host.includes("mistral.ai")
    || host.includes("groq.com")
    || host.includes("openrouter.ai")
  ) {
    return "international";
  }
  return "unknown";
}

function supportsUseCase(config: AiModelConfig, useCase?: AiUseCaseFlag) {
  if (!useCase) return true;
  return Boolean(config[USE_CASE_FLAG[useCase]]);
}

function rankConfigs(configs: AiModelConfig[], useCase?: AiUseCaseFlag) {
  return [...configs].sort((left, right) => {
    const leftReady = Number(Boolean(left.enabled && left.apiKey && supportsUseCase(left, useCase)));
    const rightReady = Number(Boolean(right.enabled && right.apiKey && supportsUseCase(right, useCase)));
    if (leftReady !== rightReady) return rightReady - leftReady;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function readyConfig(configs: AiModelConfig[], useCase?: AiUseCaseFlag) {
  return configs.find((item) => item.enabled && item.apiKey && supportsUseCase(item, useCase));
}

/**
 * 最小国内外分流：有国家/市场信息时，优先选匹配区域且已启用、有 Key 的配置；
 * 没有可用的区域匹配则回退到原有「任意可用配置」，避免未配齐的区域模型打断现网。
 */
export function pickAiConfigForMarket(
  configs: AiModelConfig[],
  options: { useCase?: AiUseCaseFlag; countryOrMarket?: string | null } = {}
): AiModelConfig | null {
  if (!configs.length) return null;
  const ranked = rankConfigs(configs, options.useCase);
  const hint = coherentMarketHint(options.countryOrMarket);
  if (hint) {
    const region = resolveAiMarketRegion(hint);
    const strictReady = ranked.find((item) => item.enabled && item.apiKey
      && supportsUseCase(item, options.useCase)
      && providerMarketRegionFromConfig(item) === region);
    if (strictReady) return strictReady;
  }
  const ready = readyConfig(ranked, options.useCase);
  if (ready) return ready;
  if (hint) {
    const region = resolveAiMarketRegion(hint);
    const strictAny = ranked.find((item) => supportsUseCase(item, options.useCase)
      && providerMarketRegionFromConfig(item) === region);
    if (strictAny) return strictAny;
  }
  return ranked.find((item) => supportsUseCase(item, options.useCase))
    || ranked[0]
    || null;
}
