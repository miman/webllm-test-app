/**
 * Model catalog and selection for the CLI chatbot.
 *
 * Curated list of GGUF models from Hugging Face, organized by VRAM tier.
 * One model per family (Gemma, Phi, Llama, Mistral, Qwen, SmolLM2) per tier.
 * Filters the list to only show models that fit in the available GPU VRAM.
 *
 * Edit the MODEL_CATALOG array below to customize the available models.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import type { Llama } from "node-llama-cpp";
import { type Settings, saveSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// Curated model catalog
// ---------------------------------------------------------------------------

export interface ModelEntry {
  /** Human-readable name */
  name: string;
  /** hf: URI for resolveModelFile */
  uri: string;
  /** Approximate file size (display only) */
  size: string;
  /** VRAM needed to run the model in GB (used for filtering) */
  vramGB: number;
  /** Short description */
  description: string;
}

/**
 * Curated model catalog — one model per family per VRAM tier.
 * All models use Q4_K_M quantization from bartowski's repos on Hugging Face.
 *
 * VRAM tiers:
 *   Tiny  (≤1 GB)  — runs on anything, even integrated GPUs
 *   Small (≤4 GB)  — fits on most dedicated GPUs
 *   Medium(≤8 GB)  — needs a mid-range GPU (6–8 GB VRAM)
 *   Large (≤16 GB) — needs a high-end GPU (12–16+ GB VRAM)
 */
export const MODEL_CATALOG: ModelEntry[] = [
  // ── Tiny (≤1 GB VRAM) ──────────────────────────────────────────────
  {
    name: "SmolLM2 135M",
    uri: "hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M",
    size: "~100 MB",
    vramGB: 0.5,
    description: "Smallest available, great for testing",
  },
  {
    name: "SmolLM2 360M",
    uri: "hf:bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M",
    size: "~250 MB",
    vramGB: 0.5,
    description: "Tiny and fast on any hardware",
  },
  {
    name: "Gemma 3 1B",
    uri: "hf:bartowski/google_gemma-3-1b-it-GGUF:Q4_K_M",
    size: "~0.7 GB",
    vramGB: 1,
    description: "Google's compact 1B model",
  },
  {
    name: "Llama 3.2 1B",
    uri: "hf:bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M",
    size: "~0.8 GB",
    vramGB: 1,
    description: "Meta's lightweight Llama",
  },
  {
    name: "Qwen2.5 0.5B",
    uri: "hf:bartowski/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M",
    size: "~0.4 GB",
    vramGB: 0.5,
    description: "Alibaba's smallest multilingual model",
  },

  // ── Small (≤4 GB VRAM) ─────────────────────────────────────────────
  {
    name: "SmolLM2 1.7B",
    uri: "hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M",
    size: "~1.1 GB",
    vramGB: 2,
    description: "Small but capable",
  },
  {
    name: "Llama 3.2 3B",
    uri: "hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "~2.0 GB",
    vramGB: 3,
    description: "Good balance of quality and speed",
  },
  {
    name: "Qwen2.5 3B",
    uri: "hf:bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M",
    size: "~2.0 GB",
    vramGB: 3,
    description: "Alibaba's 3B multilingual model",
  },

  // ── Medium (≤8 GB VRAM) ────────────────────────────────────────────
  {
    name: "Gemma 3 4B",
    uri: "hf:bartowski/google_gemma-3-4b-it-GGUF:Q4_K_M",
    size: "~2.5 GB",
    vramGB: 6,
    description: "Google's efficient 4B model",
  },
  {
    name: "Phi-4 Mini 3.8B",
    uri: "hf:bartowski/microsoft_Phi-4-mini-instruct-GGUF:Q4_K_M",
    size: "~2.5 GB",
    vramGB: 6,
    description: "Microsoft's efficient reasoning model",
  },
  {
    name: "Mistral 7B v0.3",
    uri: "hf:bartowski/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "~4.4 GB",
    vramGB: 6,
    description: "Mistral's solid 7B model",
  },
  {
    name: "Llama 3.1 8B",
    uri: "hf:bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M",
    size: "~4.9 GB",
    vramGB: 6,
    description: "Meta's flagship 8B model",
  },
  {
    name: "Gemma 3 12B",
    uri: "hf:bartowski/google_gemma-3-12b-it-GGUF:Q4_K_M",
    size: "~7.3 GB",
    vramGB: 8,
    description: "Google's strong 12B model",
  },
  {
    name: "Qwen2.5 7B",
    uri: "hf:bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "~4.7 GB",
    vramGB: 6,
    description: "Alibaba's strong multilingual 7B",
  },
  {
    name: "Phi-4 14B",
    uri: "hf:bartowski/phi-4-GGUF:Q4_K_M",
    size: "~8.4 GB",
    vramGB: 8,
    description: "Microsoft's large reasoning model",
  },

  // ── Large (≤16 GB VRAM) ────────────────────────────────────────────
  {
    name: "Mistral Small 24B",
    uri: "hf:bartowski/Mistral-Small-24B-Instruct-2501-GGUF:Q4_K_M",
    size: "~14.1 GB",
    vramGB: 16,
    description: "Mistral's powerful 24B model",
  },
  {
    name: "Qwen2.5 14B",
    uri: "hf:bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M",
    size: "~9.0 GB",
    vramGB: 12,
    description: "Alibaba's high-quality 14B",
  },
  {
    name: "Gemma 3 27B",
    uri: "hf:bartowski/google_gemma-3-27b-it-GGUF:Q4_K_M",
    size: "~16.3 GB",
    vramGB: 16,
    description: "Google's largest Gemma model",
  },
];

