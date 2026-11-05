import { requireAuth } from '../auth.js';

// Provider is picked by which key is configured in /etc/fitness-api.env (Gemini preferred).
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? 'nvidia/nemotron-3.5-super-vl-120b-a12b';
// Give up on slow providers so the app never hangs; a photo usually takes 1-10 s.
const TIMEOUT_MS = 60000;
const provider = GEMINI_KEY ? 'gemini' : NVIDIA_KEY ? 'nvidia' : null;

const FOOD_PROMPT = `Du bist Ernährungsexperte. Erkenne alle Lebensmittel und Getränke auf dem Foto und schätze für jedes die
Menge in Gramm (bei Getränken Milliliter, 1 ml = 1 g) und die Nährwerte für genau diese Menge (nicht pro 100 g). Nutze
typische deutsche Portionsgrößen, wenn nichts zum Größenvergleich zu sehen ist. Setze "isWater": true nur für reines
Wasser (Leitungswasser, Mineralwasser, Sprudel ohne Zusätze), sonst false. Antworte NUR mit JSON in diesem Format:
{"items":[{"name":"Spaghetti Bolognese","grams":350,"kcal":520,"protein":24,"carbs":68,"fat":16,"isWater":false}],"note":"kurzer Hinweis zur Unsicherheit"}
Namen auf Deutsch. Wenn nichts erkennbar ist: {"items":[],"note":"Nichts erkannt"}.`;

const RECIPE_PROMPT = `Du bist Ernährungsexperte. Auf dem Bild ist ein Rezept (Kochbuch, Zettel, Bildschirmfoto). Lies es aus.
Falls das Rezept Wahlmöglichkeiten enthält, die die Zutaten verändern (z. B. "Reis oder Nudeln", Varianten, oder mehrere
Mengenspalten für 2 oder 4 Personen), stelle dafür Rückfragen. Wenn unten "Antworten" stehen, verwende genau diese
Auswahl und stelle keine Fragen mehr.
Schätze für jede Zutat die Menge in Gramm (Stück, EL, TL, Prisen usw. sinnvoll umrechnen) und die Nährwerte für genau
diese Menge. Antworte NUR mit JSON in diesem Format:
{"name":"Spaghetti Carbonara","servings":4,
 "questions":[{"id":"beilage","question":"Reis oder Nudeln?","options":["Reis","Nudeln"]}],
 "ingredients":[{"name":"Spaghetti","grams":400,"kcal":1420,"protein":50,"carbs":288,"fat":6}],
 "note":"kurzer Hinweis"}
"questions" ist leer, wenn es keine Wahlmöglichkeiten gibt oder Antworten vorliegen. Zutaten-Namen auf Deutsch.
Wenn kein Rezept erkennbar ist: {"name":"","servings":1,"questions":[],"ingredients":[],"note":"Kein Rezept erkannt"}.`;

async function askGemini(prompt, image, mimeType) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini: ${json.error?.message ?? res.status}`);
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

async function askNvidia(prompt, image, mimeType) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${NVIDIA_KEY}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      temperature: 0.2,
      max_tokens: 4096,
      // Nemotron is a reasoning model; thinking adds ~10 s and can eat the token budget before the answer.
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
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

/** Extracts the JSON object from a model reply (which may wrap it in prose or ``` fences). */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('KI-Antwort nicht lesbar');
  return JSON.parse(text.slice(start, end + 1));
}

const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function portionItems(list, limit) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && typeof i.name === 'string' && n(i.grams) > 0)
    .slice(0, limit)
    .map((i) => ({ name: str(i.name, 100), grams: n(i.grams), kcal: n(i.kcal), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat) }));
}

export function parseReply(text) {
  const data = extractJson(text);
  const raw = Array.isArray(data.items) ? data.items.filter((i) => i && typeof i.name === 'string' && n(i.grams) > 0) : [];
  const items = portionItems(raw, 15).map((item, idx) => ({ ...item, isWater: raw[idx]?.isWater === true }));
  return { items, note: str(data.note, 300) || null };
}

export function parseRecipe(text) {
  const data = extractJson(text);
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .filter((q) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length > 1)
    .slice(0, 5)
    .map((q, i) => ({
      id: str(q.id, 40) || `q${i}`,
      question: str(q.question, 200),
      options: q.options.filter((o) => typeof o === 'string').slice(0, 6).map((o) => o.slice(0, 80)),
    }));
  return {
    name: str(data.name, 100),
    servings: Math.min(50, Math.max(1, Math.round(n(data.servings)) || 1)),
    questions,
    ingredients: portionItems(data.ingredients, 50),
    note: str(data.note, 300) || null,
  };
}

// Per-user limit so a leaked token can't burn through the free quota.
const usage = new Map();
const DAILY_LIMIT = 80;

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

const imageBody = {
  image: { type: 'string', minLength: 100, maxLength: 7_000_000 }, // base64
  mimeType: { enum: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'], default: 'image/jpeg' },
};

/** Runs a vision prompt with the shared limit/error handling and parses the reply. */
async function analyze(req, reply, prompt, parse) {
  if (!provider) return reply.code(503).send({ error: 'KI ist auf dem Server noch nicht eingerichtet (API-Key fehlt)' });
  if (overLimit(req.userId)) return reply.code(429).send({ error: `Tageslimit von ${DAILY_LIMIT} Fotos erreicht` });

  const { image, mimeType } = req.body;
  let text;
  try {
    text = provider === 'gemini' ? await askGemini(prompt, image, mimeType) : await askNvidia(prompt, image, mimeType);
  } catch (err) {
    req.log.warn({ err: err.message }, 'ai request failed');
    return reply.code(502).send({ error: 'KI-Dienst nicht erreichbar, bitte später erneut versuchen' });
  }
  try {
    return parse(text);
  } catch {
    req.log.warn({ text: text.slice(0, 500) }, 'ai reply unparseable');
    return reply.code(502).send({ error: 'KI-Antwort konnte nicht gelesen werden, bitte nochmal versuchen' });
  }
}

export default async function aiRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/ai/status', async () => ({ enabled: provider != null, provider }));

  app.post('/ai/food-photo', { schema: { body: { type: 'object', required: ['image'], properties: imageBody } } }, (req, reply) =>
    analyze(req, reply, FOOD_PROMPT, parseReply),
  );

  // Reads a recipe from a photo. When it has alternatives, the reply contains questions; the app asks them
  // and calls again with `answers` ({ questionId: chosenOption }) to get the final ingredient list.
  app.post(
    '/ai/recipe-photo',
    {
      schema: {
        body: {
          type: 'object',
          required: ['image'],
          properties: { ...imageBody, answers: { type: 'object', additionalProperties: { type: 'string', maxLength: 200 } } },
        },
      },
    },
    (req, reply) => {
      const answers = Object.entries(req.body.answers ?? {});
      const prompt = answers.length
        ? `${RECIPE_PROMPT}\n\nAntworten:\n${answers.map(([q, a]) => `- ${q}: ${a}`).join('\n')}`
        : RECIPE_PROMPT;
      return analyze(req, reply, prompt, parseRecipe);
    },
  );
}
