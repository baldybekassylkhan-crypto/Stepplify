import bcrypt from 'bcryptjs';
import prisma from './db.js';

export async function seedDatabase() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('Database already contains records. Skipping initial seeding.');
      return;
    }

    console.log('Seeding initial data for Stepplify database...');

    const defaultPassword = await bcrypt.hash('password123', 10);

    // Create demo users from Kazakh schools and universities
    const usersData = [
      { email: 'aigerim@nis.kz', fullName: 'Айгерим Қайратова', region: 'Алматы', district: 'Бостандыкский', school: 'НИШ ФМН', grade: '11 класс', points: 450, level: 5 },
      { email: 'erlan@kbtu.kz', fullName: 'Ерлан Смагулов', region: 'Алматы', district: 'Алмалинский', school: 'КБТУ', grade: '2 курс', points: 380, level: 4 },
      { email: 'dana@nis.kz', fullName: 'Дана Ахметова', region: 'Астана', district: 'Есильский', school: 'НИШ ХБН', grade: '10 класс', points: 310, level: 4 },
      { email: 'timur@kaznu.kz', fullName: 'Тимур Жаксыбеков', region: 'Алматы', district: 'Бостандыкский', school: 'КазНУ', grade: '3 курс', points: 290, level: 3 },
      { email: 'askhat@enu.kz', fullName: 'Асхат Бекенов', region: 'Астана', district: 'Алматы', school: 'ЕНУ', grade: '4 курс', points: 260, level: 3 },
      { email: 'daniyar@satbayev.kz', fullName: 'Данияр Сериков', region: 'Алматы', district: 'Медеуский', school: 'Satbayev University', grade: '1 курс', points: 220, level: 3 },
    ];

    const users = [];
    for (const u of usersData) {
      const createdUser = await prisma.user.create({
        data: {
          ...u,
          passwordHash: defaultPassword,
          pointLogs: {
            create: {
              points: u.points,
              reason: 'Начисление начального рейтинга',
            },
          },
        },
      });
      users.push(createdUser);
    }

    // Note: no demo/sample articles are seeded here on purpose — the
    // article feed and catalog should only ever show what real users
    // actually publish through the app, not placeholder content.

    // Create demo contest winners
    const winnersData = [
      { name: 'Айдана Сапарова', meta: 'НИШ ФМН · 11 класс', destination: 'Бурабай', img: 'https://i.pravatar.cc/300?img=47', quote: 'Не ожидала, что статья про озёра приведёт меня к отдыху на настоящем озере!' },
      { name: 'Нурлан Ахметов', meta: 'КБТУ · 3 курс', destination: 'Түркістан', img: 'https://i.pravatar.cc/300?img=13', quote: 'Опубликовал статью для портфолио — а получил путёвку в Түркістан.' },
      { name: 'Дана Ермекова', meta: 'НИШ ХБН · 10 класс', destination: 'Медеу', img: 'https://i.pravatar.cc/300?img=25', quote: 'Даже не думала, что моё эссе выберут — и вот я еду в горы!' },
      { name: 'Тимур Жаксыбеков', meta: 'КазНУ · 3 курс', destination: 'Щучинск', img: 'https://i.pravatar.cc/300?img=14', quote: 'Регулярно публиковался — и однажды это окупилось поездкой.' },
      { name: 'Асхат Бекенов', meta: 'ЕНУ · 4 курс', destination: 'Шарын', img: 'https://i.pravatar.cc/300?img=51', quote: 'Публикуюсь ради практики, а тут ещё и каньон в подарок.' },
    ];

    for (const w of winnersData) {
      await prisma.winner.create({ data: w });
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}
