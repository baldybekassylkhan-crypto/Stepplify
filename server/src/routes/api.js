import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { registerUser, loginUser, getUserProfile, updateAvatar, updateProfile } from '../controllers/authController.js';
import { createArticle, getAllArticles, getRecentArticles, incrementViews, getArticleById, rateArticle, updateArticle, deleteArticle } from '../controllers/articleController.js';
import { addPoints, getMonthlyTop, getSchoolLeaderboard, getWinnersList } from '../controllers/gamificationController.js';
import { searchUsers, sendFriendRequest, respondToFriendRequest, removeFriendship, listFriends } from '../controllers/friendController.js';
import { aiEditDraft } from '../controllers/aiController.js';
import { generateTravelRoute, calculateTripCost } from '../controllers/travelController.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';

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
    // Prefixed by field name ("images" for articles, "avatar" for
    // profile photos) rather than a hardcoded "article-" so avatar
    // uploads don't end up misleadingly named on disk.
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
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
router.get('/users/profile', authenticateToken, getUserProfile);
router.put('/users/profile', authenticateToken, updateProfile);
router.post('/users/avatar', authenticateToken, upload.single('avatar'), updateAvatar);
router.get('/users/search', authenticateToken, searchUsers);

// 2. Контент (Лента и Статьи)
router.post('/articles', authenticateToken, upload.array('images', 5), createArticle);
router.get('/articles', getAllArticles);
router.get('/articles/recent', getRecentArticles);
router.post('/articles/:id/view', incrementViews);
router.post('/articles/:id/rate', authenticateToken, rateArticle);
router.put('/articles/:id', authenticateToken, upload.array('images', 5), updateArticle);
router.delete('/articles/:id', authenticateToken, deleteArticle);
// Must stay registered after the more specific /articles/recent above —
// Express matches routes in order, so this catch-all :id would otherwise
// swallow that request first.
router.get('/articles/:id', optionalAuth, getArticleById);

// 3. Геймификация и Соревнования
router.post('/users/:userId/points', addPoints);
router.get('/leaderboard/monthly', getMonthlyTop);
router.get('/leaderboard/schools', getSchoolLeaderboard);
router.get('/winners', getWinnersList);

// 3b. Друзья
router.get('/friends', authenticateToken, listFriends);
router.post('/friends/request/:userId', authenticateToken, sendFriendRequest);
router.post('/friends/:friendshipId/respond', authenticateToken, respondToFriendRequest);
router.delete('/friends/:userId', authenticateToken, removeFriendship);

// 4. Искусственный интеллект
router.post('/ai/edit-draft', authenticateToken, aiEditDraft);

// 5. Задел на будущее (Заглушки)
router.post('/travel/route', generateTravelRoute);
router.post('/travel/cost', calculateTripCost);

export default router;
