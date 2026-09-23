// Default model selection for SwordCLI.
//
// The backend's router defaults to a "balanced" strategy that mixes speed and
// quality, and it served low-ranked models (gemini-3.5-flash-lite, glm-4.7-flash)
// for real coding work. SwordCLI therefore prefers a strong, tool-capable model
// when one is actually available from the configured providers, and otherwise
// falls back to the backend's `auto` routing. Nothing is hardcoded blindly: the
// preference list is intersected with GET /v1/models, so a retired model id can
// never pin the CLI to something the backend cannot serve.
const PREFERRED_MODELS = [
  'gemini-3.6-flash',
  'moonshotai/Kimi-K3',
  'moonshotai/Kimi-K2.7-Code',
  'Qwen/Qwen3-Coder-Next',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'zai-org/GLM-5.2',
  'deepseek-ai/DeepSeek-V4-Pro',
  'deepseek-ai/DeepSeek-V4-Flash',
  'gemini-3.5-flash',
];

/** GET /v1/models URL derived from the configured chat-completions endpoint. */
export function modelsUrl(config) {
  return config.url.replace(/\/chat\/completions$/, '/models');
}

/**
 * Resolve the model to use, in priority order:
 *   1. an explicit --model override
 *   2. SWORD_MODEL from the environment
 *   3. the strongest preferred model the backend actually advertises
 *   4. the provider default (normally `auto`)
 */
export async function resolveModel(config, override, env = process.env) {
  if (override) return override;
  if (env.SWORD_MODEL) return env.SWORD_MODEL;
  try {
    const response = await fetch(modelsUrl(config), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: config.key ? { Authorization: `Bearer ${config.key}` } : {},
    });
    if (!response.ok) return config.model;
    const body = await response.json();
    const available = new Set((Array.isArray(body?.data) ? body.data : []).map(entry => entry?.id).filter(id => typeof id === 'string'));
    return PREFERRED_MODELS.find(id => available.has(id)) || config.model;
  } catch {
    // Never block a turn on model discovery: fall back to backend routing.
    return config.model;
  }
}