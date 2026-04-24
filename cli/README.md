# CLI Chatbot

A local AI chatbot that runs entirely on your machine using [node-llama-cpp](https://node-llama-cpp.withcat.ai/). No server, no API keys — everything runs on your GPU (or CPU).

## Requirements

- Node.js 20 or later
- A GPU with Vulkan, CUDA, or Metal support (optional — falls back to CPU)

## Getting started

```bash
cd cli
npm install
npm start
```

On first run the default model (SmolLM2 360M, ~250 MB) is downloaded automatically.

## Chat commands

| Command   | Description                                      |
|-----------|--------------------------------------------------|
| `/model`  | Pick a model from the curated catalog (hot-swaps instantly) |
| `/gpu`    | Select which GPU device and backend to use (requires restart) |
| `/remove` | Delete a downloaded model to free disk space     |
| `exit`    | Quit the chatbot                                 |

## Selecting a model

Type `/model` during a chat session. The list is filtered to models that fit in your selected GPU's VRAM. Downloaded models appear first with a ★ marker.

You can also pass a model directly via the CLI:

```bash
npm start -- --model hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M
```

Any GGUF model on Hugging Face works — use the `hf:owner/repo:quant` format.

## Selecting a GPU

Type `/gpu` to see all available GPU devices on your system. The selection is saved and used on next startup. On multi-GPU systems this lets you pick between your dedicated and integrated GPU.

## Model catalog

The curated model list lives in `src/models.ts` — the `MODEL_CATALOG` array. Models are organized by VRAM tier:

| Tier          | VRAM needed | Example models                        |
|---------------|-------------|---------------------------------------|
| Tiny (≤1 GB)  | ≤1 GB       | SmolLM2 135M/360M, Gemma 3 1B, Qwen2.5 0.5B |
| Small (≤4 GB) | 2–4 GB      | SmolLM2 1.7B, Llama 3.2 3B, Qwen2.5 3B |
| Medium (≤8 GB)| 6–8 GB      | Gemma 3 4B, Mistral 7B, Llama 3.1 8B |
| Large (≤16 GB)| 12–16 GB    | Mistral Small 24B, Qwen2.5 14B, Gemma 3 27B |

To add a model, add an entry to the array with `name`, `uri`, `size`, `vramGB`, and `description`.

## File locations

| What              | Path                                  |
|-------------------|---------------------------------------|
| Settings          | `~/.webgpu-test/settings.json`        |
| Downloaded models | `~/.node-llama-cpp/models/`           |
| Source code       | `cli/src/`                            |
| Compiled output   | `cli/dist/`                           |

## Project structure

```
cli/
├── src/
│   ├── index.ts      # Entry point, REPL, GPU selection
│   ├── models.ts     # Model catalog, /model and /remove commands
│   └── settings.ts   # Persistent settings (GPU, model preferences)
├── package.json
├── tsconfig.json
└── README.md
```

## Scripts

| Script          | Description                              |
|-----------------|------------------------------------------|
| `npm start`     | Build and run                            |
| `npm run build` | Compile TypeScript only                  |
| `npm run chat`  | Run without rebuilding (use after build) |
