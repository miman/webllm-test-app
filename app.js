/**
 * Application Controller — orchestrates city geocoding → weather fetch → AI summarize → display.
 * Falls back to WebGPU (web-llm) when Chrome's built-in Prompt API is unavailable.
 * Also manages navigation between the Weather and Chatbot views.
 * Vanilla ES module, no build step required.
 */

import { geocodeCity, fetchWeatherData } from './scraper.js';
import { checkAIAvailability, generateSummary } from './ai-summarizer.js';
import { checkWebGPUAvailability, generateSummaryWebGPU } from './webgpu-fallback.js';
import { initChatbot, getSelectedModelId } from './chatbot.js';

// --- DOM references (weather view) ---
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const timestampEl = document.getElementById('timestamp');
const cityInput = document.getElementById('city-input');
const checkWeatherBtn = document.getElementById('check-weather-btn');
const cityDisplay = document.getElementById('city-display');

// --- DOM references (navigation) ---
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');

// --- Application state ---
let isLoading = false;
let useWebGPU = false;

// ─── Navigation ──────────────────────────────────────────────────────────────

function switchView(viewId) {
  views.forEach((v) => v.classList.toggle('active', v.id === viewId));
  navLinks.forEach((link) =>
    link.classList.toggle('active', link.dataset.view === viewId),
  );
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(link.dataset.view);
  });
});

// ─── Weather helpers ─────────────────────────────────────────────────────────

function showLoading(message) {
  statusEl.className = 'loading';
  statusEl.innerHTML = `<span class="spinner"></span>${message}`;
  summaryEl.classList.remove('visible');
  timestampEl.classList.remove('visible');
}

function showError(message) {
  statusEl.className = 'error';
  statusEl.textContent = message;
}

function showSummary(summary, fetchedAt, displayName) {
  statusEl.className = '';
  statusEl.innerHTML = '';
  summaryEl.textContent = summary;
  summaryEl.classList.add('visible');

  if (displayName) {
    cityDisplay.textContent = displayName;
    cityDisplay.classList.add('visible');
  }

  const date = new Date(fetchedAt);
  const engine = useWebGPU ? ' (via WebGPU)' : '';
  timestampEl.textContent = `Last updated: ${date.toLocaleString()}${engine}`;
  timestampEl.classList.add('visible');
}

// ─── Weather fetch + summarize ───────────────────────────────────────────────

async function fetchAndSummarize(lat, lon, cityName) {
  showLoading('Fetching weather data…');
  const weatherData = await fetchWeatherData(lat, lon, cityName);

  if (useWebGPU) {
    const onProgress = (report) => {
      if (report.progress !== undefined && report.progress < 1) {
        showLoading(`Loading AI model… ${Math.round(report.progress * 100)}%`);
      } else {
        showLoading('Generating AI summary (WebGPU)…');
      }
    };
    const summary = await generateSummaryWebGPU(weatherData, onProgress, getSelectedModelId());
    return { summary, fetchedAt: weatherData.fetchedAt };
  } else {
    showLoading('Generating AI summary…');
    const summary = await generateSummary(weatherData);
    return { summary, fetchedAt: weatherData.fetchedAt };
  }
}

/**
 * Full flow: geocode city → fetch weather → summarize → display.
 */
async function checkWeather() {
  const city = cityInput.value.trim();
  if (!city || isLoading) return;

  isLoading = true;
  checkWeatherBtn.disabled = true;
  cityInput.disabled = true;
  cityDisplay.classList.remove('visible');

  try {
    showLoading(`Looking up "${city}"…`);
    const geo = await geocodeCity(city);

    const { summary, fetchedAt } = await fetchAndSummarize(geo.lat, geo.lon, city);
    showSummary(summary, fetchedAt, geo.displayName);
  } catch (err) {
    showError(err.message);
  } finally {
    isLoading = false;
    checkWeatherBtn.disabled = false;
    cityInput.disabled = false;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  // Detect AI engine
  const ai = await checkAIAvailability();

  if (ai.available) {
    useWebGPU = false;
  } else {
    const gpu = checkWebGPUAvailability();
    if (gpu.available) {
      useWebGPU = true;
    } else {
      showError(
        'No AI engine available. Chrome\'s Prompt API is not detected, ' +
        'and WebGPU is not supported in this browser.',
      );
      return;
    }
  }

  // Initialise chatbot with the same engine choice
  initChatbot(useWebGPU);
}

checkWeatherBtn.addEventListener('click', checkWeather);
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    checkWeather();
  }
});

init();
