// Jedino mesto koje zna za AI servis. Za promenu provajdera menja se samo ovaj fajl.
// Vraća { bytes: Uint8Array, mime: string } ili baca ProviderError.

import { GoogleGenAI } from '@google/genai';
import { STYLE_PROMPT } from './prompt.js';

export class ProviderError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

const GEMINI_TIMEOUT_MS = 90_000;

export async function generateStylized(env, photoBytes, photoMime) {
  const provider = (env.PROVIDER || 'mock').toLowerCase();
  if (provider === 'gemini') return generateWithGemini(env, photoBytes, photoMime);
  return generateMock(env, photoBytes, photoMime);
}

async function generateMock(env, photoBytes, photoMime) {
  const delay = Number(env.MOCK_DELAY_MS || 4000);
  await new Promise((r) => setTimeout(r, delay));
  // Samo za testiranje grešaka: MOCK_FAIL = "1".
  if (env.MOCK_FAIL === '1') throw new ProviderError('Demo greška (MOCK_FAIL)');
  // Demo: vraća originalnu sliku. Stranica jasno prikazuje "DEMO".
  return { bytes: photoBytes, mime: photoMime || 'image/jpeg' };
}

async function generateWithGemini(env, photoBytes, photoMime) {
  if (!env.GEMINI_API_KEY) {
    throw new ProviderError('GEMINI_API_KEY nije podešen', { retryable: false });
  }
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.GEMINI_MODEL || 'gemini-nano-banana-2.1',
      contents: [
        {
          role: 'user',
          parts: [
            { text: STYLE_PROMPT },
            { inlineData: { mimeType: photoMime || 'image/jpeg', data: toBase64(photoBytes) } },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: env.ASPECT_RATIO || '3:4',
          imageSize: env.IMAGE_SIZE || '2K',
        },
        // Ne čuvati zahtev u logovima projekta (pored isključenog logovanja u AI Studiju).
        store: false,
        abortSignal: controller.signal,
      },
    });
  } catch (err) {
    if (controller.signal.aborted) throw new ProviderError('Isteklo vreme za generisanje');
    let msg = String(err?.message || err);
    try { msg = JSON.parse(msg)?.error?.message || msg; } catch (_) { /* nije JSON */ }
    const status = err?.status ?? err?.code;
    // Pogrešan ključ / dozvole / billing: nema smisla ponavljati.
    if (status === 400 || status === 401 || status === 403) {
      throw new ProviderError(`Gemini greška ${status}: ${msg.slice(0, 200)}`, { retryable: false });
    }
    throw new ProviderError(`Gemini greška: ${msg.slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }

  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason =
      response?.promptFeedback?.blockReason || candidate?.finishReason || 'bez slike u odgovoru';
    throw new ProviderError(`Model nije vratio sliku (${reason})`);
  }
  return {
    bytes: fromBase64(img.inlineData.data),
    mime: img.inlineData.mimeType || 'image/png',
  };
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
