import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { registerUser, loginUser, getUserProfile, updateAvatar, updateProfile, updateUserRole } from '../controllers/authController.js';
import { createArticle, getAllArticles, getRecentArticles, incrementViews, getArticleById, rateArticle, replyToReview, updateArticle, deleteArticle, deleteReview, deleteReply, editReply, updateVerificationScore } from '../controllers/articleController.js';
import { toggleFavorite, getUserFavorites } from '../controllers/favoriteController.js';
import { addPoints, getMonthlyTop, getSchoolLeaderboard, getWinnersList } from '../controllers/gamificationController.js';
import { searchUsers, sendFriendRequest, respondToFriendRequest, removeFriendship, listFriends, getPublicUserProfile } from '../controllers/friendController.js';
import { aiEditDraft } from '../controllers/aiController.js';
import { generateTravelRoute, calculateTripCost } from '../controllers/travelController.js';
import { sendSupportMessage } from '../controllers/supportController.js';
import { createReport, getReports, updateReportStatus, getPendingReportsCount } from '../controllers/reportController.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только форматы изображений разрешены!'));
    }
  },
});

router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/users/profile', authenticateToken, getUserProfile);
router.get('/users/by-id/:id', optionalAuth, getPublicUserProfile);
router.put('/users/profile', authenticateToken, updateProfile);
router.post('/users/avatar', authenticateToken, upload.single('avatar'), updateAvatar);
router.get('/users/search', authenticateToken, searchUsers);
router.put('/users/:id/role', authenticateToken, updateUserRole);

router.post('/articles', authenticateToken, upload.array('images', 5), createArticle);
router.get('/articles', getAllArticles);
router.get('/articles/recent', getRecentArticles);
router.post('/articles/:id/view', incrementViews);
router.post('/articles/:id/rate', authenticateToken, rateArticle);
router.post('/articles/:id/reviews/:reviewId/reply', authenticateToken, replyToReview);
router.delete('/articles/:id/rate', authenticateToken, deleteReview);
router.delete('/articles/:id/replies/:replyId', authenticateToken, deleteReply);
router.put('/articles/:id/replies/:replyId', authenticateToken, editReply);
router.put('/articles/:id/verification', authenticateToken, updateVerificationScore);
router.post('/articles/:id/favorite', authenticateToken, toggleFavorite);
router.get('/favorites', authenticateToken, getUserFavorites);
router.put('/articles/:id', authenticateToken, upload.array('images', 5), updateArticle);
router.delete('/articles/:id', authenticateToken, deleteArticle);
router.get('/articles/:id', optionalAuth, getArticleById);

router.post('/users/:userId/points', addPoints);
router.get('/leaderboard/monthly', getMonthlyTop);
router.get('/leaderboard/schools', getSchoolLeaderboard);
router.get('/winners', getWinnersList);

router.get('/friends', authenticateToken, listFriends);
router.post('/friends/request/:userId', authenticateToken, sendFriendRequest);
router.post('/friends/:friendshipId/respond', authenticateToken, respondToFriendRequest);
router.delete('/friends/:userId', authenticateToken, removeFriendship);

router.post('/ai/edit-draft', authenticateToken, aiEditDraft);
router.post('/support', optionalAuth, sendSupportMessage);
router.post('/travel/route', generateTravelRoute);
router.post('/travel/cost', calculateTripCost);

// Reports
router.post('/reports', authenticateToken, createReport);
router.get('/reports/count', authenticateToken, getPendingReportsCount);
router.get('/reports', authenticateToken, getReports);
router.put('/reports/:id', authenticateToken, updateReportStatus);

router.get('/debug/users', async (req, res) => { const users = await prisma.user.findMany({ select: { email: true, role: true } }); res.json(users); });
export default router;
