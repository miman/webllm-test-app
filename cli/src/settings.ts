/**
 * Persistent settings stored in cli/.chatbot-settings.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SETTINGS_DIR = path.join(os.homedir(), ".webgpu-test");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");

export interface Settings {
  /** GPU backend: "auto" | "cuda" | "vulkan" | "metal" | "cpu" */
  gpu?: string;
  /** Index of the selected GPU device (within the chosen backend) */
  gpuDevice?: number;
  /** Total VRAM in GB of the selected GPU device (set by /gpu) */
  gpuVramGB?: number;
  /** Selected model URI (hf: URI or local path) */
  model?: string;
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw) as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}
