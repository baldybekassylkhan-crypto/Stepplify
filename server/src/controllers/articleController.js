import prisma from '../db.js';

// Helper to format view numbers like 512, 1.2K, 3.4M
const formatViews = (views) => {
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (views >= 1000) {
    return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return String(views);
};

// 1. CreateArticle
export const createArticle = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, category, region, geoLat, geoLng, locationName } = req.body;

    if (!title || !content || !region) {
      return res.status(400).json({ error: 'Укажите заголовок, текст статьи и область.' });
    }

    // The publish form no longer asks for a category — Article.category
    // is still a required (non-null) DB column, so every article still
    // needs a value; falls back to a fixed default instead.
    const validCategories = ['Наука', 'Технологии', 'Экология', 'История', 'Эссе', 'Психология'];
    const selectedCategory = validCategories.includes(category) ? category : 'Наука';

    // Handle uploaded file paths
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = req.files.map(file => `/uploads/${file.filename}`);
    }

    // Save article in database
    const newArticle = await prisma.article.create({
      data: {
        title,
        content,
        category: selectedCategory,
        region,
        images: JSON.stringify(imagePaths),
        geoLat: geoLat ? parseFloat(geoLat) : null,
        geoLng: geoLng ? parseFloat(geoLng) : null,
        locationName: locationName || null,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            school: true,
            grade: true,
            region: true,
          },
        },
      },
    });

    // Award +100 points to user for publishing an article
    const addedPoints = 100;
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: addedPoints },
      },
    });

    await prisma.pointLog.create({
      data: {
        userId,
        points: addedPoints,
        reason: `Публикация статьи "${title.substring(0, 30)}..."`,
      },
    });

    return res.status(201).json({
      message: 'Статья успешно создана! Вам начислено +100 баллов.',
      article: {
        ...newArticle,
        images: imagePaths,
        authorMeta: `${newArticle.author.school} · ${newArticle.author.grade}`,
        viewsFormatted: '0',
      },
    });
  } catch (error) {
    console.error('Error in CreateArticle:', error);
    return res.status(500).json({ error: 'Ошибка при создании статьи.' });
  }
};

// 2. GetAllArticles — full catalog listing (search/filter/sort all happen
// client-side in catalog.js), as opposed to GetRecentArticles below which
// is a short list for the homepage marquee.
export const getAllArticles = async (req, res) => {
  try {
    const articles = await prisma.article.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            school: true,
            grade: true,
            region: true,
          },
        },
      },
    });

    const formattedArticles = articles.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      author: a.author ? a.author.fullName : 'Аноним',
      meta: a.author ? `${a.author.school} · ${a.author.grade}` : 'Студент',
      // Prefer the article's own region (set at publish time) over the
      // author's home region — they can differ, e.g. someone from
      // Almaty writing about Mangystau. Old rows published before this
      // field existed fall back to the author's region as before.
      region: a.region || (a.author ? a.author.region : null),
      views: a.viewsCount,
      viewsFormatted: formatViews(a.viewsCount),
      images: JSON.parse(a.images || '[]'),
      locationName: a.locationName,
      createdAt: a.createdAt,
    }));

    return res.json(formattedArticles);
  } catch (error) {
    console.error('Error in GetAllArticles:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка статей.' });
  }
};

// 3. GetRecentArticles
export const getRecentArticles = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const articles = await prisma.article.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            school: true,
            grade: true,
            region: true,
          },
        },
      },
    });

    // Format output with author meta and formatted views for cards
    const formattedArticles = articles.map(a => {
      let tagClass = 'tag-science';
      if (a.category === 'Технологии') tagClass = 'tag-tech';
      else if (a.category === 'Экология') tagClass = 'tag-eco';
      else if (a.category === 'История') tagClass = 'tag-history';
      else if (a.category === 'Психология') tagClass = 'tag-psych';
      else if (a.category === 'Эссе') tagClass = 'tag-essay';

      return {
        id: a.id,
        title: a.title,
        content: a.content,
        tag: a.category,
        tagClass,
        author: a.author ? a.author.fullName : 'Аноним',
        meta: a.author ? `${a.author.school} · ${a.author.grade}` : 'Студент',
        views: formatViews(a.viewsCount),
        viewsRaw: a.viewsCount,
        images: JSON.parse(a.images || '[]'),
        locationName: a.locationName,
        createdAt: a.createdAt,
      };
    });

    return res.json(formattedArticles);
  } catch (error) {
    console.error('Error in GetRecentArticles:', error);
    return res.status(500).json({ error: 'Ошибка при получении недавних публикаций.' });
  }
};

