document.addEventListener('DOMContentLoaded', () => {
  const langBtn = document.getElementById('langBtn');
  const langMenu = document.getElementById('langMenu');

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('open');
  });

  langMenu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      langBtn.textContent = btn.dataset.lang;
      langMenu.classList.remove('open');
    });
  });

  document.addEventListener('click', () => {
    langMenu.classList.remove('open');
  });

  const API_URL = 'http://localhost:5000/api';

  // ============ Auth State ============
  const authOverlay  = document.getElementById('authOverlay');
  const authClose    = document.getElementById('authClose');
  const signInLink   = document.getElementById('signInLink');
  const logoutLink   = document.getElementById('logoutLink');
  const userNav      = document.getElementById('userNav');
  const userNavName  = document.getElementById('userNavName');
  const userNavPoints = document.getElementById('userNavPoints');

  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');
  const loginError   = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');

  // Check if user is already logged in
  const updateNavFromStorage = () => {
    const token = localStorage.getItem('stepplify_token');
    const user  = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
    if (token && user) {
      signInLink.style.display = 'none';
      userNav.style.display    = 'flex';
      userNavName.textContent  = user.fullName.split(' ')[0]; // first name only
      userNavPoints.textContent = `⭐ ${user.points} баллов`;
    } else {
      signInLink.style.display = '';
      userNav.style.display    = 'none';
    }
  };
  updateNavFromStorage();

  // Open modal
  signInLink.addEventListener('click', (e) => {
    e.preventDefault();
    authOverlay.classList.add('open');
    authOverlay.setAttribute('aria-hidden', 'false');
  });

  // Close modal
  const closeModal = () => {
    authOverlay.classList.remove('open');
    authOverlay.setAttribute('aria-hidden', 'true');
    loginError.textContent = '';
    registerError.textContent = '';
  };
  authClose.addEventListener('click', closeModal);
  authOverlay.addEventListener('click', (e) => { if (e.target === authOverlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Logout
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('stepplify_token');
    localStorage.removeItem('stepplify_user');
    updateNavFromStorage();
  });

  // Tab switching
  [tabLogin, tabRegister].forEach(tab => {
    tab.addEventListener('click', () => {
      const isLogin = tab.dataset.tab === 'login';
      tabLogin.classList.toggle('active', isLogin);
      tabRegister.classList.toggle('active', !isLogin);
      loginForm.style.display    = isLogin ? '' : 'none';
      registerForm.style.display = isLogin ? 'none' : '';
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  // Login submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'Входим...';
    btn.disabled = true;
    loginError.textContent = '';
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      localStorage.setItem('stepplify_token', data.token);
      localStorage.setItem('stepplify_user', JSON.stringify(data.user));
      updateNavFromStorage();
      closeModal();
      loginForm.reset();
    } catch (err) {
      loginError.textContent = err.message;
    } finally {
      btn.textContent = 'Войти';
      btn.disabled = false;
    }
  });

  // Register submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    btn.textContent = 'Регистрируем...';
    btn.disabled = true;
    registerError.textContent = '';
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: document.getElementById('regName').value,
          email:    document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value,
          region:   document.getElementById('regRegion').value,
          district: document.getElementById('regDistrict').value,
          schoolName: document.getElementById('regSchool').value,
          grade:    document.getElementById('regGrade').value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      localStorage.setItem('stepplify_token', data.token);
      localStorage.setItem('stepplify_user', JSON.stringify(data.user));
      updateNavFromStorage();
      closeModal();
      registerForm.reset();
    } catch (err) {
      registerError.textContent = err.message;
    } finally {
      btn.textContent = 'Зарегистрироваться';
      btn.disabled = false;
    }
  });

  // ============ Publish Article Modal ============
  const publishOverlay = document.getElementById('publishOverlay');
  const publishClose   = document.getElementById('publishClose');

  const openPublish = (e) => {
    e.preventDefault();
    const token = localStorage.getItem('stepplify_token');
    if (!token) {
      // Force open auth modal first
      authOverlay.classList.add('open');
      authOverlay.setAttribute('aria-hidden', 'false');
      document.getElementById('publishError') && (document.getElementById('publishError').textContent = '');
      return;
    }
    publishOverlay.classList.add('open');
    publishOverlay.setAttribute('aria-hidden', 'false');
  };

  document.getElementById('publishBtn').addEventListener('click', openPublish);
  // Also wire the "Участвовать и выиграть" button in winners section
  document.querySelectorAll('.btn-primary').forEach(btn => {
    if (btn.textContent.includes('Участвовать')) btn.addEventListener('click', openPublish);
  });

  publishClose.addEventListener('click', () => {
    publishOverlay.classList.remove('open');
    publishOverlay.setAttribute('aria-hidden', 'true');
  });
  publishOverlay.addEventListener('click', (e) => {
    if (e.target === publishOverlay) {
      publishOverlay.classList.remove('open');
      publishOverlay.setAttribute('aria-hidden', 'true');
    }
  });

  // AI check button inside publish form
  document.getElementById('aiCheckBtn').addEventListener('click', async () => {
    const btn = document.getElementById('aiCheckBtn');
    const textarea = document.getElementById('artContent');
    const token = localStorage.getItem('stepplify_token');
    if (!textarea.value.trim()) {
      document.getElementById('publishError').textContent = 'Напишите текст статьи перед проверкой ИИ.';
      return;
    }
    btn.textContent = '✨ Проверяем...';
    btn.disabled = true;
    document.getElementById('publishError').textContent = '';
    try {
      const res = await fetch(`${API_URL}/ai/edit-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ draftText: textarea.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка ИИ');
      textarea.value = data.improvedText;
    } catch (err) {
      document.getElementById('publishError').textContent = err.message;
    } finally {
      btn.textContent = '✨ Проверить ИИ';
      btn.disabled = false;
    }
  });

  // Publish form submit
  document.getElementById('publishForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('publishSubmitBtn');
    btn.textContent = 'Публикуем...';
    btn.disabled = true;
    document.getElementById('publishError').textContent = '';
    const token = localStorage.getItem('stepplify_token');
    try {
      const fd = new FormData();
      fd.append('title',    document.getElementById('artTitle').value);
      fd.append('content',  document.getElementById('artContent').value);
      fd.append('category', document.getElementById('artCategory').value);
      fd.append('locationName', document.getElementById('artLocation').value);
      const files = document.getElementById('artImages').files;
      for (const f of files) fd.append('images', f);

      const res = await fetch(`${API_URL}/articles`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка публикации');
      publishOverlay.classList.remove('open');
      publishOverlay.setAttribute('aria-hidden', 'true');
      document.getElementById('publishForm').reset();
      // Reload marquee with fresh articles
      const freshRes = await fetch(`${API_URL}/articles/recent?limit=8`);
      if (freshRes.ok) {
        const freshArticles = await freshRes.json();
        const track = document.getElementById('marqueeTrack');
        if (track && freshArticles.length) {
          const renderCard = (a) => `
            <article class="article-card">
              <span class="tag ${a.tagClass}">${a.tag}</span>
              <h3>${a.title}</h3>
              <div class="article-author">${a.author}</div>
              <div class="article-meta">
                <span>${a.meta}</span>
                <span>👁 ${a.views}</span>
              </div>
            </article>`;
          track.innerHTML = freshArticles.map(renderCard).join('') + freshArticles.map(renderCard).join('');
        }
      }
      // Update user nav points
      const updatedUser = JSON.parse(localStorage.getItem('stepplify_user') || '{}');
      updatedUser.points = (updatedUser.points || 0) + 100;
      localStorage.setItem('stepplify_user', JSON.stringify(updatedUser));
      updateNavFromStorage();
      alert('🎉 Статья опубликована! Вам начислено +100 баллов.');
    } catch (err) {
      document.getElementById('publishError').textContent = err.message;
    } finally {
      btn.textContent = 'Опубликовать →';
      btn.disabled = false;
    }
  });

  // ============ Top-10 Weekly Modal ============
  const top10Overlay = document.getElementById('top10Overlay');
  const top10Close   = document.getElementById('top10Close');
  const top10List    = document.getElementById('top10List');

  document.getElementById('top10Btn').addEventListener('click', async (e) => {
    e.preventDefault();
    top10Overlay.classList.add('open');
    top10Overlay.setAttribute('aria-hidden', 'false');
    top10List.innerHTML = '<div class="top10-loading">Загружаем рейтинг...</div>';
    try {
      const res = await fetch(`${API_URL}/leaderboard/weekly`);
      const data = await res.json();
      if (!res.ok) throw new Error('Ошибка загрузки');
      const medals = ['🥇', '🥈', '🥉'];
      top10List.innerHTML = data.map((u, i) => `
        <div class="top10-row">
          <span class="top10-rank">${medals[i] || `#${u.rank}`}</span>
          <div class="top10-info">
            <div class="top10-name">${u.name}</div>
            <div class="top10-meta">${u.meta}</div>
          </div>
          <div class="top10-pts">
            <div class="top10-weekly">+${u.weeklyPoints} <span>за неделю</span></div>
            <div class="top10-total">${u.totalPoints} всего</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      top10List.innerHTML = `<div class="auth-error">Не удалось загрузить рейтинг: ${err.message}</div>`;
    }
  });

  top10Close.addEventListener('click', () => {
    top10Overlay.classList.remove('open');
    top10Overlay.setAttribute('aria-hidden', 'true');
  });
  top10Overlay.addEventListener('click', (e) => {
    if (e.target === top10Overlay) {
      top10Overlay.classList.remove('open');
      top10Overlay.setAttribute('aria-hidden', 'true');
    }
  });

  // ============ Profile Modal ============
  const profileOverlay = document.getElementById('profileOverlay');
  const profileClose = document.getElementById('profileClose');

  if (userNavName && profileOverlay) {
    userNavName.addEventListener('click', async (e) => {
      e.preventDefault();
      profileOverlay.classList.add('open');
      profileOverlay.setAttribute('aria-hidden', 'false');

      const token = localStorage.getItem('stepplify_token');
      const user = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
      if (!token || !user) return;

      document.getElementById('profileName').textContent = user.fullName;
      document.getElementById('profileSchool').textContent = user.schoolName || user.school || '-';
      document.getElementById('profileGrade').textContent = user.grade || '-';
      document.getElementById('profilePoints').textContent = user.points || 0;
      
      const articlesList = document.getElementById('profileArticlesList');
      articlesList.innerHTML = '<div class="top10-loading">Загружаем профиль...</div>';

      try {
        const [profileRes, articlesRes] = await Promise.all([
          fetch(`${API_URL}/users/profile`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_URL}/users/profile/articles`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          document.getElementById('profileName').textContent = profileData.fullName;
          document.getElementById('profileLevel').textContent = profileData.level || 'Новичок';
          document.getElementById('profileSchool').textContent = profileData.schoolName || profileData.school || '-';
          document.getElementById('profileGrade').textContent = profileData.grade || '-';
          document.getElementById('profilePoints').textContent = profileData.points || 0;
          if (profileData.avatarUrl) {
            document.getElementById('profileAvatarInner').innerHTML = `<img src="${profileData.avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">`;
          } else {
            document.getElementById('profileAvatarInner').innerHTML = '👤';
          }
        }

        if (articlesRes.ok) {
          const articlesData = await articlesRes.json();
          document.getElementById('profileArticlesCount').textContent = articlesData.length;
          if (articlesData.length === 0) {
            articlesList.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px;font-size:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px dashed rgba(255,255,255,0.1);">У вас пока нет опубликованных статей.</div>';
          } else {
            articlesList.innerHTML = articlesData.map(a => `
              <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: background 0.2s, transform 0.2s; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.transform='none'">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="background: rgba(255,255,255,0.1); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">${a.category || 'Без категории'}</span>
                  <span style="color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 600;">👁 ${a.viewsCount || 0}</span>
                </div>
                <div style="font-weight: 700; font-size: 15px; color: #fff; line-height: 1.4;">${a.title}</div>
              </div>
            `).join('');
          }
        } else {
            articlesList.innerHTML = '<div class="auth-error">Не удалось загрузить статьи</div>';
        }
      } catch (err) {
        articlesList.innerHTML = `<div class="auth-error">Ошибка: ${err.message}</div>`;
      }
    });

    profileClose.addEventListener('click', () => {
      profileOverlay.classList.remove('open');
      profileOverlay.setAttribute('aria-hidden', 'true');
    });

    profileOverlay.addEventListener('click', (e) => {
      if (e.target === profileOverlay) {
        profileOverlay.classList.remove('open');
        profileOverlay.setAttribute('aria-hidden', 'true');
      }
    });

    // Avatar Upload Logic
    const avatarWrapper = document.getElementById('profileAvatar');
    const avatarOverlay = document.getElementById('avatarHoverOverlay');
    const avatarInput = document.getElementById('avatarUploadInput');

    avatarWrapper.addEventListener('mouseenter', () => avatarOverlay.style.opacity = '1');
    avatarWrapper.addEventListener('mouseleave', () => avatarOverlay.style.opacity = '0');
    avatarWrapper.addEventListener('click', () => avatarInput.click());

    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const token = localStorage.getItem('stepplify_token');
      if (!token) return;

      avatarOverlay.textContent = '⏳';
      avatarOverlay.style.opacity = '1';

      const formData = new FormData();
      formData.append('avatar', file);

      try {
        const res = await fetch(`${API_URL}/users/profile/avatar`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        
        if (res.ok && data.avatarUrl) {
          // Update modal avatar
          document.getElementById('profileAvatarInner').innerHTML = `<img src="${data.avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">`;
          // Update localStorage
          const user = JSON.parse(localStorage.getItem('stepplify_user') || '{}');
          user.avatarUrl = data.avatarUrl;
          localStorage.setItem('stepplify_user', JSON.stringify(user));
        } else {
          alert(data.error || 'Ошибка при загрузке аватара');
        }
      } catch (err) {
        alert('Ошибка сети: ' + err.message);
      } finally {
        avatarOverlay.textContent = '📷';
        avatarOverlay.style.opacity = '0';
        avatarInput.value = ''; // Reset input
      }
    });
  }

  // Rotating headline tail — cycles through phrases with a fade/blur
  // swap, same idea as the hero on grader.cloud
  const rotator = document.getElementById('rotator');
  if (rotator) {
    const phrases = [
      'со всего Казахстана',
      'и находи читателей',
      'получай отклики',
      'за считанные минуты',
      'выиграй путёвку',
    ];
    // Longer phrases shrink to fit on one line instead of wrapping —
    // scale is relative to a "normal" ~20-char phrase (1em), with a
    // floor so nothing gets unreadably small.
    const baselineLength = 20;
    const minScale = 0.6;
    const sizePhrase = (text) => {
      const scale = Math.min(1, baselineLength / text.length);
      rotator.style.fontSize = Math.max(minScale, scale).toFixed(3) + 'em';
    };

    let index = 0;
    const swapDuration = 350;
    const holdDuration = 2600;

    sizePhrase(phrases[index]);

    setInterval(() => {
      rotator.classList.add('is-swapping');
      setTimeout(() => {
        index = (index + 1) % phrases.length;
        rotator.textContent = phrases[index];
        sizePhrase(phrases[index]);
        rotator.classList.remove('is-swapping');
      }, swapDuration);
    }, holdDuration);
  }

  // Recent articles — infinite marquee, same idea as the scrolling
  // report-card strip on grader.cloud
  const marqueeTrack = document.getElementById('marqueeTrack');
  if (marqueeTrack) {
    const articles = [
      { tag: 'Наука', tagClass: 'tag-science', title: 'Как тают ледники Тянь-Шаня: анализ данных за 10 лет', author: 'Айгерим Қайратова', meta: 'НИШ ФМН · 11 класс', views: '1.2K' },
      { tag: 'Технологии', tagClass: 'tag-tech', title: 'ИИ в школьном образовании Казахстана', author: 'Ерлан Смагулов', meta: 'КБТУ · 2 курс', views: '845' },
      { tag: 'Экология', tagClass: 'tag-eco', title: 'Экология Каспийского моря: тревожные тренды', author: 'Дана Ахметова', meta: 'НИШ ХБН · 10 класс', views: '980' },
      { tag: 'История', tagClass: 'tag-history', title: 'Великий Шёлковый путь: новый взгляд историков', author: 'Тимур Жаксыбеков', meta: 'КазНУ · 3 курс', views: '712' },
      { tag: 'Психология', tagClass: 'tag-psych', title: 'Психология подросткового возраста в цифровую эпоху', author: 'Алия Нурланова', meta: 'НИШ ХБН · 11 класс', views: '654' },
      { tag: 'Технологии', tagClass: 'tag-tech', title: 'Возобновляемая энергетика в регионах РК', author: 'Данияр Сериков', meta: 'Satbayev University', views: '590' },
      { tag: 'Эссе', tagClass: 'tag-essay', title: 'Что значит быть казахстанцем в XXI веке', author: 'Жанна Мұратқызы', meta: 'НИШ ФМН · 12 класс', views: '430' },
      { tag: 'Наука', tagClass: 'tag-science', title: 'Математические модели изменения климата', author: 'Асхат Бекенов', meta: 'ЕНУ · 4 курс', views: '512' },
    ];

    const renderCard = (a) => `
      <article class="article-card">
        <span class="tag ${a.tagClass}">${a.tag}</span>
        <h3>${a.title}</h3>
        <div class="article-author">${a.author}</div>
        <div class="article-meta">
          <span>${a.meta}</span>
          <span>👁 ${a.views}</span>
        </div>
      </article>`;

    const fetchArticles = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/articles/recent?limit=8');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) return data;
        }
      } catch (err) {
        console.warn('Backend server not running, using fallback articles.', err);
      }
      return articles; // Fallback
    };

    fetchArticles().then(data => {
      // Rendered twice back-to-back so translateX(-50%) loops seamlessly
      marqueeTrack.innerHTML = data.map(renderCard).join('') + data.map(renderCard).join('');
    });
  }

  // Winners — same underlying data feeds two widgets styled after the
  // sat4.me "Our users got: 1500+ results" panel:
  //   1) a small pill strip that scrolls continuously (.winners-pill-track)
  //   2) a fixed 5-slot photo cluster (.winners-stage) that holds its
  //      shape and shuffles which winner's photo/badge each slot shows
  let winners = [
    { name: 'Айдана Сапарова', meta: 'НИШ ФМН · 11 класс', dest: 'Бурабай', img: 'https://i.pravatar.cc/300?img=47', quote: 'Не ожидала, что статья про озёра приведёт меня к отдыху на настоящем озере!' },
    { name: 'Нурлан Ахметов', meta: 'КБТУ · 3 курс', dest: 'Түркістан', img: 'https://i.pravatar.cc/300?img=13', quote: 'Опубликовал статью для портфолио — а получил путёвку в Түркістан.' },
    { name: 'Дана Ермекова', meta: 'НИШ ХБН · 10 класс', dest: 'Медеу', img: 'https://i.pravatar.cc/300?img=25', quote: 'Даже не думала, что моё эссе выберут — и вот я еду в горы!' },
    { name: 'Тимур Жаксыбеков', meta: 'КазНУ · 3 курс', dest: 'Щучинск', img: 'https://i.pravatar.cc/300?img=14', quote: 'Регулярно публиковался — и однажды это окупилось поездкой.' },
    { name: 'Алия Нурланова', meta: 'НИШ ХБН · 11 класс', dest: 'Алаколь', img: 'https://i.pravatar.cc/300?img=44', quote: 'Никогда не думала, что за статью можно выиграть отпуск.' },
    { name: 'Данияр Сериков', meta: 'Satbayev University', dest: 'Кокшетау', img: 'https://i.pravatar.cc/300?img=8', quote: 'Stepplify — это не только публикации, но и реальные призы.' },
    { name: 'Жанна Мұратқызы', meta: 'НИШ ФМН · 12 класс', dest: 'Имантау', img: 'https://i.pravatar.cc/300?img=32', quote: 'За эссе про идентичность казахстанцев дали путёвку — совпадение, но приятное.' },
    { name: 'Асхат Бекенов', meta: 'ЕНУ · 4 курс', dest: 'Шарын', img: 'https://i.pravatar.cc/300?img=51', quote: 'Публикуюсь ради практики, а тут ещё и каньон в подарок.' },
  ];

  // 1) Result pill strip
  const pillTrack = document.getElementById('winnersPillTrack');
  if (pillTrack) {
    const renderPill = (w) => `
      <div class="winners-pill">
        <img src="${w.img}" alt="${w.name}" loading="lazy" />
        <div>
          <span class="winners-pill-dest">${w.dest}</span><span class="winners-pill-label">путёвка</span>
          <div class="winners-pill-name">${w.name}</div>
        </div>
      </div>`;
    // Rendered twice back-to-back so translateX(-50%) loops seamlessly
    pillTrack.innerHTML = winners.map(renderPill).join('') + winners.map(renderPill).join('');
  }

  // 2) Shuffling 5-slot stage
  const stage = document.getElementById('winnersStage');
  if (stage) {
    const themeClasses = ['wp-1', 'wp-2', 'wp-3'];
    const slots = Array.from(stage.querySelectorAll('.ws-slot'));
    const quoteBox = document.getElementById('winnersQuote');
    const quoteText = quoteBox.querySelector('.ws-quote-text');
    const quoteName = quoteBox.querySelector('.ws-quote-name');
    const quoteMeta = quoteBox.querySelector('.ws-quote-meta');
    const centerSlot = stage.querySelector('.ws-l-c');

    const paintSlot = (slot, winner, themeIndex) => {
      const card = slot.querySelector('.ws-card');
      card.classList.remove(...themeClasses);
      card.classList.add(themeClasses[themeIndex % themeClasses.length]);
      card.querySelector('img').src = winner.img;
      card.querySelector('img').alt = winner.name;
      card.querySelector('.ws-badge').textContent = '🏆 ' + winner.dest;
    };

    const paintQuote = (winner) => {
      quoteText.textContent = `«${winner.quote}»`;
      quoteName.textContent = winner.name;
      quoteMeta.textContent = winner.meta;
    };

    const initWinnersWidget = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/winners');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            winners = data.map(w => ({
              name: w.name,
              meta: w.meta,
              dest: w.destination,
              img: w.img,
              quote: w.quote
            }));
          }
        }
      } catch (err) {
        console.warn('Backend server not running, using fallback winners.', err);
      }

      let offset = 0;
      slots.forEach((slot, i) => paintSlot(slot, winners[i % winners.length], i));
      paintQuote(winners[Array.from(slots).indexOf(centerSlot) % winners.length]);

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        setInterval(() => {
          offset++;
          slots.forEach((slot, i) => {
            setTimeout(() => {
              const card = slot.querySelector('.ws-card');
              const isCenter = slot === centerSlot;
              card.classList.add('is-swapping');
              if (isCenter) quoteBox.classList.add('is-swapping');
              setTimeout(() => {
                const winner = winners[(i + offset) % winners.length];
                paintSlot(slot, winner, i + offset);
                card.classList.remove('is-swapping');
                if (isCenter) {
                  paintQuote(winner);
                  quoteBox.classList.remove('is-swapping');
                }
              }, 260);
            }, i * 140);
          });
        }, 2800);
      }
    };
    initWinnersWidget();
  }

  // Mouse parallax on the (fixed, whole-page) background — the photo
  // drifts gently opposite the cursor, giving the scene a sense of
  // depth. Tracked on window/document rather than .hero since .scene
  // now covers the entire page (fixed), not just the hero viewport —
  // otherwise the drift would freeze once the cursor moved over a
  // later section like .recent.
  const scene = document.querySelector('.scene');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (scene && !prefersReducedMotion) {
    const strength = 14; // max drift in px
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    window.addEventListener('mousemove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5; // -0.5 .. 0.5
      const ny = e.clientY / window.innerHeight - 0.5;
      targetX = -nx * strength;
      targetY = -ny * strength;
    });

    document.documentElement.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
    });

    const tick = () => {
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      scene.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Scroll progress bar — thin fill above the nav that tracks how
  // far down the page the reader has gone
  const progressFill = document.getElementById('scrollProgressFill');
  if (progressFill) {
    const updateProgress = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }
});
