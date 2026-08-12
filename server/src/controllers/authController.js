import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';

// Helper to calculate user level based on points
const calculateLevel = (points) => {
  return Math.floor(points / 100) + 1;
};

// 1. RegisterUser
export const registerUser = async (req, res) => {
  try {
    const { email, password, fullName, region, district, schoolName, grade } = req.body;

    if (!email || !password || !fullName || !region || !district || !schoolName || !grade) {
      return res.status(400).json({ error: 'Пожалуйста, заполните все обязательные поля.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const initialPoints = 50;
    const initialLevel = calculateLevel(initialPoints);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        region,
        district,
        schoolName,
        grade,
        points: initialPoints,
        level: "Новичок",
        pointLogs: {
          create: {
            points: initialPoints,
            reason: 'Приветственные баллы за регистрацию',
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        region: true,
        district: true,
        schoolName: true,
        grade: true,
        points: true,
        level: true,
        createdAt: true,
      },
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      process.env.JWT_SECRET || 'stepplify_secret_jwt_key_2026',
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Регистрация прошла успешно!',
      token,
      user: newUser,
    });
  } catch (error) {
    console.error('Error in RegisterUser:', error);
    return res.status(500).json({ error: 'Ошибка сервера при регистрации.' });
  }
};

// 2. LoginUser
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'stepplify_secret_jwt_key_2026',
      { expiresIn: '7d' }
    );

    const { passwordHash, ...userWithoutPassword } = user;

    return res.json({
      message: 'Успешный вход в систему!',
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Error in LoginUser:', error);
    return res.status(500).json({ error: 'Ошибка сервера при авторизации.' });
  }
};

// 3. GetUserProfile
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        region: true,
        district: true,
        schoolName: true,
        grade: true,
        points: true,
        level: true,
        createdAt: true,
        articles: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            category: true,
            viewsCount: true,
            createdAt: true,
            locationName: true,
            images: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден.' });
    }

    // Level is now stored as string and handled by CheckAndUpgradeLevel, so no need to recalculate here
    // user.level = calculateLevel(user.points);

    // Format article images JSON
    const formattedArticles = user.articles.map(article => ({
      ...article,
      images: JSON.parse(article.images || '[]'),
    }));

    return res.json({
      ...user,
      articles: formattedArticles,
      articlesCount: formattedArticles.length,
    });
  } catch (error) {
    console.error('Error in GetUserProfile:', error);
    return res.status(500).json({ error: 'Ошибка при получении профиля.' });
  }
};
