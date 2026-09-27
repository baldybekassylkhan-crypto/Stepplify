import axios from 'axios';
import prisma from '../db.js';

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

const SYSTEM_PROMPT = `Вы — профессиональный редактор и модератор платформы Stepplify (платформа для статей про природу, путешествия, походы, флору и фауну Казахстана). Ваша задача: проверить черновик статьи, исправить грамматические, орфографические и пунктуационные ошибки, улучшить читаемость и стиль, а также убедиться, что текст соответствует тематике платформы и не содержит запрещенного контента.

Правила проверки:
1. ИСПРАВЛЕНИЕ ОШИБОК: Внимательно исправьте все ошибки (грамматика, орфография, пунктуация, опечатки, неправильное согласование). Текст должен звучать грамотно и естественно.
2. УЛУЧШЕНИЕ СТИЛЯ: Сделайте текст более читабельным, разбейте слишком длинные предложения, исправьте корявые формулировки, но сохраните авторский стиль и смысл. НЕ переписывайте статью полностью с нуля.
3. ФОРМАТИРОВАНИЕ: Расставьте правильные переносы строк и абзацы, если текст идет сплошным полотном.
4. ЦЕНЗУРА: Проверяйте на нецензурную лексику, оскорбления, призывы к насилию, политику, рекламу и спам.
5. ФАКТЧЕКИНГ: Укажите на наличие явных антинаучных заявлений или грубых фактических ошибок (особенно по географии, флоре и фауне).

Формат ответа СТРОГО в виде JSON без маркдаун-обертки (никаких \`\`\`json \`\`\`), просто чистый JSON объект:
{
  "correctedText": "Исправленный и отформатированный текст статьи",
  "hasProfanity": boolean,
  "profanityNote": "Пояснение, если найден мат или недопустимый контент, иначе пустая строка",
  "hasGrammarIssues": boolean,
  "factualConcerns": ["Список фактических ошибок, если есть"],
  "verdict": "approved" | "needs_review" | "rejected",
  "summary": "Что именно вы исправили или улучшили в тексте (1-2 предложения)"
}

Логика вердиктов:
- "rejected" — если есть мат, оскорбления, спам или контент совершенно не по теме.
- "needs_review" — если текст сомнительный, несет антинаучный бред или вы не уверены.
- "approved" — если текст нормальный, и вы просто исправили в нем ошибки.`;

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
  let model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
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

// ─── Image Originality Check ────────────────────────────────────────────────
// Analyses a single on-disk image via Gemini Vision and returns:
//   { isOriginal: boolean, confidence: 'high'|'medium'|'low', reason: string }
// Called from articleController after images are saved — runs in the background
// so it never blocks the publish response.
import fs from 'fs';
import path from 'path';

