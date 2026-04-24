/**
 * Scraper module — fetches weather forecast data from Open-Meteo API.
 * Supports any city via lat/lon coordinates.
 * Vanilla ES module, no build step required.
 */

// WMO weather interpretation codes → human-readable conditions
const WMO_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

/**
 * Convert a wind direction in degrees to a compass abbreviation.
 * @param {number} deg  Wind direction in degrees (0–360).
 * @returns {string} Compass direction (e.g. "N", "SW", "NE").
 */
function windDirection(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Geocode a city name to { lat, lon, displayName } via the server proxy.
 * @param {string} cityName  The city to look up.
 * @returns {Promise<{ lat: number, lon: number, displayName: string }>}
 */
export async function geocodeCity(cityName) {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(cityName)}`);
  if (!res.ok) {
    throw new Error(`Geocoding failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.length) {
    throw new Error(`City not found: "${cityName}"`);
  }
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

/**
 * Fetch weather JSON from Open-Meteo API (via server proxy).
 * @param {number} lat  Latitude.
 * @param {number} lon  Longitude.
 * @returns {Promise<Object>} Raw JSON response.
 */
export async function fetchWeatherJson(lat = 57.71, lon = 11.97) {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch weather data: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Parse Open-Meteo JSON response into structured WeatherData.
 * @param {Object} json      Raw Open-Meteo API response.
 * @param {string} location  City name to include in the result.
 * @returns {{ location: string, fetchedAt: string, days: Array<Object> }}
 */
export function parseWeatherData(json, location = 'Göteborg') {
  const { daily } = json;
  const days = [];

  for (let i = 0; i < daily.time.length; i++) {
    const dt = new Date(daily.time[i] + 'T12:00:00');
    const dayName = dt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });

    const minT = Math.round(daily.temperature_2m_min[i]);
    const maxT = Math.round(daily.temperature_2m_max[i]);
    const condition = WMO_CODES[daily.weathercode[i]] || '';
    const windSpeed = Math.round(daily.windspeed_10m_max[i] / 3.6); // km/h → m/s
    const windDir = windDirection(daily.winddirection_10m_dominant[i]);
    const precip = daily.precipitation_sum[i].toFixed(1);

    days.push({
      date: dayName,
      temperature: `${maxT}°C`,
      temperatureRange: `${minT}°C – ${maxT}°C`,
      condition,
      wind: windSpeed ? `${windDir} ${windSpeed} m/s` : '',
      precipitation: `${precip} mm`,
    });
  }

  return {
    location,
    fetchedAt: new Date().toISOString(),
    days,
  };
}

/**
 * Main entry point — fetch weather for given coordinates and parse into WeatherData.
 * @param {number} [lat=57.71]        Latitude.
 * @param {number} [lon=11.97]        Longitude.
 * @param {string} [location='Göteborg']  City name for display.
 * @returns {Promise<{ location: string, fetchedAt: string, days: Array<Object> }>}
 */
export async function fetchWeatherData(lat = 57.71, lon = 11.97, location = 'Göteborg') {
  const json = await fetchWeatherJson(lat, lon);
  return parseWeatherData(json, location);
}
