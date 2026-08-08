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

  document.getElementById('signInLink').addEventListener('click', (e) => {
    e.preventDefault();
    alert('Sign in flow goes here.');
  });

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

    // Rendered twice back-to-back so translateX(-50%) loops seamlessly
    marqueeTrack.innerHTML = articles.map(renderCard).join('') + articles.map(renderCard).join('');
  }

  // Winners — same underlying data feeds two widgets styled after the
  // sat4.me "Our users got: 1500+ results" panel:
  //   1) a small pill strip that scrolls continuously (.winners-pill-track)
  //   2) a fixed 5-slot photo cluster (.winners-stage) that holds its
  //      shape and shuffles which winner's photo/badge each slot shows
  const winners = [
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
