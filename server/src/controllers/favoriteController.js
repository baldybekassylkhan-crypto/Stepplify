import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const formatViews = (count) => {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};

export const toggleFavorite = async (req, res) => {
  const userId = req.user.id || req.user.userId;
  const articleId = parseInt(req.params.id, 10);

  if (isNaN(articleId)) {
    return res.status(400).json({ error: 'Некорректный ID статьи.' });
  }

  try {
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) {
      return res.status(404).json({ error: 'Статья не найдена.' });
    }

    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_articleId: { userId, articleId },
      },
    });

    if (existingFavorite) {
      await prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });
      return res.json({ isFavorite: false, message: 'Удалено из избранного' });
    } else {
      await prisma.favorite.create({
        data: { userId, articleId },
      });
      return res.json({ isFavorite: true, message: 'Добавлено в избранное' });
    }
  } catch (err) {
    console.error('Ошибка toggleFavorite:', err);
    return res.status(500).json({ error: 'Ошибка сервера при изменении избранного.' });
  }
};

export const getUserFavorites = async (req, res) => {
  const userId = req.user.id || req.user.userId;

  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        article: {
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
            ratings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const articles = favorites.map((fav) => {
      const a = fav.article;
      const totalRating = a.ratings.reduce((acc, curr) => acc + curr.value, 0);
      const avgRating = a.ratings.length ? (totalRating / a.ratings.length).toFixed(1) : 0;

      return {
        id: a.id,
        title: a.title,
        content: a.content,
        category: a.category,
        region: a.region || (a.author ? a.author.region : ''),
        locationName: a.locationName,
        images: JSON.parse(a.images || '[]'),
        author: a.author ? a.author.fullName : 'Аноним',
        authorId: a.authorId,
        meta: a.author ? `${a.author.school} · ${a.author.grade}` : 'Студент',
        views: formatViews(a.viewsCount),
        viewsCount: a.viewsCount,
        rating: avgRating,
        isFavorite: true,
        createdAt: a.createdAt,
      };
    });

    res.json(articles);
  } catch (err) {
    console.error('Ошибка getUserFavorites:', err);
    res.status(500).json({ error: 'Ошибка сервера при получении избранных статей.' });
  }
};
