import prisma from '../db.js';

// 1. AddPoints
export const addPoints = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { points, reason } = req.body;

    if (isNaN(userId) || typeof points !== 'number') {
      return res.status(400).json({ error: 'Укажите числовой ID пользователя и количество баллов.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден.' });
    }

    const updatedPoints = user.points + points;
    const newLevel = Math.floor(updatedPoints / 100) + 1;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        points: updatedPoints,
        level: newLevel,
      },
    });

    await prisma.pointLog.create({
      data: {
        userId,
        points,
        reason: reason || 'Начисление баллов за активность',
      },
    });

    return res.json({
      message: `Успешно начислено +${points} баллов!`,
      userId: updatedUser.id,
      points: updatedUser.points,
      level: updatedUser.level,
    });
  } catch (error) {
    console.error('Error in AddPoints:', error);
    return res.status(500).json({ error: 'Ошибка при начислении баллов.' });
  }
};

// 2. GetWeeklyTop (Топ-10 недели)
export const getWeeklyTop = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Group point logs by userId for the last 7 days
    const weeklyLogs = await prisma.pointLog.groupBy({
      by: ['userId'],
      _sum: {
        points: true,
      },
      where: {
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        _sum: {
          points: 'desc',
        },
      },
      take: 10,
    });

    // If no weekly logs yet, fallback to top users by overall points
    if (weeklyLogs.length === 0) {
      const topUsers = await prisma.user.findMany({
        take: 10,
        orderBy: { points: 'desc' },
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          points: true,
          level: true,
        },
      });

      const formattedFallback = topUsers.map((u, rank) => ({
        rank: rank + 1,
        id: u.id,
        name: u.fullName,
        meta: `${u.school} · ${u.grade}`,
        weeklyPoints: u.points,
        totalPoints: u.points,
        level: u.level,
      }));

      return res.json(formattedFallback);
    }

    const userIds = weeklyLogs.map(item => item.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        fullName: true,
        school: true,
        grade: true,
        points: true,
        level: true,
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const result = weeklyLogs.map((item, index) => {
      const user = userMap.get(item.userId);
      return {
        rank: index + 1,
        id: item.userId,
        name: user ? user.fullName : 'Пользователь',
        meta: user ? `${user.school} · ${user.grade}` : 'Студент',
        weeklyPoints: item._sum.points || 0,
        totalPoints: user ? user.points : 0,
        level: user ? user.level : 1,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('Error in GetWeeklyTop:', error);
    return res.status(500).json({ error: 'Ошибка при получении недельного топа.' });
  }
};

// 3. GetSchoolLeaderboard (Рейтинг школ)
export const getSchoolLeaderboard = async (req, res) => {
  try {
    const schoolStats = await prisma.user.groupBy({
      by: ['school'],
      _sum: {
        points: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          points: 'desc',
        },
      },
      take: 20,
    });

    const leaderboard = schoolStats.map((item, index) => ({
      rank: index + 1,
      school: item.school,
      totalPoints: item._sum.points || 0,
      studentsCount: item._count.id,
    }));

    return res.json(leaderboard);
  } catch (error) {
    console.error('Error in GetSchoolLeaderboard:', error);
    return res.status(500).json({ error: 'Ошибка при формировании рейтинга школ.' });
  }
};

// 4. GetWinnersList (Список победителей)
export const getWinnersList = async (req, res) => {
  try {
    const winners = await prisma.winner.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // If database table is empty, return initial Kazakh destination winners
    if (winners.length === 0) {
      const defaultWinners = [
        { id: 1, name: 'Айдана Сапарова', meta: 'НИШ ФМН · 11 класс', destination: 'Бурабай', img: 'https://i.pravatar.cc/300?img=47', quote: 'Не ожидала, что статья про озёра приведёт меня к отдыху на настоящем озере!' },
        { id: 2, name: 'Нурлан Ахметов', meta: 'КБТУ · 3 курс', destination: 'Түркістан', img: 'https://i.pravatar.cc/300?img=13', quote: 'Опубликовал статью для портфолио — а получил путёвку в Түркістан.' },
        { id: 3, name: 'Дана Ермекова', meta: 'НИШ ХБН · 10 класс', destination: 'Медеу', img: 'https://i.pravatar.cc/300?img=25', quote: 'Даже не думала, что моё эссе выберут — и вот я еду в горы!' },
        { id: 4, name: 'Тимур Жаксыбеков', meta: 'КазНУ · 3 курс', destination: 'Щучинск', img: 'https://i.pravatar.cc/300?img=14', quote: 'Регулярно публиковался — и однажды это окупилось поездкой.' },
        { id: 5, name: 'Асхат Бекенов', meta: 'ЕНУ · 4 курс', destination: 'Шарын', img: 'https://i.pravatar.cc/300?img=51', quote: 'Публикуюсь ради практики, а тут ещё и каньон в подарок.' },
      ];
      return res.json(defaultWinners);
    }

    return res.json(winners);
  } catch (error) {
    console.error('Error in GetWinnersList:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка победителей.' });
  }
};
