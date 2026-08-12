import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { registerUser, loginUser } from '../controllers/authController.js';
import { GetProfile, UpdateProfile, GetUserArticles, UploadAvatar } from '../controllers/userController.js';
import { createArticle, getRecentArticles, incrementViews } from '../controllers/articleController.js';
import { addPoints, getWeeklyTop, getSchoolLeaderboard, getWinnersList } from '../controllers/gamificationController.js';
import { aiEditDraft } from '../controllers/aiController.js';
import { generateTravelRoute, calculateTripCost } from '../controllers/travelController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Ensure uploads directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'article-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешена загрузка только изображений!'));
    }
  },
});

// 1. Пользователи и Авторизация
router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/users/profile', authenticateToken, GetProfile);
router.put('/users/profile', authenticateToken, UpdateProfile);
router.post('/users/profile/avatar', authenticateToken, upload.single('avatar'), UploadAvatar);
router.get('/users/profile/articles', authenticateToken, GetUserArticles);
router.get('/users/:userId', GetProfile);
router.get('/users/:userId/articles', GetUserArticles);

// 2. Контент (Лента и Статьи)
router.post('/articles', authenticateToken, upload.array('images', 5), createArticle);
router.get('/articles/recent', getRecentArticles);
router.post('/articles/:id/view', incrementViews);

// 3. Геймификация и Соревнования
router.post('/users/:userId/points', addPoints);
router.get('/leaderboard/weekly', getWeeklyTop);
router.get('/leaderboard/schools', getSchoolLeaderboard);
router.get('/winners', getWinnersList);

// 4. Искусственный интеллект
router.post('/ai/edit-draft', authenticateToken, aiEditDraft);

// 5. Задел на будущее (Заглушки)
router.post('/travel/route', generateTravelRoute);
router.post('/travel/cost', calculateTripCost);

export default router;
