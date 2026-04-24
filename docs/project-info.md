# Project Information

## Project Structure

```
├── docs/                 # Documentation files
│   └── project-info.md   # Project structure and tech stack
├── index.html            # Two-view UI with tab navigation (HTML + CSS, no framework)
├── app.js                # Application controller — navigation, geocoding, weather flow
├── scraper.js            # City geocoding (Nominatim) + Open-Meteo forecast fetching
├── ai-summarizer.js      # Chrome Prompt API integration (summaries + chat)
├── webgpu-fallback.js    # WebGPU + web-llm fallback (summaries + chat)
├── chatbot.js            # Chatbot UI controller with markdown rendering
├── server.js             # Node.js server — static files + API proxies
├── package.json          # Node.js project metadata and scripts
```

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES modules, no build step)
- **Weather Data**: [Open-Meteo API](https://open-meteo.com/) (free, no API key required)
- **Geocoding**: [Nominatim / OpenStreetMap](https://nominatim.openstreetmap.org/) (free, no API key required)
- **Primary AI**: Chrome Prompt API / Gemini Nano (local, on-device AI)
- **Fallback AI**: MLC web-llm via CDN (WebGPU fallback)
- **Backend**: Node.js `http` module (static server + API proxies)

## API Proxies

The Node.js server proxies two external APIs to avoid CORS issues:

| Endpoint | Upstream | Purpose |
|----------|----------|---------|
| `/api/weather?lat=…&lon=…` | Open-Meteo | 5-day daily weather forecast |
| `/api/geocode?q=…` | Nominatim (OpenStreetMap) | City name → lat/lon resolution |
