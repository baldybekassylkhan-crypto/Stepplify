import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('=== 🚀 Запуск автоматических тестов Stepplify API ===\n');
  let token = '';

  try {
    // 1. Тест: Регистрация нового пользователя
    console.log('1️⃣ Тест: Регистрация пользователя (/auth/register)');
    const testUser = {
      email: `test_${Date.now()}@nis.kz`,
      password: 'password123',
      fullName: 'Тестовый Пользователь',
      region: 'Астана',
      district: 'Есильский',
      school: 'НИШ ФМН',
      grade: '10 класс'
    };
    const regRes = await axios.post(`${API_URL}/auth/register`, testUser);
    console.log('✅ Успешно! Получен ответ:', regRes.data.message);
    
    // 2. Тест: Авторизация и получение токена
    console.log('\n2️⃣ Тест: Авторизация (/auth/login)');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    token = loginRes.data.token;
    console.log('✅ Успешно! Токен получен.');

    // 3. Тест: Проверка профиля
    console.log('\n3️⃣ Тест: Запрос профиля (/users/profile)');
    const profileRes = await axios.get(`${API_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ Успешно! Профиль загружен: ${profileRes.data.fullName}, Баллы: ${profileRes.data.points}`);

    // 4. Тест: Groq AI редактор
    console.log('\n4️⃣ Тест: ИИ-редактор текста через Groq API (/ai/edit-draft)');
    const aiRes = await axios.post(`${API_URL}/ai/edit-draft`, {
      draftText: 'Привет я сгеодня написал оч крутую статю про космосс'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Успешно! Ответ ИИ:');
    console.log('   Оригинал:', aiRes.data.originalText);
    console.log('   Исправлено:', aiRes.data.improvedText);

    // 5. Тест: Получение списка недавних статей
    console.log('\n5️⃣ Тест: Загрузка ленты статей (/articles/recent)');
    const articlesRes = await axios.get(`${API_URL}/articles/recent`);
    console.log(`✅ Успешно! Загружено статей: ${articlesRes.data.length}`);
    if (articlesRes.data.length > 0) {
      console.log(`   Первая статья: "${articlesRes.data[0].title}" от ${articlesRes.data[0].author}`);
    }

    // 6. Тест: Рейтинг школ
    console.log('\n6️⃣ Тест: Загрузка рейтинга школ (/leaderboard/schools)');
    const schoolsRes = await axios.get(`${API_URL}/leaderboard/schools`);
    console.log(`✅ Успешно! Топ-1 школа: ${schoolsRes.data[0]?.school} (${schoolsRes.data[0]?.totalPoints} баллов)`);

    console.log('\n🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО! Бэкенд работает идеально.');
  } catch (error) {
    console.error('\n❌ ОШИБКА ПРИ ТЕСТИРОВАНИИ:');
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Ответ:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runTests();