export const checkImageOriginality = async (absoluteImagePath) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { isOriginal: null, confidence: 'low', reason: 'API ключ не настроен' };

  try {
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn('[AI] Image file does not exist on disk:', absoluteImagePath);
      return { isOriginal: null, confidence: 'low', reason: 'Файл не найден' };
    }

    const imageBuffer = fs.readFileSync(absoluteImagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(absoluteImagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';

    const prompt = `Определи, является ли данная фотография оригинальной (авторской, снятой самим пользователем/учеником на камеру или телефон) или это изображение взято из интернета / стока / чужой общедоступной публикации.

Ответь ТОЛЬКО в формате JSON:
{
  "isOriginal": true,
  "confidence": "high",
  "reason": "краткое объяснение на русском (до 15 слов)"
}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1 },
    };

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await axios.post(url, payload, { timeout: 25000 });
        const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const result = JSON.parse(clean);
        console.log(`[AI] Vision check (${model}) success for ${path.basename(absoluteImagePath)}:`, result);
        return {
          isOriginal: typeof result.isOriginal === 'boolean' ? result.isOriginal : false,
          confidence: result.confidence || 'medium',
          reason: result.reason || 'Анализ завершён',
        };
      } catch (err) {
        console.error(`[AI] Vision check model ${model} failed (${err.response?.status || err.message})`);
      }
    }
    return { isOriginal: null, confidence: 'low', reason: 'Не удалось проверить' };
  } catch (err) {
    console.error('checkImageOriginality outer error:', err.message);
    return { isOriginal: null, confidence: 'low', reason: 'Не удалось проверить' };
  }
};

// ─── Article Summary (< 100 words) ──────────────────────────────────────────
const summaryCache = new Map();

export const summarizeArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const articleId = parseInt(id, 10);
    if (!articleId) {
      return res.status(400).json({ error: 'Некорректный ID публикации' });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, content: true, updatedAt: true },
    });

    if (!article) {
      return res.status(404).json({ error: 'Публикация не найдена' });
    }

    const cacheKey = `summary_${article.id}_${article.updatedAt?.getTime() || 0}`;
    if (summaryCache.has(cacheKey)) {
      const cached = summaryCache.get(cacheKey);
      return res.json({
        success: true,
        summary: cached,
        wordCount: cached.split(/\s+/).filter(Boolean).length,
        cached: true,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    let finalSummary = '';

    if (apiKey) {
      const prompt = `Ты — умный редактор платформы Stepplify о путешествиях и природе Казахстана.
Составь лаконичный, информативный и интересный краткий пересказ следующей публикации.

СТРОГИЕ ПРАВИЛА:
1. Длина пересказа ДОЛЖНА БЫТЬ МЕНЬШЕ 100 СЛОВ (оптимально 40–70 слов).
2. Передай суть: о чём публикация, ключевая локация/маршрут, главные советы или впечатления.
3. Без шаблонных вступлений (не пиши «В этой статье...», «Автор рассказывает...»), сразу излагай суть.
4. Пиши грамотным, живым и увлекательным русским языком.

Заголовок: ${article.title}
Текст публикации:
${article.content}`;

      const modelsToTry = [
        process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
      ];

      for (const model of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await axios.post(
            url,
            {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 250,
              },
            },
            { timeout: 15000 }
          );

          const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (raw) {
            finalSummary = raw;
            break;
          }
        } catch (apiErr) {
          console.warn(`[AI Summary] Model ${model} failed:`, apiErr.response?.data?.error?.message || apiErr.message);
        }
      }
    }

    // Heuristic fallback if AI is unavailable or fails
    if (!finalSummary) {
      const cleanContent = article.content.replace(/\s+/g, ' ').trim();
      const sentences = cleanContent.match(/[^.!?]+[.!?]+/g) || [cleanContent];
      let gathered = '';
      let wordsCount = 0;
      for (const s of sentences) {
        const sWords = s.trim().split(/\s+/).filter(Boolean).length;
        if (wordsCount + sWords <= 75) {
          gathered += (gathered ? ' ' : '') + s.trim();
          wordsCount += sWords;
        } else {
          break;
        }
      }
      finalSummary = gathered || cleanContent.slice(0, 300) + '...';
    }

    // Hard constraint: ensure it is strictly LESS THAN 100 WORDS
    const words = finalSummary.split(/\s+/).filter(Boolean);
    if (words.length >= 100) {
      let trimmed = '';
      let wCount = 0;
      const sentences = finalSummary.match(/[^.!?]+[.!?]+|\S+/g) || [finalSummary];
      for (const s of sentences) {
        const sWords = s.trim().split(/\s+/).filter(Boolean).length;
        if (wCount + sWords < 90) {
          trimmed += (trimmed ? ' ' : '') + s.trim();
          wCount += sWords;
        } else {
          break;
        }
      }
      finalSummary = trimmed || words.slice(0, 85).join(' ') + '...';
    }

    summaryCache.set(cacheKey, finalSummary);

    return res.json({
      success: true,
      summary: finalSummary,
      wordCount: finalSummary.split(/\s+/).filter(Boolean).length,
    });
  } catch (error) {
    console.error('Error in summarizeArticle:', error.message);
    return res.status(500).json({ error: 'Не удалось сгенерировать пересказ.' });
  }
};

