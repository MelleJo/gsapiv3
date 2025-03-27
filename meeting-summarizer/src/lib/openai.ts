import OpenAI from 'openai';

// Check if API key exists and log a helpful message if it doesn't
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn('⚠️ Waarschuwing: OPENAI_API_KEY omgevingsvariabele ontbreekt of is leeg. API-aanroepen zullen mislukken.');
}

const openai = new OpenAI({
  apiKey,
  // Using a proxy configuration if it's set in environment variables
   httpAgent: process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : undefined,

   // Better networking options
   timeout: 600000, // 10 minute timeout (Increased for potential socket hang up issues)
   maxRetries: 2,   // Retry twice on failures (excluding 429 which has its own retry)

   // Log more details for debugging in dev
  dangerouslyAllowBrowser: process.env.NODE_ENV === 'development',
});

export default openai;
