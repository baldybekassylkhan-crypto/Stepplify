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
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.78,
          style: 0.15,
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
        timeout: 35000,
      }
    );
    buffers.push(Buffer.from(response.data));
  }

  return Buffer.concat(buffers);
}

// Fallback Google TTS
function splitTextForGoogleTts(text, maxLen = 180) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
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

    const filePath = path.join(podcastsDir, `article_${article.id}.mp3`);

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

    // Wait if generation is already in progress
    if (activeGenerations.has(articleId)) {
      await activeGenerations.get(articleId);
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
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

    const genPromise = (async () => {
      let finalMp3 = null;

      // 1. Try ElevenLabs first with studio-quality pleasant voice
      if (elevenKey) {
        try {
          console.log(`[Podcast] Generating audio via ElevenLabs (voice: ${elevenVoiceId}) for article #${articleId}...`);
          finalMp3 = await generateElevenLabsAudio(fullSpeechText, elevenKey, elevenVoiceId);
          console.log(`[Podcast] ElevenLabs audio generated successfully (${finalMp3.length} bytes)`);
        } catch (elevenErr) {
          const errMsg = elevenErr.response?.data ? Buffer.from(elevenErr.response.data).toString('utf8') : elevenErr.message;
          console.warn('[Podcast] ElevenLabs error, falling back to backup TTS:', errMsg);
        }
      }

      // 2. Fallback to Google TTS if ElevenLabs is unavailable or failed
      if (!finalMp3) {
        console.log(`[Podcast] Generating audio via Google TTS for article #${articleId}...`);
        finalMp3 = await generateGoogleTtsAudio(fullSpeechText);
      }

      fs.writeFileSync(filePath, finalMp3);
      return filePath;
    })();

    activeGenerations.set(articleId, genPromise);

    try {
      await genPromise;
    } finally {
      activeGenerations.delete(articleId);
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