// 4. IncrementViews
export const incrementViews = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);

    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Некорректный ID статьи.' });
    }

    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: {
        viewsCount: { increment: 1 },
      },
      select: {
        id: true,
        viewsCount: true,
      },
    });

    return res.json({
      id: updatedArticle.id,
      viewsCount: updatedArticle.viewsCount,
      viewsFormatted: formatViews(updatedArticle.viewsCount),
    });
  } catch (error) {
    console.error('Error in IncrementViews:', error);
    return res.status(500).json({ error: 'Статья не найдена или ошибка серверов.' });
  }
};

// Shared by GetArticleById and RateArticle — the aggregate score, the
// requesting user's own rating (+ any review text they left), and the
// public list of written reviews (ratings that have text attached).
const buildRatingPayload = async (articleId, userId) => {
  const [aggregate, myRating, reviewRows] = await Promise.all([
    prisma.rating.aggregate({
      where: { articleId },
      _avg: { value: true },
      _count: { value: true },
    }),
    userId
      ? prisma.rating.findUnique({ where: { articleId_userId: { articleId, userId } } })
      : null,
    prisma.rating.findMany({
      where: { articleId, text: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: { user: { select: { fullName: true, school: true, grade: true } } },
    }),
  ]);

  return {
    rating: {
      average: aggregate._count.value > 0 ? Math.round(aggregate._avg.value * 10) / 10 : null,
      count: aggregate._count.value,
      myRating: myRating ? myRating.value : null,
      myReviewText: myRating ? myRating.text : null,
    },
    reviews: reviewRows
      .filter((r) => r.text && r.text.trim())
      .map((r) => ({
        author: r.user.fullName,
        meta: `${r.user.school} · ${r.user.grade}`,
        value: r.value,
        text: r.text,
        createdAt: r.updatedAt,
      })),
  };
};

// 5. GetArticleById — full content for the article reader modal, plus
// the rating aggregate, written reviews, and (if the request carries a
// valid token) the current user's own rating/review and author id (so
// the frontend can show edit/delete only to the article's own author).
export const getArticleById = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Некорректный ID статьи.' });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        author: {
          select: { id: true, fullName: true, school: true, grade: true, region: true },
        },
      },
    });

    if (!article) {
      return res.status(404).json({ error: 'Статья не найдена.' });
    }

    const { rating, reviews } = await buildRatingPayload(articleId, req.user ? req.user.id : null);

    return res.json({
      id: article.id,
      title: article.title,
      content: article.content,
      category: article.category,
      author: article.author ? article.author.fullName : 'Аноним',
      authorId: article.authorId,
      meta: article.author ? `${article.author.school} · ${article.author.grade}` : 'Студент',
      region: article.region || (article.author ? article.author.region : null),
      images: JSON.parse(article.images || '[]'),
      locationName: article.locationName,
      geoLat: article.geoLat,
      geoLng: article.geoLng,
      views: article.viewsCount,
      viewsFormatted: formatViews(article.viewsCount),
      createdAt: article.createdAt,
      rating,
      reviews,
    });
  } catch (error) {
    console.error('Error in GetArticleById:', error);
    return res.status(500).json({ error: 'Ошибка при получении статьи.' });
  }
};

