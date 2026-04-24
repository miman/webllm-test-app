#!/usr/bin/env node

/**
 * CLI Chatbot powered by node-llama-cpp
 *
 * Runs a local LLM on your GPU (CUDA / Vulkan / Metal) or CPU.
 * No server, no API keys — everything runs locally.
 *
 * Usage:
 *   npm start
 *   npm start -- --model hf:bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M
 *
 * Commands:
 *   /gpu    — select which GPU device to use (requires restart)
 *   /model  — select which model to use (hot-swaps immediately)
 *   /remove — delete a downloaded model
 *   exit    — quit the chatbot
 */

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getLlama,
  getLlamaGpuTypes,
  LlamaChatSession,
  LlamaLogLevel,
  resolveModelFile,
  type Llama,
  type LlamaModel,
  type LlamaContext,
  type LlamaGpuType,
} from "node-llama-cpp";
import { loadSettings, saveSettings, type Settings } from "./settings.js";
import { promptModelSelection, promptModelRemoval } from "./models.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "hf:bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M";

// ---------------------------------------------------------------------------
// Active model state (mutable — swapped by /model)
// ---------------------------------------------------------------------------

let activeModel: LlamaModel | null = null;
let activeContext: LlamaContext | null = null;
let activeSession: LlamaChatSession | null = null;
let activeModelUri = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve which model to use: CLI flag > saved setting > default. */
function resolveModelUri(settings: Settings): string {
  const idx = process.argv.indexOf("--model");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  if (settings.model) {
    return settings.model;
  }
  return DEFAULT_MODEL;
}

/** Convert a saved setting string to the getLlama gpu option. */
function settingToGpuOption(value: string | undefined): "auto" | LlamaGpuType {
  if (!value || value === "auto") return "auto";
  if (value === "cpu") return false;
  return value as LlamaGpuType;
}

/**
 * Apply the GPU device environment variable so llama.cpp picks the right
 * physical device. Must be called BEFORE getLlama().
 */
function applyGpuDeviceEnv(settings: Settings): void {
  if (settings.gpuDevice === undefined) return;

  const deviceIdx = String(settings.gpuDevice);
  const backend = settings.gpu ?? "auto";

  if (backend === "vulkan" || backend === "auto") {
    process.env["GGML_VK_VISIBLE_DEVICES"] = deviceIdx;
  }
  if (backend === "cuda" || backend === "auto") {
    process.env["CUDA_VISIBLE_DEVICES"] = deviceIdx;
  }
}

/** Get a human-readable GPU description from llama instance. */
async function describeGpu(llama: Llama, settings: Settings): Promise<string> {
  const backend = llama.gpu;
  const names = await llama.getGpuDeviceNames();

  if (!backend) {
    return "CPU only (no GPU backend)";
  }

  const backendLabel = String(backend).toUpperCase();
  if (names.length === 0) return backendLabel;

  // Use the saved device index to show the correct GPU name
  const deviceIdx = settings.gpuDevice ?? 0;
  const name = names[deviceIdx] ?? names[0];
  return `${name} (${backendLabel})`;
}

// ---------------------------------------------------------------------------
// Model loading / hot-swap
// ---------------------------------------------------------------------------

/**
 * Try to find an already-downloaded model file locally before hitting the network.
 * Returns the local path if found, or null if the model needs to be downloaded.
 */
