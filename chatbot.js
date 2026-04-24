/**
 * Chatbot module — provides a conversational AI interface.
 * Reuses the same AI engines (Chrome Prompt API / WebGPU web-llm) as the weather summarizer.
 * Vanilla ES module, no build step required.
 */

import { chatWithAI } from './ai-summarizer.js';
import { chatWithWebGPU, getAvailableModels, getDefaultModelId, isModelCached, getAvailableGPUs, setGPUPreference, getGPUInfo } from './webgpu-fallback.js';

// DOM references
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatStatus = document.getElementById('chat-status');
const modelSelect = document.getElementById('model-select');
const modelSelectorGroup = document.getElementById('model-selector-group');
const gpuSelect = document.getElementById('gpu-select');
const gpuSelectorGroup = document.getElementById('gpu-selector-group');
const gpuInfoEl = document.getElementById('gpu-info');

// Conversation state
let history = [];
let isSending = false;

/** @type {boolean} Whether to use WebGPU fallback — set by init(). */
let useWebGPU = false;

/** @type {string|null} Currently selected WebGPU model ID. */
let selectedModelId = null;

const STORAGE_KEY = 'webllm-selected-model';
const CACHE_STATUS_KEY = 'webllm-cached-models';
const GPU_PREF_KEY = 'webllm-gpu-preference';

/**
 * Load the cached-models map from localStorage.
 * @returns {Record<string, boolean>}
 */
function loadCachedModelsMap() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_STATUS_KEY)) || {};
  } catch {
    return {};
  }
}

/**
 * Save the cached-models map to localStorage.
 * @param {Record<string, boolean>} map
 */
function saveCachedModelsMap(map) {
  localStorage.setItem(CACHE_STATUS_KEY, JSON.stringify(map));
}

/**
 * Build the label for a model option.
 * @param {string} modelId
 * @param {number} [vramMB]
 * @param {boolean} cached
 * @returns {string}
 */
function modelLabel(modelId, vramMB, cached) {
  const vram = vramMB ? ` (~${Math.round(vramMB)} MB)` : '';
  const star = cached ? '★ ' : '';
  return `${star}${modelId}${vram}`;
}

/**
 * Populate the model dropdown with available web-llm models.
 *
 * Phase 1 (instant): renders the dropdown using the last-known cache status
 *   stored in localStorage so the UI appears immediately.
 * Phase 2 (background): re-checks actual cache status via hasModelInCache,
 *   updates the dropdown labels/classes, and persists the fresh results.
 */
async function populateModelSelector() {
  try {
    const models = await getAvailableModels();
    const defaultId = getDefaultModelId();
    const savedId = localStorage.getItem(STORAGE_KEY);
    const cachedMap = loadCachedModelsMap();

    // Clear placeholder
    modelSelect.innerHTML = '';

    // Verify the saved model still exists in the list
    const savedExists = savedId && models.some((m) => m.model_id === savedId);
    const activeId = savedExists ? savedId : defaultId;

    // Phase 1 — render immediately with last-known cache status
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.model_id;
      const cached = !!cachedMap[m.model_id];
      opt.textContent = modelLabel(m.model_id, m.vram_required_MB, cached);
      if (cached) opt.className = 'cached';
      if (m.model_id === activeId) opt.selected = true;
      modelSelect.appendChild(opt);
    }

    selectedModelId = modelSelect.value;

    modelSelect.addEventListener('change', () => {
      selectedModelId = modelSelect.value;
      localStorage.setItem(STORAGE_KEY, selectedModelId);
      // Clear history when switching models since context won't carry over
      history = [];
    });

    // Phase 2 — refresh cache status in the background
    refreshCacheStatus(models);
  } catch (err) {
    console.warn('Failed to load model list:', err);
    modelSelectorGroup.style.display = 'none';
  }
}

/**
 * Re-check which models are actually in the browser cache,
 * update the dropdown labels, and persist the results.
 * Runs asynchronously without blocking the UI.
 * @param {Array<{model_id: string, vram_required_MB?: number}>} models
 */
async function refreshCacheStatus(models) {
  const freshMap = {};

  // Check in small batches to avoid overwhelming the browser
  const BATCH = 8;
  for (let i = 0; i < models.length; i += BATCH) {
    const batch = models.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (m) => ({
        model_id: m.model_id,
        cached: await isModelCached(m.model_id),
      })),
    );
    for (const r of results) {
      freshMap[r.model_id] = r.cached;
    }
  }

  saveCachedModelsMap(freshMap);

  // Update dropdown options in-place
  const options = modelSelect.options;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const m = models.find((mod) => mod.model_id === opt.value);
    if (!m) continue;
    const cached = !!freshMap[m.model_id];
    opt.textContent = modelLabel(m.model_id, m.vram_required_MB, cached);
    opt.className = cached ? 'cached' : '';
  }
}

/**
 * Show the resolved GPU name for the current power preference.
 * @param {string} pref
 */
async function updateGPUInfoLabel(pref) {
  const info = await getGPUInfo(pref);
  if (!info || !gpuInfoEl) return;

  const parts = [];
  if (info.description) {
    parts.push(info.description);
  } else {
    if (info.vendor) parts.push(info.vendor);
    if (info.architecture) parts.push(info.architecture);
    if (info.device) parts.push(info.device);
  }

  gpuInfoEl.textContent = parts.length ? `→ using: ${parts.join(' · ')}` : '';
}

/**
 * Populate the GPU selector dropdown.
 * Probes both power preferences and shows the resolved GPU names.
 * Restores the previously selected preference from localStorage.
 */
