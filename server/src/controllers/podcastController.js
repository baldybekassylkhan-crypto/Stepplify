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

// Split article text into sentences and phrases suitable for TTS (< 180 chars)
function splitTextForTts(text, maxLen = 180) {
  // Clean text from HTML, markdown links, symbols
  const clean = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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

async function fetchChunkAudio(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ru&client=tw-ob`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    responseType: 'arraybuffer',
    timeout: 12000,
  });
  return Buffer.from(res.data);
}

// In-progress generation promises to avoid duplicate simultaneous TTS builds
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

    // Check if generation is already in progress for this article
    if (activeGenerations.has(articleId)) {
      await activeGenerations.get(articleId);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(filePath);
      }
    }

    // Prepare speech text
    const authorName = article.author?.fullName ? `Автор: ${article.author.fullName}. ` : '';
    const fullSpeechText = `${article.title}. ${authorName}${article.content}`;
    const chunks = splitTextForTts(fullSpeechText);

    if (!chunks.length) {
      return res.status(400).json({ error: 'Нет текста для озвучивания' });
    }

    // Start generation with promise locking
    const genPromise = (async () => {
      const buffers = [];
      const batchSize = 3;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const batchResults = await Promise.all(slice.map((chunk) => fetchChunkAudio(chunk)));
        buffers.push(...batchResults);
      }
      const finalMp3 = Buffer.concat(buffers);
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