// 6. RateArticle — one rating (1-5) per user per article; rating again
// overwrites the previous value rather than adding a second vote. A
// `text` field is optional — when present (even as an empty string, to
// support clearing a review) it updates the review text attached to
// that same rating; when omitted, a plain star click leaves any
// previously written review untouched.
export const rateArticle = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const value = parseInt(req.body.value);
    const hasText = Object.prototype.hasOwnProperty.call(req.body, 'text');
    const text = hasText ? String(req.body.text || '').trim().slice(0, 1000) : undefined;

    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Некорректный ID статьи.' });
    }
    if (isNaN(value) || value < 1 || value > 5) {
      return res.status(400).json({ error: 'Оценка должна быть числом от 1 до 5.' });
    }

    const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
    if (!article) {
      return res.status(404).json({ error: 'Статья не найдена.' });
    }

    await prisma.rating.upsert({
      where: { articleId_userId: { articleId, userId: req.user.id } },
      update: { value, ...(hasText ? { text: text || null } : {}) },
      create: { articleId, userId: req.user.id, value, text: text || null },
    });

    return res.json(await buildRatingPayload(articleId, req.user.id));
  } catch (error) {
    console.error('Error in RateArticle:', error);
    return res.status(500).json({ error: 'Ошибка при сохранении оценки.' });
  }
};

// 7. UpdateArticle — title/content/category/location and (optionally)
// a replacement set of images; author-only, enforced server-side
// regardless of what the UI shows.
export const updateArticle = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Некорректный ID статьи.' });
    }

    const existing = await prisma.article.findUnique({ where: { id: articleId } });
    if (!existing) {
      return res.status(404).json({ error: 'Статья не найдена.' });
    }
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Вы можете редактировать только свои статьи.' });
    }

    const { title, content, category, region, locationName } = req.body;
    if (!title || !content || !region) {
      return res.status(400).json({ error: 'Укажите заголовок, текст статьи и область.' });
    }

    // Same as CreateArticle — the form no longer sends a category, so
    // this keeps whatever the article already had instead of resetting it.
    const validCategories = ['Наука', 'Технологии', 'Экология', 'История', 'Эссе', 'Психология'];
    const selectedCategory = validCategories.includes(category) ? category : existing.category;

    // Only touch images if new ones were uploaded — otherwise keep the
    // article's existing gallery as-is.
    let imagesData = {};
    if (req.files && req.files.length > 0) {
      imagesData = { images: JSON.stringify(req.files.map((file) => `/uploads/${file.filename}`)) };
    }

    const updated = await prisma.article.update({
      where: { id: articleId },
      data: {
        title,
        content,
        category: selectedCategory,
        region,
        locationName: locationName || null,
        ...imagesData,
      },
      include: {
        author: { select: { id: true, fullName: true, school: true, grade: true, region: true } },
      },
    });

    return res.json({
      message: 'Статья успешно обновлена.',
      article: {
        ...updated,
        images: JSON.parse(updated.images || '[]'),
        authorMeta: `${updated.author.school} · ${updated.author.grade}`,
      },
    });
  } catch (error) {
    console.error('Error in UpdateArticle:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении статьи.' });
  }
};

// 8. DeleteArticle — author-only. Also claws back the +100 points that
// publishing it originally awarded (floored at 0), the same way
// CreateArticle grants them, so publish→delete→publish can't be used to
// farm points for free.
export const deleteArticle = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Некорректный ID статьи.' });
    }

    const existing = await prisma.article.findUnique({ where: { id: articleId } });
    if (!existing) {
      return res.status(404).json({ error: 'Статья не найдена.' });
    }
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Вы можете удалять только свои статьи.' });
    }

    await prisma.article.delete({ where: { id: articleId } });

    const author = await prisma.user.findUnique({ where: { id: existing.authorId } });
    if (author) {
      const reclaimed = Math.min(100, author.points);
      if (reclaimed > 0) {
        await prisma.user.update({
          where: { id: existing.authorId },
          data: { points: { decrement: reclaimed } },
        });
        await prisma.pointLog.create({
          data: {
            userId: existing.authorId,
            points: -reclaimed,
            reason: `Удаление статьи "${existing.title.substring(0, 30)}..."`,
          },
        });
      }
    }

    return res.json({ message: 'Статья удалена.', id: articleId });
  } catch (error) {
    console.error('Error in DeleteArticle:', error);
    return res.status(500).json({ error: 'Ошибка при удалении статьи.' });
  }
};
