const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

/**
 * Helper — proxy an HTTPS GET request and pipe the response back.
 */
function proxyGet(targetUrl, res, label) {
  console.log(`[proxy] ${label}: ${targetUrl}`);
  https.get(targetUrl, (apiRes) => {
    console.log(`[proxy] ${label} responded with status ${apiRes.statusCode}`);
    const chunks = [];
    apiRes.on('data', (chunk) => chunks.push(chunk));
    apiRes.on('end', () => {
      res.writeHead(apiRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(Buffer.concat(chunks));
    });
  }).on('error', (err) => {
    console.error(`[proxy] ${label} error:`, err.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: `Failed to fetch from ${label}`, details: err.message }));
  });
}

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  console.log(`${req.method} ${req.url}`);

  // ── Weather proxy (accepts ?lat=…&lon=… query params) ──────────────────
  if (parsed.pathname === '/api/weather') {
    const lat = parseFloat(parsed.query.lat) || 57.71;
    const lon = parseFloat(parsed.query.lon) || 11.97;
    const weatherUrl =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum' +
      '&timezone=auto&forecast_days=5';
    proxyGet(weatherUrl, res, 'Open-Meteo');
    return;
  }

  // ── Geocoding proxy (Nominatim) ────────────────────────────────────────
  if (parsed.pathname === '/api/geocode') {
    const q = (parsed.query.q || '').trim();
    if (!q) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing ?q= parameter' }));
      return;
    }
    const geoUrl =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    // Nominatim requires a User-Agent header
    const options = url.parse(geoUrl);
    options.headers = { 'User-Agent': 'WeatherSummaryApp/1.0' };
    https.get(options, (apiRes) => {
      const chunks = [];
      apiRes.on('data', (chunk) => chunks.push(chunk));
      apiRes.on('end', () => {
        res.writeHead(apiRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(Buffer.concat(chunks));
      });
    }).on('error', (err) => {
      console.error('[proxy] Nominatim error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Geocoding failed', details: err.message }));
    });
    return;
  }

  // ── Static file serving ────────────────────────────────────────────────
  const filePath = path.join(__dirname, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`[v4] Serving at http://localhost:${PORT}`);
  console.log(`[v4] Weather proxy: /api/weather?lat=…&lon=…`);
  console.log(`[v4] Geocode proxy: /api/geocode?q=…`);
});
