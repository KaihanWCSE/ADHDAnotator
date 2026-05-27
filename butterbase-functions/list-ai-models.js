const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PREFERRED_MODELS = [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.1-70b-instruct",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function gatewayBase(ctx) {
  const raw = ctx?.env?.BUTTERBASE_API_URL || "https://api.butterbase.ai";
  return raw.replace(/\/v1\/[^/]+\/?$/, "").replace(/\/$/, "");
}

function presentModel(model) {
  return {
    id: model.id,
    name: model.name || model.display_name || model.id,
    context_length: model.context_length || model.contextWindow || null,
    modality: model.modality || "chat",
    prompt_price_per_mtok: model.prompt_price_per_mtok ?? model.inputPricePerMTokens ?? null,
    completion_price_per_mtok: model.completion_price_per_mtok ?? model.outputPricePerMTokens ?? null,
  };
}

function chooseModels(models) {
  const chatModels = models
    .map(presentModel)
    .filter((model) => model.modality === "chat");
  const byId = new Map(chatModels.map((model) => [model.id, model]));
  const preferred = PREFERRED_MODELS.map((id) => byId.get(id)).filter(Boolean);
  if (preferred.length >= 3) return preferred;

  return chatModels
    .filter((model) => Number.isFinite(model.context_length) && model.context_length >= 32000)
    .sort((a, b) => {
      const aPrice = (a.prompt_price_per_mtok ?? 999) + (a.completion_price_per_mtok ?? 999);
      const bPrice = (b.prompt_price_per_mtok ?? 999) + (b.completion_price_per_mtok ?? 999);
      return aPrice - bPrice || a.name.localeCompare(b.name);
    })
    .slice(0, 12);
}

export default async function handler(req, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const base = gatewayBase(ctx);
  const appId = ctx?.env?.BUTTERBASE_APP_ID || "app_jnnlkgx7ehdy";
  const apiKey = ctx?.env?.BUTTERBASE_API_KEY;
  const url = apiKey ? `${base}/v1/${appId}/ai/models` : `${base}/v1/public/models`;

  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  const data = await response.json();
  if (!response.ok) {
    return json({ error: data?.error?.message || data?.error || "Could not load AI models" }, response.status);
  }

  const models = chooseModels(data.models || data.data || []);
  return json({ models });
}
