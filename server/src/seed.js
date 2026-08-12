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
      { email: 'aigerim@nis.kz', fullName: 'Айгерим Қайратова', region: 'Алматы', district: 'Бостандыкский', schoolName: 'НИШ ФМН', grade: '11 класс', points: 450, level: 'Исследователь' },
      { email: 'erlan@kbtu.kz', fullName: 'Ерлан Смагулов', region: 'Алматы', district: 'Алмалинский', schoolName: 'КБТУ', grade: '2 курс', points: 380, level: 'Исследователь' },
      { email: 'dana@nis.kz', fullName: 'Дана Ахметова', region: 'Астана', district: 'Есильский', schoolName: 'НИШ ХБН', grade: '10 класс', points: 310, level: 'Исследователь' },
      { email: 'timur@kaznu.kz', fullName: 'Тимур Жаксыбеков', region: 'Алматы', district: 'Бостандыкский', schoolName: 'КазНУ', grade: '3 курс', points: 290, level: 'Исследователь' },
      { email: 'askhat@enu.kz', fullName: 'Асхат Бекенов', region: 'Астана', district: 'Алматы', schoolName: 'ЕНУ', grade: '4 курс', points: 260, level: 'Исследователь' },
      { email: 'daniyar@satbayev.kz', fullName: 'Данияр Сериков', region: 'Алматы', district: 'Медеуский', schoolName: 'Satbayev University', grade: '1 курс', points: 220, level: 'Исследователь' },
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

    // Create demo articles across categories: Наука, Технологии, Экология, История
    const articlesData = [
      {
        title: 'Как тают ледники Тянь-Шаня: анализ данных за 10 лет',
        content: 'Моренное озеро №6 и динамика таяния ледников в районе Заилийского Алатау. Сравнительный анализ снимков космического мониторинга за последнее десятилетие показывает ускоренную деградацию оледенения.',
        category: 'Наука',
        viewsCount: 1200,
        authorId: users[0].id,
        locationName: 'Заилийский Алатау, Алматинская область',
        geoLat: 43.05,
        geoLng: 77.08,
      },
      {
        title: 'ИИ в школьном образовании Казахстана: опыт применения',
        content: 'Исследование эффективности внедрения больших языковых моделей и нейросетей при решении задач по физике и программированию среди старшеклассников.',
        category: 'Технологии',
        viewsCount: 845,
        authorId: users[1].id,
        locationName: 'КБТУ, Алматы',
        geoLat: 43.25,
        geoLng: 76.94,
      },
      {
        title: 'Экология Каспийского моря: тревожные тренды и решения',
        content: 'Анализ уровня воды Каспия и влияния изменения климата на популяции каспийского тюленя.',
        category: 'Экология',
        viewsCount: 980,
        authorId: users[2].id,
        locationName: 'Атырауская область',
        geoLat: 47.11,
        geoLng: 51.88,
      },
      {
        title: 'Великий Шёлковый путь: новый взгляд историков',
        content: 'Археологические находки в городище Талхиз и их роль в международной торговле Средневековья.',
        category: 'История',
        viewsCount: 712,
        authorId: users[3].id,
        locationName: 'Талгар, Алматинская область',
        geoLat: 43.30,
        geoLng: 77.24,
      },
      {
        title: 'Математические модели изменения климата в Центральной Азии',
        content: 'Разработка предиктивных алгоритмов для прогнозирования осадков и периода засухи в степных регионах.',
        category: 'Наука',
        viewsCount: 512,
        authorId: users[4].id,
        locationName: 'ЕНУ им. Л.Н. Гумилева, Астана',
        geoLat: 51.16,
        geoLng: 71.47,
      },
    ];

    for (const a of articlesData) {
      await prisma.article.create({ data: a });
    }

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
