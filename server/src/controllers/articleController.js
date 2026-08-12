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
    const { title, content, category, geoLat, geoLng, locationName } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({ error: 'Укажите заголовок, текст статьи и категорию.' });
    }

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
            schoolName: true,
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
        authorMeta: `${newArticle.author.schoolName} · ${newArticle.author.grade}`,
        viewsFormatted: '0',
      },
    });
  } catch (error) {
    console.error('Error in CreateArticle:', error);
    return res.status(500).json({ error: 'Ошибка при создании статьи.' });
  }
};

// 2. GetRecentArticles
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
            schoolName: true,
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
        meta: a.author ? `${a.author.schoolName} · ${a.author.grade}` : 'Студент',
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

// 3. IncrementViews
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
