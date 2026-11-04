import { requireAuth } from '../auth.js';

// Provider is picked by which key is configured in /etc/fitness-api.env (Gemini preferred).
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? 'nvidia/nemotron-3.5-super-vl-120b-a12b';
// Give up on slow providers so the app never hangs; a photo usually takes 1-10 s.
const TIMEOUT_MS = 45000;
const provider = GEMINI_KEY ? 'gemini' : NVIDIA_KEY ? 'nvidia' : null;

const PROMPT = `Du bist Ernährungsexperte. Erkenne alle Lebensmittel auf dem Foto und schätze für jedes die Menge in Gramm
und die Nährwerte für genau diese Menge (nicht pro 100 g). Nutze typische deutsche Portionsgrößen, wenn nichts zum
Größenvergleich zu sehen ist. Antworte NUR mit JSON in diesem Format:
{"items":[{"name":"Spaghetti Bolognese","grams":350,"kcal":520,"protein":24,"carbs":68,"fat":16}],"note":"kurzer Hinweis zur Unsicherheit"}
Namen auf Deutsch. Wenn kein Essen erkennbar ist: {"items":[],"note":"Kein Essen erkannt"}.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['items'],
};

async function askGemini(image, mimeType) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${json.error?.message ?? res.status}`);
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

async function askNvidia(image, mimeType) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${NVIDIA_KEY}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      // Nemotron is a reasoning model; thinking adds ~10 s and can eat the token budget before the answer.
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}` } },
          ],
        },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`NVIDIA: ${json.detail ?? json.error?.message ?? res.status}`);
  const message = json.choices?.[0]?.message;
  return message?.content ?? message?.reasoning_content ?? '';
}

/** Extracts and sanitises the JSON object from a model reply (which may wrap it in prose or ``` fences). */
export function parseReply(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('KI-Antwort nicht lesbar');
  const data = JSON.parse(text.slice(start, end + 1));
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const items = (Array.isArray(data.items) ? data.items : [])
    .filter((i) => i && typeof i.name === 'string' && n(i.grams) > 0)
    .slice(0, 15)
    .map((i) => ({ name: i.name.slice(0, 100), grams: n(i.grams), kcal: n(i.kcal), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat) }));
  return { items, note: typeof data.note === 'string' ? data.note.slice(0, 300) : null };
}

// Per-user limit so a leaked token can't burn through the free quota.
const usage = new Map();
const DAILY_LIMIT = 50;

function overLimit(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(userId);
  if (!u || u.day !== day) {
    usage.set(userId, { day, count: 1 });
    return false;
  }
  u.count += 1;
  return u.count > DAILY_LIMIT;
}

export default async function aiRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/ai/status', async () => ({ enabled: provider != null, provider }));

  app.post(
    '/ai/food-photo',
    {
      schema: {
        body: {
          type: 'object',
          required: ['image'],
          properties: {
            image: { type: 'string', minLength: 100, maxLength: 7_000_000 }, // base64
            mimeType: { enum: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'], default: 'image/jpeg' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!provider) return reply.code(503).send({ error: 'KI ist auf dem Server noch nicht eingerichtet (API-Key fehlt)' });
      if (overLimit(req.userId)) return reply.code(429).send({ error: `Tageslimit von ${DAILY_LIMIT} Fotos erreicht` });

      const { image, mimeType } = req.body;
      let text;
      try {
        text = provider === 'gemini' ? await askGemini(image, mimeType) : await askNvidia(image, mimeType);
      } catch (err) {
        req.log.warn({ err: err.message }, 'ai request failed');
        return reply.code(502).send({ error: 'KI-Dienst nicht erreichbar, bitte später erneut versuchen' });
      }
      try {
        return parseReply(text);
      } catch {
        req.log.warn({ text: text.slice(0, 500) }, 'ai reply unparseable');
        return reply.code(502).send({ error: 'KI-Antwort konnte nicht gelesen werden, bitte nochmal versuchen' });
      }
    },
  );
}
