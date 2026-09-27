import prisma from '../db.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isRailwayData = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('/data/');
const uploadsDir = isRailwayData ? '/data/uploads' : path.join(__dirname, '../../uploads');
const podcastsDir = path.join(uploadsDir, 'podcasts');

if (!fs.existsSync(podcastsDir)) {
  fs.mkdirSync(podcastsDir, { recursive: true });
}

export const PRESET_VOICES = {
  adam: { id: 'pNInz6obpgDQGcFmaJgB', name: 'Адам (Adam)', desc: 'Классический глубокий мужской голос' },
};

export const getPresetVoices = (req, res) => {
  return res.json({
    success: true,
    default: 'adam',
    voices: PRESET_VOICES,
  });
};

// Clean and prepare text for pleasant natural narration
function cleanTextForSpeech(text) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*#`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ElevenLabs TTS generator
async function generateElevenLabsAudio(text, apiKey, voiceId = 'pNInz6obpgDQGcFmaJgB') {
  const maxLen = 4500;
  const chunks = [];
  if (text.length <= maxLen) {
    chunks.push(text);
  } else {
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
    let curr = '';
    for (const s of sentences) {
      if ((curr + ' ' + s).trim().length <= maxLen) {
        curr = (curr ? curr + ' ' : '') + s.trim();
      } else {
        if (curr) chunks.push(curr);
        curr = s.trim();
      }
    }
    if (curr) chunks.push(curr);
  }

  const buffers = [];
  for (const chunk of chunks) {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: chunk,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.05,
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 40000,
      }
    );
    buffers.push(Buffer.from(response.data));
  }

  return Buffer.concat(buffers);
}

// Fallback Google TTS (with Kazakh character phonetic normalization for Cyrillic engine)
function normalizeKazakhForFallback(text) {
  const map = {
    'ә': 'а', 'Ә': 'А',
    'і': 'и', 'І': 'И',
    'ң': 'нг', 'Ң': 'Нг',
    'ғ': 'г', 'Ғ': 'Г',
    'ү': 'у', 'Ү': 'У',
    'ұ': 'у', 'Ұ': 'У',
    'қ': 'к', 'Қ': 'К',
    'ө': 'о', 'Ө': 'О',
    'һ': 'х', 'Һ': 'Х',
  };
  return text.replace(/[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/g, (ch) => map[ch] || ch);
}

function splitTextForGoogleTts(text, maxLen = 180) {
  const clean = normalizeKazakhForFallback(text);
  const sentences = clean.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [clean];
  const chunks = [];
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length <= maxLen) {
      chunks.push(s);
    } else {
      const words = s.split(/\s+/);
      let curr = '';
      for (const w of words) {
        if ((curr + ' ' + w).trim().length <= maxLen) {
          curr = (curr ? curr + ' ' : '') + w;
        } else {
          if (curr) chunks.push(curr);
          curr = w;
        }
      }
      if (curr) chunks.push(curr);
    }
  }
  return chunks;
}