// ---------------------------------------------------------------------------
// VRAM tier labels
// ---------------------------------------------------------------------------

interface VramTier {
  label: string;
  maxGB: number;
}

const VRAM_TIERS: VramTier[] = [
  { label: "Tiny (≤1 GB VRAM)", maxGB: 1 },
  { label: "Small (≤4 GB VRAM)", maxGB: 4 },
  { label: "Medium (≤8 GB VRAM)", maxGB: 8 },
  { label: "Large (≤16 GB VRAM)", maxGB: 16 },
];

function getTierLabel(vramGB: number): string {
  for (const tier of VRAM_TIERS) {
    if (vramGB <= tier.maxGB) return tier.label;
  }
  return "Extra Large";
}

// ---------------------------------------------------------------------------
// Downloaded model detection
// ---------------------------------------------------------------------------

/** Default cache directory used by node-llama-cpp */
function getModelsDir(): string {
  return path.join(os.homedir(), ".node-llama-cpp", "models");
}

/** Get a set of filenames of all .gguf files in the cache. */
function getDownloadedModelFiles(): Set<string> {
  const dir = getModelsDir();
  const files = new Set<string>();

  try {
    const entries = fs.readdirSync(dir, { recursive: true });
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : entry.toString();
      if (name.endsWith(".gguf")) {
        files.add(name.replace(/\\/g, "/"));
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return files;
}

/** Check if a catalog model URI has a local file already downloaded. */
function isModelDownloaded(uri: string, downloadedFiles: Set<string>): boolean {
  const colonMatch = uri.match(/^hf:([^/]+)\/([^/:]+):(.+)$/);
  if (colonMatch) {
    const [, owner, repo, quant] = colonMatch;
    const repoBase = repo.replace(/-GGUF$/i, "");
    // node-llama-cpp has used both dash and dot separators between name and quant
    const candidates = [
      `hf_${owner}_${repoBase}-${quant}.gguf`,  // dash (older)
      `hf_${owner}_${repoBase}.${quant}.gguf`,  // dot  (newer)
    ];

    for (const f of downloadedFiles) {
      const lower = f.toLowerCase();
      for (const c of candidates) {
        if (lower === c.toLowerCase()) return true;
      }
    }
    return false;
  }

  // For hf:owner/repo/filename format, match by exact filename
  const filename = uri.split("/").pop() ?? "";
  if (!filename) return false;

  for (const f of downloadedFiles) {
    if (f.toLowerCase() === filename.toLowerCase()) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Interactive model selection
// ---------------------------------------------------------------------------

/**
 * Show the model catalog filtered by available VRAM and let the user pick one.
 * Downloaded models are shown first with a ★ marker.
 * Models are grouped by VRAM tier.
 */
export async function promptModelSelection(
  rl: readline.Interface,
  settings: Settings,
  llama: Llama,
): Promise<boolean> {
  const downloadedFiles = getDownloadedModelFiles();
  const currentModel = settings.model;

  // Use the stored per-device VRAM from /gpu selection.
  // Falls back to querying llama (which may report combined VRAM).
  let availableVramGB = Infinity;
  if (settings.gpuVramGB !== undefined && settings.gpuVramGB > 0) {
    availableVramGB = settings.gpuVramGB;
  } else if (settings.gpu !== "cpu") {
    try {
      const vram = await llama.getVramState();
      if (vram.total > 0) {
        availableVramGB = vram.total / (1024 * 1024 * 1024);
      }
    } catch {
      // Can't determine VRAM — show all models
    }
  }

  // Filter catalog to models that fit
  const fittingModels = MODEL_CATALOG.filter((m) => m.vramGB <= availableVramGB);

  if (fittingModels.length === 0) {
    // If nothing fits (e.g. CPU mode), show all models anyway
    fittingModels.push(...MODEL_CATALOG);
  }

  // Split into downloaded and not-downloaded
  const downloaded: ModelEntry[] = [];
  const available: ModelEntry[] = [];

  for (const entry of fittingModels) {
    if (isModelDownloaded(entry.uri, downloadedFiles)) {
      downloaded.push(entry);
    } else {
      available.push(entry);
    }
  }

  const allModels = [...downloaded, ...available];

  // Display
  console.log();
  if (availableVramGB < Infinity) {
    console.log(
      `  \x1b[1mSelect a model\x1b[0m \x1b[2m(showing models for ${availableVramGB.toFixed(1)} GB VRAM)\x1b[0m`,
    );
  } else {
    console.log("  \x1b[1mSelect a model:\x1b[0m");
  }
  console.log();

  let num = 1;

  // Downloaded models first
  if (downloaded.length > 0) {
    console.log("  \x1b[2m── ★ Downloaded ──\x1b[0m");
    let lastTier = "";
    for (const m of downloaded) {
      const tier = getTierLabel(m.vramGB);
      if (tier !== lastTier) {
        lastTier = tier;
      }
      const isCurrent = currentModel === m.uri;
      const marker = isCurrent ? " \x1b[32m← current\x1b[0m" : "";
      console.log(
        `    ${num}) ★ ${m.name} \x1b[2m${m.size} — ${m.description}\x1b[0m${marker}`,
      );
      num++;
    }
    console.log();
  }

  // Available models grouped by tier
  if (available.length > 0) {
    console.log("  \x1b[2m── Available (download on first use) ──\x1b[0m");
    let lastTier = "";
    for (const m of available) {
      const tier = getTierLabel(m.vramGB);
      if (tier !== lastTier) {
        console.log(`  \x1b[2m  ${tier}\x1b[0m`);
        lastTier = tier;
      }
      const isCurrent = currentModel === m.uri;
      const marker = isCurrent ? " \x1b[32m← current\x1b[0m" : "";
      console.log(
        `    ${num}) ${m.name} \x1b[2m${m.size} — ${m.description}\x1b[0m${marker}`,
      );
      num++;
    }
    console.log();
  }

  console.log(`    0) Cancel`);
  console.log();

  return new Promise<boolean>((resolve) => {
    rl.question("  Enter number: ", (answer) => {
      const n = parseInt(answer.trim(), 10);

      if (isNaN(n) || n === 0 || n < 0 || n > allModels.length) {
        console.log("  Cancelled.\n");
        resolve(false);
        return;
      }

      const chosen = allModels[n - 1];
      settings.model = chosen.uri;
      saveSettings(settings);

      const star = isModelDownloaded(chosen.uri, downloadedFiles) ? "★ " : "";
      console.log(`  ✅ Model selected: ${star}${chosen.name}\n`);
      resolve(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Model removal
// ---------------------------------------------------------------------------

interface DownloadedModel {
  /** Full path to the .gguf file */
  filePath: string;
  /** Filename only */
  fileName: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeLabel: string;
  /** Matching catalog entry name, if any */
  catalogName: string | null;
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Find the catalog entry name that matches a downloaded filename. */
function findCatalogName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const entry of MODEL_CATALOG) {
    const colonMatch = entry.uri.match(/^hf:([^/]+)\/([^/:]+):(.+)$/);
    if (colonMatch) {
      const [, owner, repo, quant] = colonMatch;
      const repoBase = repo.replace(/-GGUF$/i, "");
      const candidates = [
        `hf_${owner}_${repoBase}-${quant}.gguf`.toLowerCase(),
        `hf_${owner}_${repoBase}.${quant}.gguf`.toLowerCase(),
      ];
      if (candidates.includes(lower)) return entry.name;
    }
  }
  return null;
}

/** Get all downloaded models with metadata. */
function getDownloadedModels(): DownloadedModel[] {
  const dir = getModelsDir();
  const models: DownloadedModel[] = [];

  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".gguf")) continue;
      const filePath = path.join(dir, entry);
      const stat = fs.statSync(filePath);
      models.push({
        filePath,
        fileName: entry,
        sizeBytes: stat.size,
        sizeLabel: formatBytes(stat.size),
        catalogName: findCatalogName(entry),
      });
    }
  } catch {
    // Directory doesn't exist
  }

  // Sort largest first so big files are easy to spot
  models.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return models;
}

/**
 * Show downloaded models and let the user pick one to delete.
 * Returns the URI of the deleted model if it was the active one, or null.
 */
export async function promptModelRemoval(
  rl: readline.Interface,
  settings: Settings,
): Promise<string | null> {
  const models = getDownloadedModels();

  if (models.length === 0) {
    console.log("\n  No downloaded models found.\n");
    return null;
  }

  console.log();
  console.log("  \x1b[1mRemove a downloaded model:\x1b[0m");
  console.log();

  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const name = m.catalogName ? `${m.catalogName} ` : "";
    console.log(
      `    ${i + 1}) ${name}\x1b[2m${m.fileName} (${m.sizeLabel})\x1b[0m`,
    );
  }

  console.log(`    0) Cancel`);
  console.log();

  return new Promise<string | null>((resolve) => {
    rl.question("  Enter number to delete: ", (answer) => {
      const num = parseInt(answer.trim(), 10);

      if (isNaN(num) || num === 0 || num < 0 || num > models.length) {
        console.log("  Cancelled.\n");
        resolve(null);
        return;
      }

      const chosen = models[num - 1];

      // Confirm deletion
      const label = chosen.catalogName ?? chosen.fileName;
      rl.question(
        `  \x1b[33mDelete ${label} (${chosen.sizeLabel})? [y/N]\x1b[0m `,
        (confirm) => {
          if (confirm.trim().toLowerCase() !== "y") {
            console.log("  Cancelled.\n");
            resolve(null);
            return;
          }

          try {
            fs.unlinkSync(chosen.filePath);
            console.log(`  🗑️  Deleted: ${chosen.fileName}\n`);

            // Check if the deleted model was the currently selected one
            if (settings.model) {
              const downloadedFiles = new Set([chosen.fileName]);
              if (isModelDownloaded(settings.model, downloadedFiles)) {
                return resolve(settings.model);
              }
            }
            resolve(null);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`  \x1b[31mFailed to delete: ${msg}\x1b[0m\n`);
            resolve(null);
          }
        },
      );
    });
  });
}
