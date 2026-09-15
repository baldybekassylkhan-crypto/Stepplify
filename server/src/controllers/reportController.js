
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const createReport = async (req, res) => {
  try {
    const { reason, targetType, targetId } = req.body;
    const userId = req.user.id;

    if (!reason || !targetType || !targetId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = await prisma.report.create({
      data: {
        userId,
        reason,
        targetType,
        targetId: parseInt(targetId, 10),
      },
    });

    res.status(201).json(report);
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReports = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const reports = await prisma.report.findMany({
      include: {
        user: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enhancedReports = await Promise.all(reports.map(async (r) => {
      let targetTitle = null;
      let targetArticleId = null;
      try {
        if (r.targetType === 'article') {
          const article = await prisma.article.findUnique({ where: { id: r.targetId }, include: { author: { select: { fullName: true } } }});
          targetTitle = article ? `Жалоба на статью "${article.title}" от ${article.author.fullName}` : 'Удаленная статья';
          targetArticleId = article ? article.id : null;
        } else if (r.targetType === 'review') {
          const review = await prisma.rating.findUnique({ where: { id: r.targetId }, include: { user: { select: { fullName: true } }, article: { select: { id: true, title: true } } }});
          targetTitle = review ? `Жалоба на отзыв от ${review.user.fullName} к статье "${review.article.title}"` : 'Удаленный отзыв';
          targetArticleId = review ? review.article.id : null;
        } else if (r.targetType === 'reply') {
          const reply = await prisma.reviewReply.findUnique({ where: { id: r.targetId }, include: { user: { select: { fullName: true } }, rating: { include: { article: { select: { id: true, title: true } } } } }});
          targetTitle = reply ? `Жалоба на комментарий от ${reply.user.fullName} в статье "${reply.rating.article.title}"` : 'Удаленный комментарий';
          targetArticleId = reply ? reply.rating.article.id : null;
        }
      } catch (e) { console.error('Error enhancing report', r.id, e); }
      
      return {
        ...r,
        targetTitle: targetTitle || `Тип: ${r.targetType} (${r.targetId})`,
        targetArticleId
      };
    }));

    res.json(enhancedReports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateReportStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const report = await prisma.report.update({
      where: { id: parseInt(id, 10) },
      data: { status }
    });

    res.json(report);
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPendingReportsCount = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const count = await prisma.report.count({
      where: { status: 'pending' }
    });
    res.json({ count });
  } catch (error) {
    console.error('Get reports count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
