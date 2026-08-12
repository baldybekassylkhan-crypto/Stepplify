import prisma from '../db.js';

// Шаг 3: Логика геймификации (Система уровней)
export const CheckAndUpgradeLevel = async (userId) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    let newLevel = "Новичок"; // 0-100 баллов
    if (user.points > 100 && user.points <= 500) {
      newLevel = "Исследователь";
    } else if (user.points > 500) {
      newLevel = "Амбассадор края";
    }

    if (user.level !== newLevel) {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel },
      });
      return updatedUser.level;
    }

    return user.level;
  } catch (error) {
    console.error('Error in CheckAndUpgradeLevel:', error);
    return null;
  }
};

// 1. GetProfile - Показать профиль
export const GetProfile = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId || req.user?.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        schoolName: true,
        grade: true,
        points: true,
        level: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    return res.json(user);
  } catch (error) {
    console.error('Error in GetProfile:', error);
    return res.status(500).json({ error: 'Ошибка при получении профиля' });
  }
};

// 2. UpdateProfile - Редактировать профиль
export const UpdateProfile = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId || req.user?.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const { fullName, schoolName, grade, avatarUrl } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: fullName !== undefined ? fullName : undefined,
        schoolName: schoolName !== undefined ? schoolName : undefined,
        grade: grade !== undefined ? grade : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      },
    });

    return res.json({ message: 'Профиль успешно обновлен', user: updatedUser });
  } catch (error) {
    console.error('Error in UpdateProfile:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении профиля' });
  }
};

// 3. GetUserArticles - Статьи пользователя
export const GetUserArticles = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId || req.user?.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    const articles = await prisma.article.findMany({
      where: { authorId: userId },
      select: {
        id: true,
        title: true,
        category: true,
        viewsCount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(articles);
  } catch (error) {
    console.error('Error in GetUserArticles:', error);
    return res.status(500).json({ error: 'Ошибка при получении статей пользователя' });
  }
};

// 4. UploadAvatar - Загрузка аватарки
export const UploadAvatar = async (req, res) => {
  try {
    const userId = parseInt(req.user?.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Не авторизован' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // req.file.filename contains the saved file name from multer
    const avatarUrl = `/uploads/${req.file.filename}`;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return res.json({ message: 'Аватар обновлен', avatarUrl: updatedUser.avatarUrl, user: updatedUser });
  } catch (error) {
    console.error('Error in UploadAvatar:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке аватара' });
  }
};