async function findLocalModel(modelUri: string): Promise<string | null> {
  // First, let resolveModelFile check without downloading
  try {
    return await resolveModelFile(modelUri, { download: false });
  } catch {
    // Not found with the current naming — try alternate naming conventions
  }

  // For hf:owner/repo:quant URIs, check both dash and dot separator variants
  const colonMatch = modelUri.match(/^hf:([^/]+)\/([^/:]+):(.+)$/);
  if (colonMatch) {
    const [, owner, repo, quant] = colonMatch;
    const repoBase = repo.replace(/-GGUF$/i, "");
    const modelsDir = path.join(os.homedir(), ".node-llama-cpp", "models");

    // Try both naming conventions that node-llama-cpp has used
    const candidates = [
      `hf_${owner}_${repoBase}.${quant}.gguf`,  // dot separator (newer)
      `hf_${owner}_${repoBase}-${quant}.gguf`,  // dash separator (older)
    ];

    for (const name of candidates) {
      const fullPath = path.join(modelsDir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Load (or reload) a model. Disposes the previous model if one is active.
 * Returns true on success, false on failure.
 */
async function loadModel(llama: Llama, modelUri: string): Promise<boolean> {
  // Dispose previous model
  if (activeSession) {
    activeSession = null;
  }
  if (activeContext) {
    await activeContext.dispose();
    activeContext = null;
  }
  if (activeModel) {
    activeModel.dispose();
    activeModel = null;
  }

  console.log(`⏳ Loading model: ${modelUri}`);

  let modelPath: string;
  try {
    // Try to find locally first (avoids unnecessary network requests)
    const localPath = await findLocalModel(modelUri);
    if (localPath) {
      modelPath = localPath;
    } else {
      // Not found locally — download it
      modelPath = await resolveModelFile(modelUri);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Failed to download/resolve model: ${msg}\n`);
    return false;
  }

  try {
    activeModel = await llama.loadModel({ modelPath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Failed to load model: ${msg}\n`);
    return false;
  }

  activeContext = await activeModel.createContext();
  activeSession = new LlamaChatSession({
    contextSequence: activeContext.getSequence(),
  });
  activeModelUri = modelUri;

  console.log("✅ Model loaded. Start chatting!\n");
  return true;
}

// ---------------------------------------------------------------------------
// GPU selection
// ---------------------------------------------------------------------------

async function promptGpuSelection(
  rl: readline.Interface,
  settings: Settings,
): Promise<boolean> {
  const supported = await getLlamaGpuTypes("supported");

  type DeviceChoice = {
    label: string;
    backend: string;
    deviceIndex: number;
    vramGB: number;
  };

  const devices: DeviceChoice[] = [];

  for (const gpuType of supported) {
    if (gpuType === false) continue;
    try {
      const probe = await getLlama({ gpu: gpuType, progressLogs: false });
      const names = await probe.getGpuDeviceNames();
      const vram = await probe.getVramState();
      const perDeviceVramGB =
        names.length > 0
          ? vram.total / names.length / (1024 * 1024 * 1024)
          : 0;
      for (let i = 0; i < names.length; i++) {
        devices.push({
          label: `${names[i]} (${String(gpuType).toUpperCase()}, ~${perDeviceVramGB.toFixed(1)} GB)`,
          backend: gpuType,
          deviceIndex: i,
          vramGB: perDeviceVramGB,
        });
      }
      await probe.dispose();
    } catch {
      // Backend not usable
    }
  }

  const currentBackend = settings.gpu ?? "auto";
  const currentDevice = settings.gpuDevice;

  console.log();
  console.log("  \x1b[1mSelect GPU device:\x1b[0m");
  console.log();

  let idx = 1;
  for (const d of devices) {
    const isCurrent =
      (currentBackend === d.backend || currentBackend === "auto") &&
      currentDevice === d.deviceIndex;
    const marker = isCurrent ? " \x1b[32m← current\x1b[0m" : "";
    console.log(`    ${idx}) ${d.label}${marker}`);
    idx++;
  }

  const cpuIsCurrent = currentBackend === "cpu";
  const cpuMarker = cpuIsCurrent ? " \x1b[32m← current\x1b[0m" : "";
  console.log(`    ${idx}) CPU only (no GPU)${cpuMarker}`);
  const cpuIdx = idx;
  idx++;

  const autoIsCurrent =
    currentBackend === "auto" && currentDevice === undefined;
  const autoMarker = autoIsCurrent ? " \x1b[32m← current\x1b[0m" : "";
  console.log(`    ${idx}) Auto (let node-llama-cpp decide)${autoMarker}`);
  const autoIdx = idx;

  console.log(`    0) Cancel`);
  console.log();

  return new Promise<boolean>((resolve) => {
    rl.question("  Enter number: ", (answer) => {
      const num = parseInt(answer.trim(), 10);

      if (isNaN(num) || num === 0 || num < 0 || num > autoIdx) {
        console.log("  Cancelled.\n");
        resolve(false);
        return;
      }

      if (num === autoIdx) {
        settings.gpu = "auto";
        delete settings.gpuDevice;
        delete settings.gpuVramGB;
        saveSettings(settings);
        console.log("  ✅ GPU preference saved: auto");
      } else if (num === cpuIdx) {
        settings.gpu = "cpu";
        delete settings.gpuDevice;
        delete settings.gpuVramGB;
        saveSettings(settings);
        console.log("  ✅ GPU preference saved: CPU only");
      } else {
        const chosen = devices[num - 1];
        settings.gpu = chosen.backend;
        settings.gpuDevice = chosen.deviceIndex;
        settings.gpuVramGB = Math.round(chosen.vramGB * 10) / 10;
        saveSettings(settings);
        console.log(`  ✅ GPU preference saved: ${chosen.label}`);
      }

      console.log(
        "  \x1b[33mRestart the chatbot for the GPU change to take effect.\x1b[0m\n",
      );
      resolve(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const settings = loadSettings();
  const modelUri = resolveModelUri(settings);

  // Apply GPU device selection env vars BEFORE initializing llama
  applyGpuDeviceEnv(settings);

  const gpuOption = settingToGpuOption(settings.gpu);
  const llama = await getLlama({
    gpu: gpuOption,
    logLevel: LlamaLogLevel.warn,
  });
  const gpuDesc = await describeGpu(llama, settings);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       CLI Chatbot · node-llama-cpp              ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Model : ${modelUri}`);
  console.log(`  GPU   : ${gpuDesc}`);
  console.log();
  console.log(`  Commands: /model, /gpu, /remove, exit`);
  console.log();

  // Initial model load
  const ok = await loadModel(llama, modelUri);
  if (!ok) {
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Interactive REPL
  // ------------------------------------------------------------------
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question("\x1b[36mYou:\x1b[0m ", async (input: string) => {
      const text = input.trim();

      if (!text) {
        prompt();
        return;
      }

      // --- Exit ---
      if (text.toLowerCase() === "exit") {
        console.log("\nGoodbye! 👋");
        rl.close();
        if (activeContext) await activeContext.dispose();
        if (activeModel) activeModel.dispose();
        await llama.dispose();
        return;
      }

      // --- /gpu command ---
      if (text.toLowerCase() === "/gpu") {
        await promptGpuSelection(rl, settings);
        prompt();
        return;
      }

      // --- /model command ---
      if (text.toLowerCase() === "/model") {
        const changed = await promptModelSelection(rl, settings, llama);
        if (changed && settings.model && settings.model !== activeModelUri) {
          await loadModel(llama, settings.model);
        }
        prompt();
        return;
      }

      // --- /remove command ---
      if (text.toLowerCase() === "/remove") {
        const deletedUri = await promptModelRemoval(rl, settings);
        // If the deleted model was the active one, fall back to default
        if (deletedUri && deletedUri === activeModelUri) {
          console.log("  Active model was deleted. Loading default model…\n");
          settings.model = DEFAULT_MODEL;
          saveSettings(settings);
          await loadModel(llama, DEFAULT_MODEL);
        }
        prompt();
        return;
      }

      // --- Chat ---
      if (!activeSession) {
        console.log("\x1b[31mNo model loaded. Use /model to select one.\x1b[0m\n");
        prompt();
        return;
      }

      process.stdout.write("\x1b[33mAI:\x1b[0m ");

      try {
        const startTime = performance.now();
        let tokenCount = 0;

        await activeSession.prompt(text, {
          onTextChunk(chunk: string) {
            process.stdout.write(chunk);
            tokenCount++;
          },
        });

        const elapsed = (performance.now() - startTime) / 1000;
        console.log();

        if (tokenCount > 0) {
          const tokSec = (tokenCount / elapsed).toFixed(1);
          console.log(
            `\x1b[2m  ~${tokenCount} chunks · ${elapsed.toFixed(1)}s · ~${tokSec} tok/s\x1b[0m`,
          );
        }
        console.log();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n\x1b[31mError: ${msg}\x1b[0m\n`);
      }

      prompt();
    });
  };

  prompt();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