async function fetchGoogleTtsChunk(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ru&client=tw-ob`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    responseType: 'arraybuffer',
    timeout: 10000,
  });
  return Buffer.from(res.data);
}

async function generateGoogleTtsAudio(text) {
  const chunks = splitTextForGoogleTts(text);
  const buffers = [];
  const batchSize = 3;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const slice = chunks.slice(i, i + batchSize);
    const batchResults = await Promise.all(slice.map((chunk) => fetchGoogleTtsChunk(chunk)));
    buffers.push(...batchResults);
  }
  return Buffer.concat(buffers);
}

// Deep natural male voice generator (Russian Dmitry / Kazakh Daulet)
async function generateEdgeTtsAudio(text) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  const isKazakh = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/.test(text);
  const voice = isKazakh ? 'kk-KZ-DauletNeural' : 'ru-RU-DmitryNeural';
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise((resolve, reject) => {
    try {
      const { audioStream } = tts.toStream(text);
      const chunks = [];
      const timer = setTimeout(() => {
        reject(new Error('Edge TTS timeout'));
      }, 35000);

      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      audioStream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

const activeGenerations = new Map();

export const getArticlePodcastAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const articleId = parseInt(id, 10);
    if (!articleId) {
      return res.status(400).json({ error: 'Некорректный ID публикации' });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { author: { select: { fullName: true } } },
    });

    if (!article) {
      return res.status(404).json({ error: 'Публикация не найдена' });
    }

    // Determine voice choice
    const requestedVoice = (req.query.voice || '').toLowerCase();
    const voiceKey = PRESET_VOICES[requestedVoice] ? requestedVoice : 'adam';
    const voiceInfo = PRESET_VOICES[voiceKey];
    const elevenVoiceId = voiceInfo.id;

    const filePath = path.join(podcastsDir, `article_${article.id}_${voiceKey}.mp3`);
    const lockKey = `${articleId}_${voiceKey}`;

    // Check if audio file already exists and is fresh
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const articleUpdated = article.updatedAt ? new Date(article.updatedAt).getTime() : 0;
      if (stats.mtimeMs >= articleUpdated && stats.size > 1024) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(filePath);
      }
    }

    // Wait if generation is already in progress for this article & voice
    if (activeGenerations.has(lockKey)) {
      await activeGenerations.get(lockKey);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(filePath);
      }
    }

    const authorName = article.author?.fullName ? `Автор: ${article.author.fullName}. ` : '';
    const cleanContent = cleanTextForSpeech(article.content);
    const fullSpeechText = `${article.title}. ${authorName}${cleanContent}`;

    if (!fullSpeechText.trim()) {
      return res.status(400).json({ error: 'Нет текста для озвучивания' });
    }

    const elevenKey = process.env.ELEVENLABS_API_KEY;

    const genPromise = (async () => {
      let finalMp3 = null;

      // 1. Try ElevenLabs first with Adam
      if (elevenKey) {
        try {
          console.log(`[Podcast] Generating audio via ElevenLabs (${voiceInfo.name}, id: ${elevenVoiceId}) for article #${articleId}...`);
          finalMp3 = await generateElevenLabsAudio(fullSpeechText, elevenKey, elevenVoiceId);
          console.log(`[Podcast] ElevenLabs audio generated successfully (${finalMp3.length} bytes)`);
        } catch (elevenErr) {
          const errMsg = elevenErr.response?.data ? Buffer.from(elevenErr.response.data).toString('utf8') : elevenErr.message;
          console.warn('[Podcast] ElevenLabs unavailable/exhausted, switching to deep male Neural voice:', errMsg);
        }
      }

      // 2. High-quality deep male neural voice fallback (Dmitry / Daulet)
      if (!finalMp3) {
        try {
          console.log(`[Podcast] Generating deep male audio via Neural Voice for article #${articleId}...`);
          finalMp3 = await generateEdgeTtsAudio(fullSpeechText);
          console.log(`[Podcast] Neural male audio generated successfully (${finalMp3.length} bytes)`);
        } catch (edgeErr) {
          console.warn('[Podcast] Neural Male TTS error, falling back to Google TTS:', edgeErr.message);
        }
      }

      // 3. Fallback to Google TTS only as absolute last resort
      if (!finalMp3) {
        console.log(`[Podcast] Generating audio via Google TTS for article #${articleId}...`);
        finalMp3 = await generateGoogleTtsAudio(fullSpeechText);
      }

      fs.writeFileSync(filePath, finalMp3);
      return filePath;
    })();

    activeGenerations.set(lockKey, genPromise);

    try {
      await genPromise;
    } finally {
      activeGenerations.delete(lockKey);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    return res.sendFile(filePath);
  } catch (err) {
    console.error('[Podcast] Audio generation error:', err.message);
    return res.status(500).json({
      error: 'Не удалось сгенерировать аудиоподкаст.',
      details: err.message,
    });
  }
};
