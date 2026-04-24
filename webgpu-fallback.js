/**
 * WebGPU fallback module — uses web-llm (MLC) to run a small LLM in the browser
 * when Chrome's built-in Prompt API is not available.
 * Vanilla ES module, loaded from CDN (no build step).
 */

const DEFAULT_MODEL_ID = 'gemma-2-2b-it-q4f16_1-MLC';

let engine = null;
let currentModelId = null;
let currentPowerPref = 'high-performance';
let webllmModule = null; // cached import

/**
 * Query the WebGPU adapter for GPU information.
 * @param {'high-performance'|'low-power'} [powerPreference='high-performance']
 * @returns {Promise<{vendor: string, architecture: string, device: string, description: string, powerPreference: string} | null>}
 */
export async function getGPUInfo(powerPreference = 'high-performance') {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) return null;

    const info = adapter.info || (adapter.requestAdapterInfo && await adapter.requestAdapterInfo());
    if (!info) return null;

    return {
      vendor: info.vendor || 'unknown',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      powerPreference,
    };
  } catch {
    return null;
  }
}

/**
 * Probe both power preferences and return the available GPU options.
 * Always returns both options on systems that support WebGPU, since the browser
 * may report identical info strings even when different physical GPUs are used.
 * @returns {Promise<Array<{label: string, powerPreference: string}>>}
 */
export async function getAvailableGPUs() {
  const [hp, lp] = await Promise.all([
    getGPUInfo('high-performance'),
    getGPUInfo('low-power'),
  ]);

  /** Build a human-readable label from adapter info. */
  function buildLabel(info) {
    if (!info) return null;
    const parts = [];
    if (info.description) {
      parts.push(info.description);
    } else {
      if (info.vendor) parts.push(info.vendor);
      if (info.architecture) parts.push(info.architecture);
      if (info.device) parts.push(info.device);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  const hpLabel = buildLabel(hp);
  const lpLabel = buildLabel(lp);

  const gpus = [];

  if (hpLabel && lpLabel) {
    // Both adapters responded — show both regardless of whether labels match,
    // since the browser may report the same info for different physical GPUs.
    const same = hpLabel === lpLabel;
    gpus.push({ label: `⚡ ${same ? 'High performance' : hpLabel}`, powerPreference: 'high-performance' });
    gpus.push({ label: `🔋 ${same ? 'Low power' : lpLabel}`, powerPreference: 'low-power' });
  } else if (hpLabel) {
    gpus.push({ label: `⚡ ${hpLabel}`, powerPreference: 'high-performance' });
  } else if (lpLabel) {
    gpus.push({ label: `🔋 ${lpLabel}`, powerPreference: 'low-power' });
  } else {
    // Couldn't read any info — offer both as generic options
    gpus.push({ label: '⚡ High performance', powerPreference: 'high-performance' });
    gpus.push({ label: '🔋 Low power', powerPreference: 'low-power' });
  }

  return gpus;
}

/**
 * Set the GPU power preference used for engine loading.
 * If changed while an engine is loaded, the next loadEngine call will reload.
 * @param {'high-performance'|'low-power'} pref
 */
export function setGPUPreference(pref) {
  if (pref !== currentPowerPref) {
    currentPowerPref = pref;
    // Force engine reload on next use
    engine = null;
    currentModelId = null;
  }
}

/**
 * Check whether WebGPU is available in this browser.
 * @returns {{ available: boolean, message?: string }}
 */
export function checkWebGPUAvailability() {
  if (!navigator.gpu) {
    return {
      available: false,
      message:
        'WebGPU is not supported in this browser. ' +
        'Please use a recent version of Chrome, Edge, or Firefox.',
    };
  }
  return { available: true };
}

/**
 * Lazily import the web-llm module (cached after first call).
 * @returns {Promise<Object>}
 */
async function getWebLLM() {
  if (!webllmModule) {
    webllmModule = await import('https://esm.run/@mlc-ai/web-llm');
  }
  return webllmModule;
}

/**
 * Return the list of available prebuilt models from web-llm,
 * filtered to only chat/LLM models (no embedding or VLM).
 * Each entry has { model_id, vram_required_MB, low_resource_required }.
 * @returns {Promise<Array<{model_id: string, vram_required_MB?: number, low_resource_required?: boolean}>>}
 */
export async function getAvailableModels() {
  const webllm = await getWebLLM();
  const allModels = webllm.prebuiltAppConfig.model_list;

  // model_type: 0 = LLM (default), 1 = embedding, 2 = VLM
  return allModels
    .filter((m) => m.model_type === undefined || m.model_type === 0)
    .map((m) => ({
      model_id: m.model_id,
      vram_required_MB: m.vram_required_MB,
      low_resource_required: m.low_resource_required,
    }));
}

/**
 * Check whether a specific model is already downloaded in the browser cache.
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function isModelCached(modelId) {
  try {
    const webllm = await getWebLLM();
    return await webllm.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/**
 * Get the default model ID.
 * @returns {string}
 */
export function getDefaultModelId() {
  return DEFAULT_MODEL_ID;
}

/**
 * Load (or reload) the web-llm engine for the given model.
 * Patches navigator.gpu.requestAdapter to prefer the high-performance (discrete) GPU.
 * @param {string} [modelId]
 * @param {(progress: {text: string, progress: number}) => void} onProgress
 * @returns {Promise<void>}
 */
export async function loadEngine(onProgress, modelId) {
  const targetModel = modelId || DEFAULT_MODEL_ID;

  // Already loaded with the same model — skip
  if (engine && currentModelId === targetModel) return;

  // Patch requestAdapter to use the selected GPU preference
  if (navigator.gpu) {
    const originalRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = (options) => {
      return originalRequestAdapter({ ...options, powerPreference: currentPowerPref });
    };
  }

  const webllm = await getWebLLM();

  if (engine) {
    // Reload existing engine with a different model
    await engine.reload(targetModel, { initProgressCallback: onProgress });
  } else {
    engine = await webllm.CreateMLCEngine(targetModel, {
      initProgressCallback: onProgress,
    });
  }
  currentModelId = targetModel;
}

/**
 * Generate a weather summary using the local WebGPU model.
 * @param {{ location: string, fetchedAt: string, days: Array<Object> }} weatherData
 * @param {(progress: {text: string, progress: number}) => void} [onProgress]
 * @param {string} [modelId]
 * @returns {Promise<string>}
 */
export async function generateSummaryWebGPU(weatherData, onProgress, modelId) {
  await loadEngine(onProgress || (() => {}), modelId);

  const formatted = weatherData.days.map((day) => {
    const parts = [day.date];
    if (day.temperatureRange) parts.push(`Temperature: ${day.temperatureRange}`);
    else if (day.temperature) parts.push(`Temperature: ${day.temperature}`);
    if (day.condition) parts.push(`Condition: ${day.condition}`);
    if (day.wind) parts.push(`Wind: ${day.wind}`);
    if (day.precipitation) parts.push(`Precipitation: ${day.precipitation}`);
    return parts.join(' | ');
  }).join('\n');

  const reply = await engine.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are a helpful weather assistant. Be concise and friendly.',
      },
      {
        role: 'user',
        content:
          `Summarize the following weather forecast for ${weatherData.location} in a friendly and ` +
          'concise way. Cover today and the next few days. Include temperature, ' +
          'conditions, wind, and precipitation.\n\n' +
          `Weather data:\n${formatted}`,
      },
    ],
  });

  return reply.choices[0].message.content;
}

