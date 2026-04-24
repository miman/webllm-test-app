# Weather & AI Chat

A single-page web app with two views — **Weather Summary** and **AI Chatbot** — powered by on-device AI running entirely in the browser.

The Weather view lets you search for any city, geocodes it via OpenStreetMap, fetches a 5-day forecast from Open-Meteo, and generates a friendly AI summary. The Chat view gives you a freeform conversational interface with the same AI engine.

![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=000)
![No Build Step](https://img.shields.io/badge/No_Build_Step-Required-4caf50)
![Chrome AI](https://img.shields.io/badge/Chrome-Prompt_API-4285F4?logo=googlechrome&logoColor=fff)

## How It Works

### Weather View

1. User enters a city name (defaults to Göteborg) and clicks "Check weather".
2. The city is geocoded to lat/lon via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap).
3. A 5-day daily forecast is fetched from the [Open-Meteo API](https://open-meteo.com/).
4. The structured data is sent to an AI model with a summarization prompt.
5. The generated summary is displayed on the page.

### Chat View (default)

1. User types a message and presses Send or Enter.
2. The message is sent to the AI engine with conversation history for multi-turn context.
3. The AI reply is rendered as formatted markdown (headings, bold, code blocks, lists, etc.).

### AI Engines (automatic fallback)

| Priority | Engine | Details |
|----------|--------|---------|
| 1st | Chrome Prompt API | Gemini Nano running locally via Chrome 138+. Zero setup, instant inference. |
| 2nd | WebGPU + web-llm | Downloads and runs Gemma 2 2B (~200 MB) in-browser via [MLC web-llm](https://github.com/mlc-ai/web-llm). Works in any WebGPU-capable browser. |

The app checks for Chrome's built-in Prompt API first. If unavailable, it falls back to the WebGPU engine automatically.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (any recent version, used for the static file server and API proxies)
- A modern browser:
  - Chrome 138+ with Prompt API flags enabled (for the primary AI engine), **or**
  - Any browser with WebGPU support (Chrome, Edge, Firefox) for the fallback engine

### Run

```bash
# Clone the repo
git clone https://github.com/miman/webllm-test-app
cd webllm-test-app

# Start the local server
npm start 
```

Then open [http://localhost:3000](http://localhost:3000).

## How to configure the browser to use AI

The browser might not always use the correct GPU or if you use Chrome browser you need to do some configuration changes.
Click on the "Is the AI slow ?" link in the bottom of the page in the app to see how to fix those things.

## Project Information

For detailed information about the project structure and technology stack, see [docs/project-info.md](docs/project-info.md).