async function populateGPUSelector() {
  const gpus = await getAvailableGPUs();
  const savedPref = localStorage.getItem(GPU_PREF_KEY);

  gpuSelect.innerHTML = '';

  for (const gpu of gpus) {
    const opt = document.createElement('option');
    opt.value = gpu.powerPreference;
    opt.textContent = gpu.label;
    if (gpu.powerPreference === savedPref) opt.selected = true;
    gpuSelect.appendChild(opt);
  }

  // Apply the saved (or default) preference
  setGPUPreference(gpuSelect.value);
  updateGPUInfoLabel(gpuSelect.value);

  gpuSelect.addEventListener('change', () => {
    const pref = gpuSelect.value;
    localStorage.setItem(GPU_PREF_KEY, pref);
    setGPUPreference(pref);
    updateGPUInfoLabel(pref);
    // Clear history since the engine will reload on a different GPU
    history = [];
  });

  // Always show the GPU selector when using WebGPU —
  // even on single-GPU systems the user can switch power preference.
  gpuSelectorGroup.style.display = 'flex';
}

/**
 * Get the currently selected model ID (for use by other modules like weather).
 * @returns {string|null}
 */
export function getSelectedModelId() {
  return selectedModelId;
}

/**
 * Initialise the chatbot with the detected AI engine.
 * @param {boolean} webgpu  true if the app is using the WebGPU fallback.
 */
export function initChatbot(webgpu) {
  useWebGPU = webgpu;

  if (useWebGPU) {
    modelSelectorGroup.style.display = 'flex';
    populateModelSelector();
    populateGPUSelector();
  } else {
    // Chrome AI — no model selection needed
    modelSelectorGroup.style.display = 'none';
  }

  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

/**
 * Lightweight markdown → HTML converter.
 * Handles: headings, bold, italic, inline code, fenced code blocks,
 * unordered/ordered lists, blockquotes, horizontal rules, links, and paragraphs.
 * @param {string} md  Raw markdown string.
 * @returns {string} Sanitised HTML string.
 */
function renderMarkdown(md) {
  // Escape HTML entities first to prevent injection
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks (```lang ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre><code>${code.trimEnd()}</code></pre>`);

  // Blockquotes (> lines)
  html = html.replace(/^(?:&gt;)\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Unordered lists (- or * items)
  html = html.replace(/^(?:[*-]) (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists (1. items)
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, (match) =>
    match.includes('<ul>') ? match : `<ol>${match}</ol>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs — wrap remaining loose lines
  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks that are already block-level elements
      if (/^<(h[1-4]|ul|ol|li|pre|blockquote|hr)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Append a message bubble to the chat list.
 * User messages are plain text; assistant messages are rendered as markdown.
 * Optionally shows performance stats below assistant messages.
 * @param {'user'|'assistant'} role
 * @param {string} text
 * @param {{outputTokens: number, elapsed: number, tokensPerSec: number} | null} [stats]
 */
function appendMessage(role, text, stats) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;

  if (role === 'assistant') {
    bubble.innerHTML = renderMarkdown(text);

    if (stats) {
      const statsEl = document.createElement('div');
      statsEl.className = 'chat-stats';
      statsEl.textContent = `${stats.outputTokens} tokens · ${stats.elapsed}s · ${stats.tokensPerSec} tok/s`;
      bubble.appendChild(statsEl);
    }
  } else {
    bubble.textContent = text;
  }

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Show / hide the inline status indicator inside the chat area.
 * @param {string} [message]  Pass empty string to hide.
 */
function showChatStatus(message) {
  if (message) {
    chatStatus.style.display = 'block';
    // Keep the spinner span, update the text span
    const textSpan = document.getElementById('chat-status-text');
    if (textSpan) textSpan.textContent = message;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } else {
    chatStatus.style.display = 'none';
  }
}

/**
 * Send the current input to the AI and display the reply.
 */
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isSending) return;

  isSending = true;
  chatSendBtn.disabled = true;
  chatInput.disabled = true;
  if (modelSelect) modelSelect.disabled = true;
  if (gpuSelect) gpuSelect.disabled = true;

  appendMessage('user', text);
  chatInput.value = '';

  try {
    let replyText;
    let stats = null;

    if (useWebGPU) {
      showChatStatus('AI is thinking (WebGPU)…');
      const onProgress = (report) => {
        if (report.progress !== undefined && report.progress < 1) {
          showChatStatus(`Loading AI model… ${Math.round(report.progress * 100)}%`);
        } else {
          showChatStatus('AI is thinking (WebGPU)…');
        }
      };
      const result = await chatWithWebGPU(text, history, onProgress, selectedModelId);
      replyText = result.content;
      stats = result.stats;
    } else {
      showChatStatus('AI is thinking…');
      const start = performance.now();
      replyText = await chatWithAI(text, history);
      const elapsed = (performance.now() - start) / 1000;
      // Chrome AI doesn't expose token counts, so show time only
      stats = { outputTokens: '?', elapsed: Math.round(elapsed * 10) / 10, tokensPerSec: '—' };
    }

    showChatStatus('');
    appendMessage('assistant', replyText, stats);

    // Keep history for context (limit to last 20 messages to avoid token overflow)
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: replyText });
    if (history.length > 20) history = history.slice(-20);
  } catch (err) {
    showChatStatus('');
    appendMessage('assistant', `Error: ${err.message}`);
  } finally {
    isSending = false;
    chatSendBtn.disabled = false;
    chatInput.disabled = false;
    if (modelSelect) modelSelect.disabled = false;
    if (gpuSelect) gpuSelect.disabled = false;
    chatInput.focus();
  }
}