/**
 * Send a freeform chat message using the WebGPU model.
 * Maintains conversation history for multi-turn chat.
 *
 * @param {string} userMessage  The user's message.
 * @param {Array<{role: string, content: string}>} history  Previous messages in the conversation.
 * @param {(progress: {text: string, progress: number}) => void} [onProgress]
 * @param {string} [modelId]
 * @returns {Promise<{content: string, stats: {totalTokens: number, outputTokens: number, elapsed: number, tokensPerSec: number} | null}>}
 */
export async function chatWithWebGPU(userMessage, history = [], onProgress, modelId) {
  await loadEngine(onProgress || (() => {}), modelId);

  const messages = [
    { role: 'system', content: 'You are a helpful, friendly AI assistant. Answer questions clearly and concisely.' },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const start = performance.now();
  const reply = await engine.chat.completions.create({ messages });
  const elapsed = (performance.now() - start) / 1000; // seconds

  const content = reply.choices[0].message.content;
  const usage = reply.usage;

  let stats = null;
  if (usage && usage.completion_tokens) {
    stats = {
      totalTokens: usage.total_tokens || 0,
      outputTokens: usage.completion_tokens,
      promptTokens: usage.prompt_tokens || 0,
      elapsed: Math.round(elapsed * 10) / 10,
      tokensPerSec: Math.round((usage.completion_tokens / elapsed) * 10) / 10,
    };
  }

  return { content, stats };
}
