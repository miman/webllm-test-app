/**
 * AI Summarizer module — uses Chrome's built-in Prompt API (Gemini Nano)
 * to generate a friendly weather summary from structured weather data.
 * Vanilla ES module, no build step required.
 */

/**
 * Check whether Chrome's built-in Prompt API is available in the current browser.
 * @returns {Promise<{available: boolean, message?: string}>}
 */
export async function checkAIAvailability() {
  // Chrome 138+ uses the global LanguageModel; older versions used window.ai.languageModel
  const api = (typeof LanguageModel !== 'undefined' && LanguageModel) ||
              window.ai?.languageModel;

  if (!api) {
    return {
      available: false,
      message:
        'Chrome\'s built-in AI (Prompt API) is not available. ' +
        'Please use Chrome 138+ and enable the flags: ' +
        'chrome://flags/#optimization-guide-on-device-model and ' +
        'chrome://flags/#prompt-api-for-gemini-nano-multimodal-input',
    };
  }

  try {
    const availability = await api.availability();
    if (availability === 'unavailable') {
      return {
        available: false,
        message:
          'The AI model is not available on this device. ' +
          'Check chrome://on-device-internals for model download status.',
      };
    }
    return { available: true };
  } catch {
    return { available: true }; // availability() not supported, try anyway
  }
}

/**
 * Format a WeatherData object into a human-readable text block for the prompt.
 * @param {{ location: string, fetchedAt: string, days: Array<Object> }} weatherData
 * @returns {string}
 */
function formatWeatherData(weatherData) {
  const lines = weatherData.days.map((day) => {
    const parts = [`${day.date}`];
    if (day.temperatureRange) {
      parts.push(`Temperature: ${day.temperatureRange}`);
    } else if (day.temperature) {
      parts.push(`Temperature: ${day.temperature}`);
    }
    if (day.condition) parts.push(`Condition: ${day.condition}`);
    if (day.wind) parts.push(`Wind: ${day.wind}`);
    if (day.precipitation) parts.push(`Precipitation: ${day.precipitation}`);
    return parts.join(' | ');
  });

  return lines.join('\n');
}

/**
 * Generate a friendly weather summary using Chrome's built-in Prompt API.
 *
 * Creates a session with a system prompt, sends the formatted weather data,
 * and returns the AI-generated summary. The session is destroyed after use.
 *
 * @param {{ location: string, fetchedAt: string, days: Array<Object> }} weatherData
 * @returns {Promise<string>} The AI-generated summary text.
 * @throws {Error} If the Prompt API session cannot be created or the prompt fails.
 */
export async function generateSummary(weatherData) {
  // Chrome 138+ uses the global LanguageModel; older versions used window.ai.languageModel
  const api = (typeof LanguageModel !== 'undefined' && LanguageModel) ||
              window.ai?.languageModel;

  if (!api) {
    throw new Error(
      'Chrome\'s built-in AI (Prompt API) is not available. Cannot generate summary.'
    );
  }

  const formatted = formatWeatherData(weatherData);

  const userPrompt =
    `Summarize the following weather forecast for ${weatherData.location} in a friendly, ` +
    'concise way. Cover today and the next few days. Include temperature, ' +
    'conditions, wind, and precipitation.\n\n' +
    `Weather data:\n${formatted}`;

  let session;
  try {
    session = await api.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [
        { role: 'system', content: 'You are a helpful weather assistant.' },
      ],
    });
  } catch (err) {
    throw new Error(`Failed to create AI session: ${err.message}`);
  }

  try {
    const result = await session.prompt(userPrompt);
    return result;
  } catch (err) {
    throw new Error(`AI failed to generate summary: ${err.message}`);
  } finally {
    session.destroy();
  }
}

/**
 * Send a freeform chat message using Chrome's built-in Prompt API.
 * Maintains conversation history for multi-turn chat.
 *
 * @param {string} userMessage  The user's message.
 * @param {Array<{role: string, content: string}>} history  Previous messages in the conversation.
 * @returns {Promise<string>} The AI-generated reply.
 */
export async function chatWithAI(userMessage, history = []) {
  const api = (typeof LanguageModel !== 'undefined' && LanguageModel) ||
              window.ai?.languageModel;

  if (!api) {
    throw new Error('Chrome\'s built-in AI (Prompt API) is not available.');
  }

  let session;
  try {
    session = await api.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [
        { role: 'system', content: 'You are a helpful, friendly AI assistant. Answer questions clearly and concisely.' },
        ...history,
      ],
    });
  } catch (err) {
    throw new Error(`Failed to create AI session: ${err.message}`);
  }

  try {
    return await session.prompt(userMessage);
  } catch (err) {
    throw new Error(`AI failed to respond: ${err.message}`);
  } finally {
    session.destroy();
  }
}
