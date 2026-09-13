import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import prisma from '../db.js';

// Helper to calculate user level based on points
const calculateLevel = (points) => {
  return Math.floor(points / 100) + 1;
};

// 1. RegisterUser
export const registerUser = async (req, res) => {
  try {
    const { email, password, fullName, region, district, school, grade } = req.body;

    if (!email || !password || !fullName || !region || !school || !grade) {
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
        // The registration form no longer collects a separate district —
        // fall back to region so the still-required DB column stays filled.
        district: district || region,
        school,
        grade,
        points: initialPoints,
        level: initialLevel,
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
        avatarUrl: true,
        region: true,
        district: true,
        school: true,
        grade: true,
        role: true,
        points: true,
        level: true,
        createdAt: true,
      },
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
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
      { id: user.id, email: user.email, role: user.role },
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
        avatarUrl: true,
        region: true,
        district: true,
        school: true,
        grade: true,
        role: true,
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

    // Recalculate level dynamically
    user.level = calculateLevel(user.points);

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

// 4. UpdateProfile — fullName/school/grade/region edited directly from
// the profile modal (email/password change are out of scope here, same
// as before this endpoint existed — no UI for either yet).
export const updateProfile = async (req, res) => {
  try {
    const { fullName, school, grade, region } = req.body;

    if (!fullName || !fullName.trim() || !school || !school.trim() || !grade || !grade.trim() || !region || !region.trim()) {
      return res.status(400).json({ error: 'Заполните имя, школу/ВУЗ, класс/курс и область.' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        fullName: fullName.trim(),
        school: school.trim(),
        grade: grade.trim(),
        region: region.trim(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        region: true,
        district: true,
        school: true,
        grade: true,
        role: true,
        points: true,
        level: true,
        createdAt: true,
      },
    });

    return res.json({ message: 'Профиль обновлён.', user: updated });
  } catch (error) {
    console.error('Error in UpdateProfile:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении профиля.' });
  }
};

// 5. UpdateAvatar — multer has already validated it's an image and saved
// the raw upload to /uploads (see the shared `upload` config in
// routes/api.js). Before pointing the user at it, run it through sharp:
// - rotate() bakes in the phone's EXIF orientation instead of leaving it
//   to the browser (which some don't honor consistently in <img>).
// - resize(...,{fit:'cover', position:'attention'}) crops non-square
//   photos to a square using saliency detection (favors faces/edges)
//   instead of a blind center-crop, and upscales small source images
//   with Lanczos3 resampling — sharper than a plain CSS object-fit
//   scale of the original at display size.
// - re-encoding as a clean, deliberate-quality JPEG also strips away
//   whatever compression the source file already had baked in, so a
//   screenshotted/re-saved/multiply-compressed source doesn't carry its
//   artifacts forward into every future render of the avatar.
// The raw upload is deleted once the processed copy exists.
const AVATAR_SIZE = 512;

export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не был загружен.' });
    }

    const outputFilename = `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    const outputPath = path.join(req.file.destination, outputFilename);

    await sharp(req.file.path)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outputPath);

    await fs.promises.unlink(req.file.path).catch(() => {});

    const avatarUrl = `/uploads/${outputFilename}`;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
    });

    return res.json({ message: 'Аватар обновлён.', avatarUrl });
  } catch (error) {
    console.error('Error in UpdateAvatar:', error);
    // sharp throws on a corrupt/unsupported file that multer's mimetype
    // check let through — surface that as a client error, not a 500.
    if (error && /unsupported image format|Input buffer/i.test(error.message || '')) {
      return res.status(400).json({ error: 'Не удалось обработать изображение — попробуйте другой файл.' });
    }
    return res.status(500).json({ error: 'Ошибка при обновлении аватара.' });
  }
};
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    // Verify requester is a moderator
    if (req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['user', 'moderator'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: { role },
      select: { id: true, email: true, fullName: true, role: true }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
