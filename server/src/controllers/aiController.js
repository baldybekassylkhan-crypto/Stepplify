import axios from 'axios';

// Baseline word-boundary patterns used by the offline fallback (and as a
// safety net even when an LLM is available) to flag Russian/English
// profanity. Not exhaustive — it's a heuristic, real coverage comes from
// the LLM check below when an API key is configured.
// Note: \b is a \w-based boundary and \w is ASCII-only in JS's default
// (non-unicode) regex mode, so it never matches around Cyrillic letters —
// these patterns intentionally skip \b and match as substrings instead.
const PROFANITY_PATTERNS = [
  /ху[ийеёя]/i,
  /пизд/i,
  /еба(?:л|н|т|ц)/i,
  /ёб(?:а|ан|ут)/i,
  /бля(?:дь|ть)?/i,
  /муд(?:ак|ил)/i,
  /\bсук[аи]\b/i,
  /долбо[её]б/i,
  /гандон/i,
  /пидор/i,
  /\bfuck/i,
  /\bshit\b/i,
  /\bbitch\b/i,
];

function detectProfanity(text) {
  return PROFANITY_PATTERNS.some((re) => re.test(text));
}

const SYSTEM_PROMPT = `Ты — ИИ-модератор и редактор статей для образовательной платформы Stepplify (статьи о науке, технологиях, экологии, истории и путешествиях по Казахстану). Проверь присланный текст статьи по четырём пунктам:

1. Орфография и грамматика — исправь ошибки.
2. Пунктуация и стилистика — сделай текст грамотным, ясным и связным, сохранив смысл, факты и авторский стиль. Не переписывай текст полностью и не добавляй ничего от себя.
3. Нецензурная лексика и оскорбления — проверь текст на русском, казахском и английском языках.
4. Достоверность — отметь утверждения (даты, цифры, названия, исторические или научные факты), которые выглядят сомнительными, внутренне противоречивыми или непроверяемыми и нуждаются в проверке автором. Не утверждай, что что-то заведомо ложно, если не уверен — формулируй как "требует проверки".

Ответь СТРОГО одним JSON-объектом, без markdown и пояснений вне JSON, по схеме:
{
  "correctedText": "исправленный текст статьи целиком",
  "hasProfanity": boolean,
  "profanityNote": "краткое описание найденной нецензурной лексики/оскорблений на русском, либо пустая строка",
  "hasGrammarIssues": boolean,
  "factualConcerns": ["краткие формулировки сомнительных утверждений, которые стоит проверить"],
  "verdict": "approved" | "needs_review" | "rejected",
  "summary": "1-2 предложения с кратким резюме проверки на русском"
}

Правила вердикта:
- "rejected" — если есть нецензурная лексика или оскорбления.
- "needs_review" — если есть сомнительные фактические утверждения или много ошибок.
- "approved" — если текст в порядке.`;

// Best-effort offline check used when no API key is configured. It cannot
// verify facts or catch subtle grammar mistakes — only the LLM path does
// that — but it still runs real profanity/formatting checks instead of
// just prettifying the text.
function runMockCheck(draftText) {
  const correctedText = draftText
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\s*([a-zа-я])/g, (m, p1, p2) => `${p1} ${p2.toUpperCase()}`);

  const hasProfanity = detectProfanity(draftText);
  const hasGrammarIssues = correctedText !== draftText.trim();

  return {
    isMock: true,
    message: 'Проверка выполнена в демо-режиме (не задан ключ API). Орфография и достоверность фактов проверены только частично — подключите ключ API для полной проверки.',
    correctedText,
    hasProfanity,
    profanityNote: hasProfanity
      ? 'В тексте обнаружена нецензурная лексика. Уберите её перед публикацией.'
      : '',
    hasGrammarIssues,
    factualConcerns: [],
    verdict: hasProfanity ? 'rejected' : 'needs_review',
    summary: hasProfanity
      ? 'Текст отклонён: найдена нецензурная брань.'
      : 'Базовая проверка пройдена. Полная проверка достоверности недоступна в демо-режиме.',
  };
}

function extractJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Turns a parsed (or missing) JSON verdict from the model into the
// response shape the frontend expects, running the offline profanity net
// as a backstop regardless of what the model itself reported.
function normalizeParsed(parsed, rawContent, draftText) {
  if (!parsed || typeof parsed.correctedText !== 'string') {
    // Model didn't return usable JSON — fall back to treating the raw
    // reply as plain corrected text rather than failing the request.
    const hasProfanity = detectProfanity(draftText);
    return {
      correctedText: rawContent || draftText,
      hasProfanity,
      profanityNote: hasProfanity ? 'В тексте обнаружена нецензурная лексика. Уберите её перед публикацией.' : '',
      hasGrammarIssues: false,
      factualConcerns: [],
      verdict: hasProfanity ? 'rejected' : 'needs_review',
      summary: 'ИИ вернул ответ в неожиданном формате — показан только текст без структурированной проверки.',
    };
  }

  const hasProfanity = Boolean(parsed.hasProfanity) || detectProfanity(draftText);
  return {
    correctedText: parsed.correctedText,
    hasProfanity,
    profanityNote: parsed.profanityNote || (hasProfanity ? 'В тексте обнаружена нецензурная лексика. Уберите её перед публикацией.' : ''),
    hasGrammarIssues: Boolean(parsed.hasGrammarIssues),
    factualConcerns: Array.isArray(parsed.factualConcerns) ? parsed.factualConcerns : [],
    verdict: hasProfanity ? 'rejected' : (parsed.verdict || 'needs_review'),
    summary: parsed.summary || '',
  };
}

// Google Generative Language API (Gemini/Gemma models). Gemma "thinking"
// models return the response as multiple parts — a reasoning part marked
// `thought: true` followed by the real answer — so we drop thought parts
// before concatenating.
async function callGemini(draftText, apiKey) {
  let model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
  if (model.includes('gemma') || model === 'gemini-1.5-flash') model = 'gemini-1.5-flash-latest';
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: draftText }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  const rawContent = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();

  return normalizeParsed(extractJson(rawContent), rawContent, draftText);
}

// Groq (OpenAI-compatible) chat completions.
async function callGroq(draftText, apiKey) {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: draftText },
      ],
      temperature: 0.3,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );

  const rawContent = response.data?.choices?.[0]?.message?.content?.trim() || '';
  return normalizeParsed(extractJson(rawContent), rawContent, draftText);
}

// 4. AI_EditDraft — grammar/spelling, profanity and shaky-fact checking
// for article drafts. Tries Gemini/Gemma first (GEMINI_API_KEY), then
// Groq (GROK_API_KEY), then falls back to an offline heuristic check.
export const aiEditDraft = async (req, res) => {
  const { draftText } = req.body;

  if (!draftText || draftText.trim().length === 0) {
    return res.status(400).json({ error: 'Пожалуйста, предоставьте текст черновика для проверки.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROK_API_KEY;

  try {
    let result;
    if (geminiKey) {
      result = await callGemini(draftText, geminiKey);
    } else if (groqKey && groqKey !== 'your_xai_grok_api_key_here') {
      result = await callGroq(draftText, groqKey);
    } else {
      result = runMockCheck(draftText);
    }

    return res.json({
      success: true,
      isMock: Boolean(result.isMock),
      message: result.message,
      originalText: draftText,
      improvedText: result.correctedText, // kept for backward compatibility
      correctedText: result.correctedText,
      hasProfanity: result.hasProfanity,
      profanityNote: result.profanityNote,
      hasGrammarIssues: result.hasGrammarIssues,
      factualConcerns: result.factualConcerns,
      verdict: result.verdict,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error in AI_EditDraft:', error?.response?.data || error.message);
    return res.status(500).json({
      error: 'Ошибка при вызове ИИ для вычитки статьи.',
      details: error?.response?.data?.error?.message || error.message,
    });
  }
};
