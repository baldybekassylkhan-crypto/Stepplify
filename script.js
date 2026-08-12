document.addEventListener('DOMContentLoaded', () => {
  // script.js is shared across every page (home, catalog, …), and not
  // every page carries every widget — each block below only wires up
  // if its elements are actually present, so a page can include just
  // the topbar + modals it needs without the rest throwing on a
  // missing element.
  const langBtn = document.getElementById('langBtn');
  const langMenu = document.getElementById('langMenu');

  if (langBtn && langMenu) {
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
  }

  // ============ Typeahead autocomplete (school/university, region) ============
  // Reusable suggestion dropdown, the way education portals suggest
  // your school/region while verifying a school email — matches
  // highlighted inline, arrow keys + Enter to pick, click also works,
  // closes on Escape or a click outside.
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // First letters of the first two words of a name, e.g. "Айгерим
  // Қайратова" -> "АҚ" — the avatar circle's fallback for a reader who
  // hasn't uploaded a photo yet (see renderAvatarInto below).
  const getInitials = (fullName) => {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  };

  // Shared by the nav pill's mini avatar and the profile modal's big
  // one: an uploaded photo if the user has one, otherwise the initials
  // fallback — both containers are pre-sized circles with overflow
  // hidden, so either shape drops in cleanly.
  const renderAvatarInto = (container, user) => {
    if (!container) return;
    container.innerHTML = user && user.avatarUrl
      ? `<img src="${resolveAvatarUrl(user.avatarUrl)}" alt="" />`
      : `<span>${getInitials(user ? user.fullName : '')}</span>`;
  };

  // Points -> level (mirrors calculateLevel on the server) -> a short
  // Russian title shown as the badge under the name in the profile modal.
  const levelTitles = ['Новичок', 'Автор', 'Исследователь', 'Эксперт', 'Мастер маршрутов'];
  const levelTitle = (level) => levelTitles[Math.min(Math.max(level, 1), levelTitles.length) - 1];

  // ============ Reading profile (powers catalog recommendations) ============
  // Tracks, per account (or a shared "guest" bucket while signed out),
  // which article categories someone actually opens and what they type
  // into the catalog search box. catalog.js turns this into a
  // personalized "Рекомендуем для вас" sort — see scoreArticles there.
  //
  // Deliberately localStorage rather than a new backend table: it's a
  // soft best-effort signal that only needs to steer this browser's own
  // catalog view, not sync across devices or survive account deletion,
  // so it doesn't earn a Prisma model + migration + endpoint.
  const READING_PROFILE_MAX_TERMS = 40;
  const READING_PROFILE_MAX_VIEWED = 200;

  const readingProfileKey = () => {
    const user = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
    return `stepplify_reading_${user ? user.id : 'guest'}`;
  };

  const getReadingProfile = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(readingProfileKey()) || 'null');
      return {
        categoryViews: parsed?.categoryViews || {},
        searchTerms: parsed?.searchTerms || {},
        viewedArticleIds: parsed?.viewedArticleIds || [],
      };
    } catch {
      return { categoryViews: {}, searchTerms: {}, viewedArticleIds: [] };
    }
  };

  const saveReadingProfile = (profile) => {
    try {
      localStorage.setItem(readingProfileKey(), JSON.stringify(profile));
    } catch {
      // Storage full/unavailable/private-mode — recommendations just
      // degrade to the chronological default, nothing else reads this.
    }
  };

  // Called on every article open (marquee, catalog grid, profile list —
  // they all funnel through window.openArticleModal) so the category
  // signal builds up from normal browsing, no separate opt-in needed.
  const recordArticleView = (article) => {
    if (!article || !article.category) return;
    const profile = getReadingProfile();
    profile.categoryViews[article.category] = (profile.categoryViews[article.category] || 0) + 1;
    if (article.id != null) {
      const id = String(article.id);
      profile.viewedArticleIds = profile.viewedArticleIds.filter((x) => x !== id);
      profile.viewedArticleIds.push(id);
      if (profile.viewedArticleIds.length > READING_PROFILE_MAX_VIEWED) {
        profile.viewedArticleIds = profile.viewedArticleIds.slice(-READING_PROFILE_MAX_VIEWED);
      }
    }
    saveReadingProfile(profile);
  };

  // Called by catalog.js once a search query settles (debounced there,
  // not on every keystroke — "гор" -> "горы" should count as one signal
  // for "горы", not three weak ones for each prefix typed along the way).
  const recordSearchTerm = (term) => {
    const clean = (term || '').trim().toLowerCase();
    if (clean.length < 2) return;
    const profile = getReadingProfile();
    profile.searchTerms[clean] = (profile.searchTerms[clean] || 0) + 1;
    const entries = Object.entries(profile.searchTerms);
    if (entries.length > READING_PROFILE_MAX_TERMS) {
      // Trim the weakest signals first so the strongest repeat searches survive.
      entries.sort((a, b) => a[1] - b[1]);
      for (const [k] of entries.slice(0, entries.length - READING_PROFILE_MAX_TERMS)) {
        delete profile.searchTerms[k];
      }
    }
    saveReadingProfile(profile);
  };

  // Exposed on window — catalog.js is a separate script/closure and
  // needs to both read the profile (to score articles) and feed it new
  // search terms.
  window.stepplifyReading = {
    getProfile: getReadingProfile,
    recordView: recordArticleView,
    recordSearch: recordSearchTerm,
  };

  const initAutocomplete = (input, list, options) => {
    if (!input || !list) return;
    let currentMatches = [];
    let activeIndex = -1;

    const closeList = () => {
      list.classList.remove('open');
      list.innerHTML = '';
      currentMatches = [];
      activeIndex = -1;
    };

    const highlight = (text, query) => {
      const i = text.toLowerCase().indexOf(query.toLowerCase());
      if (i === -1) return escapeHtml(text);
      return `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + query.length))}</mark>${escapeHtml(text.slice(i + query.length))}`;
    };

    const setActive = (index) => {
      activeIndex = index;
      Array.from(list.children).forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      list.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    };

    const renderList = (query) => {
      const q = query.toLowerCase();
      // Matches where the query starts a word (e.g. a city name after
      // "НИШ ФМН ") outrank ones where it only appears mid-string, so a
      // specific city/name surfaces even when broader queries like
      // "НИШ" (32 possible schools) also match dozens of other entries —
      // previously a flat 8-result cap meant later options in the array
      // could never appear at all for those broad queries.
      currentMatches = options
        .filter((o) => o.toLowerCase().includes(q))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) ? 0 : 1;
          const bStarts = b.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) ? 0 : 1;
          return aStarts - bStarts;
        })
        .slice(0, 20);
      activeIndex = -1;
      if (!currentMatches.length) {
        list.innerHTML = '<li class="autocomplete-empty">Ничего не найдено — можно вписать вручную, например обычную гос. или частную школу</li>';
      } else {
        list.innerHTML = currentMatches
          .map((o, i) => `<li class="autocomplete-item" role="option" data-index="${i}">${highlight(o, query)}</li>`)
          .join('');
      }
      list.classList.add('open');
    };

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) { closeList(); return; }
      renderList(q);
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q) renderList(q);
    });

    // mousedown (not click) fires before the input's blur, so the
    // selection registers before the list would otherwise close.
    list.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.autocomplete-item');
      if (!item) return;
      const idx = Number(item.dataset.index);
      if (currentMatches[idx]) input.value = currentMatches[idx];
      closeList();
    });

    input.addEventListener('keydown', (e) => {
      if (!list.classList.contains('open') || !currentMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, currentMatches.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          input.value = currentMatches[activeIndex];
          closeList();
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target !== input && !list.contains(e.target)) closeList();
    });
  };

  const niCities = [
    'Алматы', 'Астана', 'Актобе', 'Атырау', 'Караганда', 'Кокшетау',
    'Костанай', 'Кызылорда', 'Павлодар', 'Петропавловск', 'Семей',
    'Талдыкорган', 'Тараз', 'Уральск', 'Усть-Каменогорск', 'Шымкент',
  ];
  initAutocomplete(document.getElementById('regSchool'), document.getElementById('regSchoolList'), [
    ...niCities.map((c) => `НИШ ФМН ${c}`),
    ...niCities.map((c) => `НИШ ХБН ${c}`),
    'КБТУ — Казахстанско-Британский технический университет',
    'КазНУ им. аль-Фараби',
    'ЕНУ им. Л.Н. Гумилева',
    'Satbayev University',
    'Nazarbayev University',
    'КИМЭП University',
    'AlmaU — Almaty Management University',
    'ЮКГУ им. М. Ауэзова',
    'КазНПУ им. Абая',
    'СДУ — Suleyman Demirel University',
    'Astana IT University',
    'КазНМУ им. С.Д. Асфендиярова',
    'МУИТ — Международный университет информационных технологий',
    'Костанайский государственный университет им. А. Байтурсынова',
  ]);

  // All 17 regions of Kazakhstan (2024 administrative split), including
  // the three newest ones carved out in 2022 — Абайская, Жетысуская and
  // Улытауская — plus the three cities of republican significance,
  // which registration forms commonly list alongside the regions.
  initAutocomplete(document.getElementById('regRegion'), document.getElementById('regRegionList'), [
    'г. Астана',
    'г. Алматы',
    'г. Шымкент',
    'Абайская область',
    'Акмолинская область',
    'Актюбинская область',
    'Алматинская область',
    'Атырауская область',
    'Восточно-Казахстанская область',
    'Жамбылская область',
    'Жетысуская область',
    'Западно-Казахстанская область',
    'Карагандинская область',
    'Костанайская область',
    'Кызылординская область',
    'Мангистауская область',
    'Павлодарская область',
    'Северо-Казахстанская область',
    'Туркестанская область',
    'Улытауская область',
  ]);

  // ============ About section (expands downward on click) ============
  const aboutLink = document.getElementById('aboutLink');
  const aboutSection = document.getElementById('aboutSection');
  if (aboutLink && aboutSection) {
    aboutLink.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = aboutSection.classList.toggle('open');
      aboutSection.setAttribute('aria-hidden', String(!isOpen));
      if (isOpen) {
        // Let the grid-row transition kick off first, then smooth-scroll
        // so the reveal and the scroll read as one continuous motion.
        requestAnimationFrame(() => {
          aboutSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });
  }

  // "Публикуй / Открывай / Выигрывай" route — a dashed trail that fills
  // in like a map route as the page scrolls, lighting up each stop
  // (dot + card) in turn the moment the fill reaches it, instead of
  // revealing all three at once.
  const aboutRoute = document.getElementById('aboutRoute');
  const aboutRouteFill = document.getElementById('aboutRouteFill');
  const aboutRouteTrack = aboutRoute && aboutRoute.querySelector('.about-route-track');
  const routePoints = aboutRoute ? Array.from(aboutRoute.querySelectorAll('.about-route-point')) : [];

  if (aboutRoute && aboutRouteFill && aboutRouteTrack && routePoints.length) {
    // A dot "lights up" once it crosses this fraction of the viewport
    // height, scrolling up from the bottom.
    const triggerFraction = 0.78;
    let ticking = false;

    const updateRoute = () => {
      ticking = false;
      const triggerY = window.innerHeight * triggerFraction;
      const trackRect = aboutRouteTrack.getBoundingClientRect();
      if (trackRect.height <= 0) return; // section still collapsed

      let lastActiveDot = null;
      routePoints.forEach((point) => {
        const dot = point.querySelector('.arp-dot');
        const dotRect = dot.getBoundingClientRect();
        const dotCenter = dotRect.top + dotRect.height / 2;
        const isActive = dotCenter < triggerY;
        point.classList.toggle('active', isActive);
        if (isActive) lastActiveDot = dot;
      });

      if (!lastActiveDot) {
        aboutRouteFill.style.height = '0%';
      } else {
        const dotRect = lastActiveDot.getBoundingClientRect();
        const filledPx = (dotRect.top + dotRect.height / 2) - trackRect.top;
        const pct = Math.max(0, Math.min(100, (filledPx / trackRect.height) * 100));
        aboutRouteFill.style.height = pct + '%';
      }
    };

    const requestRouteUpdate = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateRoute);
      }
    };

    window.addEventListener('scroll', requestRouteUpdate, { passive: true });
    window.addEventListener('resize', requestRouteUpdate);

    // The section is collapsed (height 0) until "О проекте" is opened,
    // and every stop's position keeps changing for the ~0.7s it takes
    // to expand — watch for the "open" class flipping and recompute on
    // every frame for the duration of that transition, rather than
    // relying only on scroll/resize events.
    if (aboutSection && 'MutationObserver' in window) {
      const openWatcher = new MutationObserver(() => {
        const start = performance.now();
        const loop = (now) => {
          updateRoute();
          if (now - start < 800) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      openWatcher.observe(aboutSection, { attributes: true, attributeFilter: ['class'] });
    }

    requestRouteUpdate();
  }

  const API_URL = 'http://localhost:5000/api';
  // avatarUrl comes back from the server as a root-relative path like
  // "/uploads/avatar-....jpg" — fine when the page itself is served
  // from the same origin as the API (http://localhost:5000), but if
  // this page is opened from anywhere else (a different dev-server
  // port, file://, …) that path resolves against the wrong origin and
  // the <img> 404s silently while API calls keep working, since those
  // already use the absolute API_URL above. Resolve it against the
  // API's origin explicitly so avatars don't depend on how the page
  // itself happens to be served.
  const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');
  const resolveAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return avatarUrl;
    return /^https?:\/\//.test(avatarUrl) ? avatarUrl : API_ORIGIN + avatarUrl;
  };

  // ============ Auth State ============
  const authOverlay  = document.getElementById('authOverlay');
  const authClose    = document.getElementById('authClose');
  const signInLink   = document.getElementById('signInLink');
  const logoutLink   = document.getElementById('logoutLink');
  const userNav      = document.getElementById('userNav');
  const userNavName  = document.getElementById('userNavName');
  const userNavAvatar = document.getElementById('userNavAvatar');
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
      renderAvatarInto(userNavAvatar, user);
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
          school:   document.getElementById('regSchool').value,
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

  // ============ Publish / Edit Article Modal ============
  // Same modal + form serves both flows — Edit (opened via the article
  // reader's own-article "Редактировать" button, see wireOwnerActions)
  // pre-fills the fields and flips editingArticleId on, which the submit
  // handler below uses to PUT instead of POST.
  const publishOverlay   = document.getElementById('publishOverlay');
  const publishClose     = document.getElementById('publishClose');
  const publishTitleEl   = document.getElementById('publishModalTitle');
  const publishSubmitBtn = document.getElementById('publishSubmitBtn');
  const artImagesLabel   = document.querySelector('label[for="artImages"]');

  let editingArticleId = null;

  const resetPublishModeToCreate = () => {
    editingArticleId = null;
    if (publishTitleEl) publishTitleEl.textContent = '✍️ Опубликовать статью';
    if (publishSubmitBtn) publishSubmitBtn.textContent = 'Опубликовать →';
    if (artImagesLabel) artImagesLabel.textContent = 'Фотографии';
  };

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
    resetPublishModeToCreate();
    document.getElementById('publishForm').reset();
    publishOverlay.classList.add('open');
    publishOverlay.setAttribute('aria-hidden', 'false');
  };

  // Opened from the article reader's "Редактировать" button — server
  // re-checks ownership on PUT regardless of what the UI shows.
  window.openEditArticle = (article) => {
    const token = localStorage.getItem('stepplify_token');
    if (!token) return;
    editingArticleId = article.id;
    if (publishTitleEl) publishTitleEl.textContent = '✏️ Редактировать статью';
    if (publishSubmitBtn) publishSubmitBtn.textContent = 'Сохранить изменения';
    if (artImagesLabel) artImagesLabel.textContent = 'Фотографии (оставьте пустым, чтобы сохранить текущие)';

    document.getElementById('artTitle').value = article.title || '';
    document.getElementById('artCategory').value = article.category || '';
    document.getElementById('artContent').value = article.content || '';
    document.getElementById('artLocation').value = article.locationName || '';
    document.getElementById('artImages').value = '';
    const publishErrorEl = document.getElementById('publishError');
    if (publishErrorEl) publishErrorEl.textContent = '';
    if (aiResultBox) aiResultBox.hidden = true;
    aiCheckBlocksPublish = false;

    publishOverlay.classList.add('open');
    publishOverlay.setAttribute('aria-hidden', 'false');
  };

  document.getElementById('publishBtn')?.addEventListener('click', openPublish);
  // Any other "add an article" entry point (catalog page empty state,
  // sidebar shortcut, etc.) just needs this class — no id collisions.
  document.querySelectorAll('.js-publish-trigger').forEach(btn => btn.addEventListener('click', openPublish));
  // Also wire the "Участвовать и выиграть" button in winners section
  document.querySelectorAll('.btn-primary').forEach(btn => {
    if (btn.textContent.includes('Участвовать')) btn.addEventListener('click', openPublish);
  });

  publishClose.addEventListener('click', () => {
    publishOverlay.classList.remove('open');
    publishOverlay.setAttribute('aria-hidden', 'true');
    resetPublishModeToCreate();
  });
  publishOverlay.addEventListener('click', (e) => {
    if (e.target === publishOverlay) {
      publishOverlay.classList.remove('open');
      publishOverlay.setAttribute('aria-hidden', 'true');
      resetPublishModeToCreate();
    }
  });

  // AI check button inside publish form — verifies grammar/spelling,
  // profanity and flags shaky factual claims before publishing.
  const aiResultBox = document.getElementById('aiCheckResult');
  const artContentEl = document.getElementById('artContent');
  let aiCheckBlocksPublish = false;

  // Any edit after a check invalidates that check's verdict — force a
  // fresh review rather than trusting a stale "clean" result.
  artContentEl?.addEventListener('input', () => {
    aiCheckBlocksPublish = false;
    if (aiResultBox) aiResultBox.hidden = true;
  });

  // Word-level diff (classic LCS-based alignment) so "what the AI changed"
  // can be shown directly instead of just handing back a new blob of text.
  // Guarded by a token-count cap since the DP table is O(tokens²).
  const diffWords = (oldText, newText) => {
    const oldTokens = oldText.split(/(\s+)/);
    const newTokens = newText.split(/(\s+)/);
    if (oldTokens.length > 1500 || newTokens.length > 1500) return null;

    const m = oldTokens.length, n = newTokens.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = oldTokens[i] === newTokens[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (oldTokens[i] === newTokens[j]) { ops.push({ type: 'same', text: oldTokens[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'removed', text: oldTokens[i] }); i++; }
      else { ops.push({ type: 'added', text: newTokens[j] }); j++; }
    }
    while (i < m) { ops.push({ type: 'removed', text: oldTokens[i] }); i++; }
    while (j < n) { ops.push({ type: 'added', text: newTokens[j] }); j++; }
    return ops;
  };

  const buildDiffHtml = (oldText, newText) => {
    if (oldText === newText) {
      return '<p class="ai-note ai-note--muted">Правок не потребовалось — текст уже был в порядке.</p>';
    }
    const ops = diffWords(oldText, newText);
    if (!ops) {
      return '<p class="ai-note ai-note--muted">Текст слишком большой для наглядного сравнения — в поле выше уже подставлен исправленный вариант.</p>';
    }
    const html = ops.map((op) => {
      const text = escapeHtml(op.text);
      if (op.type === 'removed') return `<del class="diff-removed">${text}</del>`;
      if (op.type === 'added') return `<ins class="diff-added">${text}</ins>`;
      return text;
    }).join('');
    return `<div class="ai-diff">${html}</div>`;
  };

  const renderAiResult = (data) => {
    if (!aiResultBox) return;
    const verdict = data.verdict || 'needs_review';
    const verdictLabel = { approved: '✅ Готово к публикации', needs_review: '⚠️ Стоит перепроверить', rejected: '⛔ Публикация заблокирована' }[verdict] || verdict;

    const parts = [`<div class="ai-verdict ai-verdict--${verdict}">${verdictLabel}</div>`];
    if (data.summary) parts.push(`<p class="ai-summary">${data.summary}</p>`);
    if (data.profanityNote) parts.push(`<p class="ai-note ai-note--bad">🤬 ${data.profanityNote}</p>`);
    if (Array.isArray(data.factualConcerns) && data.factualConcerns.length) {
      const items = data.factualConcerns.map((c) => `<li>${c}</li>`).join('');
      parts.push(`<p class="ai-note">🔎 Проверьте эти утверждения:</p><ul class="ai-facts">${items}</ul>`);
    }
    if (data.isMock && data.message) parts.push(`<p class="ai-note ai-note--muted">${data.message}</p>`);

    parts.push('<p class="ai-note">Что изменил ИИ:</p>');
    parts.push(buildDiffHtml(data.originalText || '', data.correctedText || data.improvedText || ''));

    aiResultBox.innerHTML = parts.join('');
    aiResultBox.hidden = false;
  };

  document.getElementById('aiCheckBtn').addEventListener('click', async () => {
    const btn = document.getElementById('aiCheckBtn');
    const textarea = artContentEl;
    const token = localStorage.getItem('stepplify_token');
    if (!textarea.value.trim()) {
      document.getElementById('publishError').textContent = 'Напишите текст статьи перед автопроверкой.';
      return;
    }
    btn.textContent = 'Проверяем...';
    btn.disabled = true;
    document.getElementById('publishError').textContent = '';
    // Demo mode (no GROK_API_KEY) answers almost instantly, so without a
    // floor here "Проверяем..." can flash for under 100ms — long enough
    // to be real, too short to actually see, which reads as "nothing
    // happened". A minimum visible duration makes the check legible.
    const minSpinner = new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const [res] = await Promise.all([
        fetch(`${API_URL}/ai/edit-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ draftText: textarea.value }),
        }),
        minSpinner,
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка ИИ');
      textarea.value = data.correctedText || data.improvedText;
      aiCheckBlocksPublish = data.verdict === 'rejected';
      renderAiResult(data);
      aiResultBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      await minSpinner;
      document.getElementById('publishError').textContent = err.message;
    } finally {
      btn.textContent = 'Автопроверка';
      btn.disabled = false;
    }
  });

  // Publish form submit
  document.getElementById('publishForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (aiCheckBlocksPublish) {
      document.getElementById('publishError').textContent = 'Уберите нецензурную лексику из текста и нажмите «Автопроверка» ещё раз перед публикацией.';
      return;
    }
    const isEditing = editingArticleId !== null;
    const btn = document.getElementById('publishSubmitBtn');
    btn.textContent = isEditing ? 'Сохраняем...' : 'Публикуем...';
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

      const res = await fetch(
        isEditing ? `${API_URL}/articles/${editingArticleId}` : `${API_URL}/articles`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (isEditing ? 'Ошибка сохранения' : 'Ошибка публикации'));
      publishOverlay.classList.remove('open');
      publishOverlay.setAttribute('aria-hidden', 'true');
      document.getElementById('publishForm').reset();
      resetPublishModeToCreate();
      // Reload marquee with fresh articles — an edit can change the
      // title/category shown on its card too, not just a new publish.
      const freshRes = await fetch(`${API_URL}/articles/recent?limit=8`);
      if (freshRes.ok) {
        const freshArticles = await freshRes.json();
        const track = document.getElementById('marqueeTrack');
        if (track && freshArticles.length) {
          const renderCard = (a) => `
            <article class="article-card" data-id="${a.id}">
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
      if (!isEditing) {
        // Update user nav points — editing doesn't award more.
        const updatedUser = JSON.parse(localStorage.getItem('stepplify_user') || '{}');
        updatedUser.points = (updatedUser.points || 0) + 100;
        localStorage.setItem('stepplify_user', JSON.stringify(updatedUser));
        updateNavFromStorage();
      }
      // Let catalog.js (if present on this page) know an article was
      // published/edited so the grid refreshes without a manual reload.
      document.dispatchEvent(new CustomEvent(isEditing ? 'stepplify:articleUpdated' : 'stepplify:articlePublished', { detail: data.article }));
      alert(isEditing ? '✅ Статья обновлена.' : '🎉 Статья опубликована! Вам начислено +100 баллов.');
    } catch (err) {
      document.getElementById('publishError').textContent = err.message;
    } finally {
      btn.textContent = isEditing ? 'Сохранить изменения' : 'Опубликовать →';
      btn.disabled = false;
    }
  });

  // ============ Article Reader Modal ============
  // Opened by clicking any article card (homepage marquee, catalog grid)
  // via window.openArticleModal(id) — exposed on window so catalog.js,
  // a separate script/closure, can call into it too.
  const articleOverlay = document.getElementById('articleOverlay');
  const articleClose = document.getElementById('articleClose');
  const articleReader = document.getElementById('articleReader');
  const articleModalEl = articleOverlay?.querySelector('.auth-modal');
  // The click that opens the modal (e.g. from a card whose position
  // ends up under where the reader's own content — the rating stars in
  // particular, on a short article — now renders) can leave a trailing
  // ghost/ same-click side effect that would otherwise instantly close
  // what just opened. The guard lives IN closeArticleModal itself so
  // every close path (backdrop click, the "log in to rate" bounce,
  // anything added later) is covered, not just one call site — actual
  // deliberate closes (× button, Escape) pass force:true to bypass it.
  let articleOpenedAt = 0;

  const closeArticleModal = ({ force = false } = {}) => {
    if (!articleOverlay) return;
    if (!force && Date.now() - articleOpenedAt < 400) return;
    articleOverlay.classList.remove('open');
    articleOverlay.setAttribute('aria-hidden', 'true');
  };
  articleClose?.addEventListener('click', () => closeArticleModal({ force: true }));
  articleOverlay?.addEventListener('click', (e) => {
    if (e.target === articleOverlay) closeArticleModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && articleOverlay?.classList.contains('open')) closeArticleModal({ force: true });
  });

  // Wheel scrolling on the reader eases toward its target instead of
  // jumping straight to each delta — a slow, deliberately "gliding"
  // feel rather than the browser's default instant scroll.
  function enableSmoothWheelScroll(el, { speed = 0.15 } = {}) {
    if (!el) return () => {};
    let target = el.scrollTop;
    let current = el.scrollTop;
    let ticking = false;

    const step = () => {
      current += (target - current) * speed;
      if (Math.abs(target - current) < 0.5) {
        current = target;
        el.scrollTop = current;
        ticking = false;
        return;
      }
      el.scrollTop = current;
      requestAnimationFrame(step);
    };

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target + e.deltaY));
      if (!ticking) { ticking = true; requestAnimationFrame(step); }
    }, { passive: false });

    // Called after the reader's content changes (new article, scrolled
    // back to top) so the eased scroll doesn't fight the reset.
    return () => { target = el.scrollTop; current = el.scrollTop; };
  }
  const resetArticleScroll = enableSmoothWheelScroll(articleModalEl, { speed: 0.15 });

  const categoryTagClass = {
    'Наука': 'tag-science',
    'Технологии': 'tag-tech',
    'Экология': 'tag-eco',
    'История': 'tag-history',
    'Эссе': 'tag-essay',
    'Психология': 'tag-psych',
  };

  function pluralizeRatings(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'оценка';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'оценки';
    return 'оценок';
  }

  const renderStarRow = (filled, { interactive = false, id = '' } = {}) => `
    <div class="star-row${interactive ? ' star-row--interactive' : ''}"${id ? ` id="${id}"` : ''}>
      ${(interactive ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5]).map((i) => `<span class="star ${i <= filled ? 'star--filled' : ''}" data-value="${i}">★</span>`).join('')}
    </div>`;

  // The review textarea is only shown once the reader has an actual
  // rating on this article — the rating is what triggers it, the text
  // is an optional add-on to that same rating, not a standalone comment.
  const renderRatingBlock = (rating) => {
    const r = rating || { average: null, count: 0, myRating: null, myReviewText: null };
    const composeHtml = r.myRating
      ? `
      <div class="article-review-compose">
        <label class="article-review-label" for="articleReviewText">Отзыв (по желанию)</label>
        <textarea id="articleReviewText" rows="3" placeholder="Поделитесь впечатлением от статьи...">${escapeHtml(r.myReviewText || '')}</textarea>
        <button type="button" class="auth-submit article-review-submit" id="articleReviewSubmit">Сохранить отзыв</button>
      </div>`
      : '<p class="article-review-hint">Поставьте оценку, чтобы оставить отзыв.</p>';
    return `
      <div class="article-rating-summary">
        ${r.count > 0
          ? `${renderStarRow(Math.round(r.average))}<span class="article-rating-value">${r.average} · ${r.count} ${pluralizeRatings(r.count)}</span>`
          : '<span class="article-rating-empty">Нет оценок</span>'}
      </div>
      <div class="article-rate-own">
        <span class="article-rate-own-label">Ваша оценка:</span>
        ${renderStarRow(r.myRating || 0, { interactive: true, id: 'articleMyStars' })}
      </div>
      ${composeHtml}`;
  };

  const formatReviewDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const renderReviewsList = (reviews) => {
    const list = Array.isArray(reviews) ? reviews : [];
    return `
      <h3 class="article-reviews-title">Отзывы <span class="article-reviews-count">${list.length}</span></h3>
      ${list.length
        ? list.map((rev) => `
            <div class="article-review">
              <div class="article-review-head">
                <span class="article-review-author">${escapeHtml(rev.author)}</span>
                ${renderStarRow(rev.value)}
              </div>
              <div class="article-review-meta">${escapeHtml(rev.meta)} · ${formatReviewDate(rev.createdAt)}</div>
              <p class="article-review-text">${escapeHtml(rev.text)}</p>
            </div>`).join('')
        : '<p class="article-reviews-empty">Отзывов пока нет — станьте первым.</p>'}`;
  };

  // Both the star row and the review compose box post to the same
  // /rate endpoint and get back the same {rating, reviews} shape, so a
  // single handler re-renders (and re-wires) both containers either way.
  const applyRatingResponse = (articleId, data) => {
    const ratingBox = document.getElementById('articleReaderRating');
    const reviewsBox = document.getElementById('articleReviews');
    if (ratingBox) ratingBox.innerHTML = renderRatingBlock(data.rating);
    if (reviewsBox) reviewsBox.innerHTML = renderReviewsList(data.reviews);
    wireStarInteraction(articleId);
    wireReviewSubmit(articleId);
  };

  const wireStarInteraction = (articleId) => {
    const starsEl = document.getElementById('articleMyStars');
    starsEl?.querySelectorAll('.star').forEach((starEl) => {
      starEl.addEventListener('click', async () => {
        const token = localStorage.getItem('stepplify_token');
        if (!token) {
          closeArticleModal();
          authOverlay.classList.add('open');
          authOverlay.setAttribute('aria-hidden', 'false');
          return;
        }
        const value = Number(starEl.dataset.value);
        // Optimistic highlight while the request is in flight.
        starsEl.querySelectorAll('.star').forEach((s) => {
          s.classList.toggle('star--filled', Number(s.dataset.value) <= value);
        });
        try {
          const res = await fetch(`${API_URL}/articles/${articleId}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            // No `text` key here on purpose — a plain star click must not
            // clobber a review the reader already wrote.
            body: JSON.stringify({ value }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Ошибка сохранения оценки');
          applyRatingResponse(articleId, data);
        } catch (err) {
          console.error('Rate article failed:', err);
        }
      });
    });
  };

  const wireReviewSubmit = (articleId) => {
    const submitBtn = document.getElementById('articleReviewSubmit');
    submitBtn?.addEventListener('click', async () => {
      const token = localStorage.getItem('stepplify_token');
      const textEl = document.getElementById('articleReviewText');
      const starsEl = document.getElementById('articleMyStars');
      const value = starsEl?.querySelectorAll('.star--filled').length || 0;
      if (!token || !value) return;
      submitBtn.textContent = 'Сохраняем...';
      submitBtn.disabled = true;
      try {
        const res = await fetch(`${API_URL}/articles/${articleId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ value, text: textEl.value.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения отзыва');
        applyRatingResponse(articleId, data);
      } catch (err) {
        console.error('Review submit failed:', err);
        // The button survives failure (unlike success, which re-renders
        // and drops it), so it's safe to restore here.
        submitBtn.textContent = 'Сохранить отзыв';
        submitBtn.disabled = false;
      }
    });
  };

  const renderArticleReader = (a) => {
    const images = Array.isArray(a.images) ? a.images : [];
    const gallery = images.length
      ? `<div class="article-reader-gallery">${images.map((src) => `<img src="${src}" alt="" loading="lazy" />`).join('')}</div>`
      : '';
    const metaLine = [a.meta, a.locationName].filter(Boolean).join(' · ');
    const cachedUser = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
    const isOwner = !!cachedUser && cachedUser.id === a.authorId;
    const ownerActions = isOwner
      ? `<div class="article-owner-actions">
           <button type="button" class="article-owner-btn" id="articleEditBtn">✏️ Редактировать</button>
           <button type="button" class="article-owner-btn article-owner-btn--danger" id="articleDeleteBtn">🗑 Удалить</button>
         </div>`
      : '';
    return `
      ${gallery}
      <span class="tag ${categoryTagClass[a.category] || 'tag-essay'}">${escapeHtml(a.category)}</span>
      <h2 class="article-reader-title">${escapeHtml(a.title)}</h2>
      <div class="article-reader-byline">
        <span class="article-reader-author">${escapeHtml(a.author)}</span>
        <span class="article-reader-meta">${escapeHtml(metaLine)}</span>
      </div>
      ${ownerActions}
      <div class="article-reader-stats">👁 <span id="articleViewsValue">${escapeHtml(String(a.viewsFormatted ?? a.views ?? 0))}</span></div>
      <div class="article-reader-body">${escapeHtml(a.content).replace(/\n/g, '<br>')}</div>
      <div class="article-reader-rating" id="articleReaderRating">${renderRatingBlock(a.rating)}</div>
      <div class="article-reviews" id="articleReviews">${renderReviewsList(a.reviews)}</div>`;
  };

  // Wired only when renderArticleReader actually printed the buttons
  // (i.e. the viewer owns this article) — everyone else's articles have
  // no edit/delete affordance in the DOM at all, not just a disabled one.
  const wireOwnerActions = (articleId, article) => {
    const editBtn = document.getElementById('articleEditBtn');
    const deleteBtn = document.getElementById('articleDeleteBtn');

    editBtn?.addEventListener('click', () => {
      closeArticleModal({ force: true });
      window.openEditArticle?.(article);
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('Удалить эту статью без возможности восстановления?')) return;
      const token = localStorage.getItem('stepplify_token');
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Удаляем...';
      try {
        const res = await fetch(`${API_URL}/articles/${articleId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
        closeArticleModal({ force: true });
        document.dispatchEvent(new CustomEvent('stepplify:articleDeleted', { detail: { id: articleId } }));
      } catch (err) {
        alert(err.message);
        deleteBtn.disabled = false;
        deleteBtn.textContent = '🗑 Удалить';
      }
    });
  };

  window.openArticleModal = async (id) => {
    if (!articleOverlay || !articleReader || !id) return;
    articleOpenedAt = Date.now();
    articleReader.innerHTML = '<div class="article-reader-loading">Загрузка статьи…</div>';
    articleOverlay.classList.add('open');
    articleOverlay.setAttribute('aria-hidden', 'false');
    if (articleModalEl) articleModalEl.scrollTop = 0;
    resetArticleScroll();

    const token = localStorage.getItem('stepplify_token');
    try {
      const res = await fetch(`${API_URL}/articles/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статью.');

      articleReader.innerHTML = renderArticleReader(data);
      wireStarInteraction(id);
      wireReviewSubmit(id);
      wireOwnerActions(id, data);
      recordArticleView(data);

      // One view per open, as requested — fire-and-forget, then
      // reconcile the shown count with the server's real number.
      fetch(`${API_URL}/articles/${id}/view`, { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .then((viewData) => {
          const el = document.getElementById('articleViewsValue');
          if (el && viewData) el.textContent = viewData.viewsFormatted;
        })
        .catch(() => {});
    } catch (err) {
      articleReader.innerHTML = `<p class="auth-error">${escapeHtml(err.message)}</p>`;
    }
  };

  // ============ Top-10 Weekly Modal ============
  // Not every page has a "Топ-10 недели" trigger — guarded so pages
  // without one (or without the modal itself) don't break the rest of
  // this script.
  const top10Btn     = document.getElementById('top10Btn');
  const top10Overlay = document.getElementById('top10Overlay');
  const top10Close   = document.getElementById('top10Close');
  const top10List    = document.getElementById('top10List');

  if (top10Btn && top10Overlay && top10Close && top10List) {
    top10Btn.addEventListener('click', async (e) => {
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
  }

  // ============ Profile Modal ============
  // Opened from the avatar/name button in the nav pill (only shown once
  // logged in). Fills in from the cached stepplify_user immediately so
  // it never opens blank, then refreshes from /users/profile for the
  // authoritative points/level plus the author's own article list.
  const userNavProfileBtn  = document.getElementById('userNavProfileBtn');
  const profileOverlay     = document.getElementById('profileOverlay');
  const profileClose       = document.getElementById('profileClose');
  const profileAvatarEl    = document.getElementById('profileAvatar');
  const profileAvatarBtn   = document.getElementById('profileAvatarBtn');
  const profileAvatarInput = document.getElementById('profileAvatarInput');
  const profileName        = document.getElementById('profileName');
  const profileLevelBadge  = document.getElementById('profileLevelBadge');
  const profileSchool      = document.getElementById('profileSchool');
  const profileGrade       = document.getElementById('profileGrade');
  const profileRegion      = document.getElementById('profileRegion');
  const profilePoints      = document.getElementById('profilePoints');
  const profileSaveBtn     = document.getElementById('profileSaveBtn');
  const profileSaveHint    = document.getElementById('profileSaveHint');
  const profileArticlesCount = document.getElementById('profileArticlesCount');
  const profileArticlesList  = document.getElementById('profileArticlesList');

  // Tabs
  const profileTabInfo     = document.getElementById('profileTabInfo');
  const profileTabFriends  = document.getElementById('profileTabFriends');
  const profilePanelInfo   = document.getElementById('profilePanelInfo');
  const profilePanelFriends = document.getElementById('profilePanelFriends');
  const profileFriendsBadge = document.getElementById('profileFriendsBadge');

  // Friends tab
  const friendsSearchInput   = document.getElementById('friendsSearchInput');
  const friendsSearchResults = document.getElementById('friendsSearchResults');
  const friendsIncomingSection = document.getElementById('friendsIncomingSection');
  const friendsIncomingList  = document.getElementById('friendsIncomingList');
  const friendsIncomingCount = document.getElementById('friendsIncomingCount');
  const friendsOutgoingSection = document.getElementById('friendsOutgoingSection');
  const friendsOutgoingList  = document.getElementById('friendsOutgoingList');
  const friendsOutgoingCount = document.getElementById('friendsOutgoingCount');
  const friendsList  = document.getElementById('friendsList');
  const friendsCount = document.getElementById('friendsCount');

  if (userNavProfileBtn && profileOverlay && profileClose && profileArticlesList) {
    const closeProfileModal = () => {
      profileOverlay.classList.remove('open');
      profileOverlay.setAttribute('aria-hidden', 'true');
    };

    // ---------- Tabs ----------
    const switchProfileTab = (tab) => {
      const isInfo = tab === 'info';
      profileTabInfo.classList.toggle('active', isInfo);
      profileTabFriends.classList.toggle('active', !isInfo);
      profilePanelInfo.hidden = !isInfo;
      profilePanelFriends.hidden = isInfo;
    };
    profileTabInfo?.addEventListener('click', () => switchProfileTab('info'));
    profileTabFriends?.addEventListener('click', () => switchProfileTab('friends'));

    // ---------- Avatar upload ----------
    // Camera badge just opens the (hidden, styleless) file input — the
    // actual upload happens on its change event below.
    profileAvatarBtn?.addEventListener('click', () => profileAvatarInput?.click());

    profileAvatarInput?.addEventListener('change', async () => {
      const file = profileAvatarInput.files[0];
      if (!file) return;
      const token = localStorage.getItem('stepplify_token');
      if (!token) return;

      profileAvatarBtn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('avatar', file);
        const res = await fetch(`${API_URL}/users/avatar`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Не удалось обновить аватар');

        const updatedUser = JSON.parse(localStorage.getItem('stepplify_user') || '{}');
        updatedUser.avatarUrl = data.avatarUrl;
        localStorage.setItem('stepplify_user', JSON.stringify(updatedUser));

        renderAvatarInto(profileAvatarEl, updatedUser);
        updateNavFromStorage();
      } catch (err) {
        alert(err.message);
      } finally {
        profileAvatarBtn.disabled = false;
        profileAvatarInput.value = '';
      }
    });

    // ---------- Editable fields (name / school / grade / region) ----------
    // Fields are always live <input>s (no separate "edit mode" toggle,
    // as requested) — the save button just stays disabled until
    // something actually differs from what was loaded.
    let profileBaseline = null;

    // Split from the hint-clearing below: the save handler's `finally`
    // needs to refresh the button's disabled state without wiping out
    // the "Сохранено ✓" / error message it just set.
    const updateSaveButtonState = () => {
      if (!profileBaseline) {
        profileSaveBtn.disabled = true;
        return;
      }
      const dirty =
        profileName.value.trim() !== profileBaseline.fullName ||
        profileSchool.value.trim() !== profileBaseline.school ||
        profileGrade.value.trim() !== profileBaseline.grade ||
        profileRegion.value.trim() !== profileBaseline.region;
      profileSaveBtn.disabled = !dirty;
    };
    const checkProfileDirty = () => {
      updateSaveButtonState();
      profileSaveHint.textContent = '';
      profileSaveHint.className = 'profile-save-hint';
    };
    [profileName, profileSchool, profileGrade, profileRegion].forEach((el) => {
      el?.addEventListener('input', checkProfileDirty);
    });

    profileSaveBtn?.addEventListener('click', async () => {
      const fullName = profileName.value.trim();
      const school = profileSchool.value.trim();
      const grade = profileGrade.value.trim();
      const region = profileRegion.value.trim();
      if (!fullName || !school || !grade || !region) {
        profileSaveHint.textContent = 'Заполните все поля.';
        profileSaveHint.className = 'profile-save-hint is-error';
        return;
      }
      const token = localStorage.getItem('stepplify_token');
      profileSaveBtn.disabled = true;
      profileSaveBtn.textContent = 'Сохраняем...';
      try {
        const res = await fetch(`${API_URL}/users/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ fullName, school, grade, region }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');

        localStorage.setItem('stepplify_user', JSON.stringify(data.user));
        updateNavFromStorage();
        profileLevelBadge.textContent = levelTitle(data.user.level);
        profileBaseline = { fullName: data.user.fullName, school: data.user.school, grade: data.user.grade, region: data.user.region };
        profileSaveHint.textContent = 'Сохранено ✓';
        profileSaveHint.className = 'profile-save-hint is-success';
      } catch (err) {
        profileSaveHint.textContent = err.message;
        profileSaveHint.className = 'profile-save-hint is-error';
      } finally {
        profileSaveBtn.textContent = 'Сохранить изменения';
        updateSaveButtonState();
      }
    });

    // ---------- Own articles list ----------
    const renderProfileArticles = (articles) => {
      if (!articles.length) {
        profileArticlesList.innerHTML = '<div class="profile-articles-empty">У вас пока нет опубликованных статей.</div>';
        return;
      }
      profileArticlesList.innerHTML = articles.map((a) => `
        <button type="button" class="profile-article-row" data-article-id="${a.id}">
          <div class="profile-article-info">
            <div class="profile-article-title">${escapeHtml(a.title)}</div>
            <div class="profile-article-meta">${escapeHtml(a.category)}${a.locationName ? ' · ' + escapeHtml(a.locationName) : ''}</div>
          </div>
          <div class="profile-article-views">👁 ${a.viewsCount ?? 0}</div>
        </button>
      `).join('');
      profileArticlesList.querySelectorAll('.profile-article-row').forEach((row) => {
        row.addEventListener('click', () => {
          closeProfileModal();
          window.openArticleModal?.(row.dataset.articleId);
        });
      });
    };

    // ---------- Friends tab ----------
    const renderFriendRow = (user, actionsHtml) => `
      <div class="friend-row" data-user-id="${user.id}">
        <div class="friend-row-avatar">${user.avatarUrl ? `<img src="${resolveAvatarUrl(user.avatarUrl)}" alt="" />` : `<span>${getInitials(user.fullName)}</span>`}</div>
        <div class="friend-row-info">
          <div class="friend-row-name">${escapeHtml(user.fullName)}</div>
          <div class="friend-row-meta">${escapeHtml(user.school || '')}${user.grade ? ' · ' + escapeHtml(user.grade) : ''} · ⭐ ${user.points ?? 0}</div>
        </div>
        <div class="friend-row-actions">${actionsHtml}</div>
      </div>`;

    const renderFriendsPanel = (data) => {
      // Tab badge = requests waiting on this user specifically, not the
      // total friend count — it's a "you have something to respond to"
      // cue, not a stat.
      if (data.incoming.length) {
        profileFriendsBadge.hidden = false;
        profileFriendsBadge.textContent = String(data.incoming.length);
      } else {
        profileFriendsBadge.hidden = true;
      }

      friendsIncomingSection.hidden = data.incoming.length === 0;
      friendsIncomingCount.textContent = String(data.incoming.length);
      friendsIncomingList.innerHTML = data.incoming.map((u) => renderFriendRow(u, `
        <button type="button" class="friend-btn friend-btn--primary" data-action="accept" data-friendship-id="${u.friendshipId}">Принять</button>
        <button type="button" class="friend-btn" data-action="decline" data-friendship-id="${u.friendshipId}">Отклонить</button>
      `)).join('');

      friendsOutgoingSection.hidden = data.outgoing.length === 0;
      friendsOutgoingCount.textContent = String(data.outgoing.length);
      friendsOutgoingList.innerHTML = data.outgoing.map((u) => renderFriendRow(u, `
        <button type="button" class="friend-btn" data-action="cancel" data-id="${u.id}">Отменить</button>
      `)).join('');

      friendsCount.textContent = String(data.friends.length);
      friendsList.innerHTML = data.friends.length
        ? data.friends.map((u) => renderFriendRow(u, `
            <button type="button" class="friend-btn friend-btn--danger" data-action="remove" data-id="${u.id}">Удалить</button>
          `)).join('')
        : '<div class="friends-empty">Пока нет друзей — найдите их через поиск выше.</div>';
    };

    const loadFriendsData = async () => {
      const token = localStorage.getItem('stepplify_token');
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/friends`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки друзей');
        renderFriendsPanel(data);
      } catch (err) {
        friendsList.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
      }
    };

    const renderSearchResults = (results) => {
      if (!results.length) {
        friendsSearchResults.innerHTML = '<div class="friends-empty">Никого не нашли.</div>';
        return;
      }
      friendsSearchResults.innerHTML = results.map((u) => {
        let actions;
        if (u.friendStatus === 'friends') {
          actions = `<button type="button" class="friend-btn friend-btn--danger" data-action="remove" data-id="${u.id}">Удалить</button>`;
        } else if (u.friendStatus === 'pending_outgoing') {
          actions = `<button type="button" class="friend-btn" data-action="cancel" data-id="${u.id}">Отменить заявку</button>`;
        } else if (u.friendStatus === 'pending_incoming') {
          actions = `
            <button type="button" class="friend-btn friend-btn--primary" data-action="accept" data-friendship-id="${u.friendshipId}">Принять</button>
            <button type="button" class="friend-btn" data-action="decline" data-friendship-id="${u.friendshipId}">Отклонить</button>`;
        } else {
          actions = `<button type="button" class="friend-btn friend-btn--primary" data-action="add" data-id="${u.id}">Добавить</button>`;
        }
        return renderFriendRow(u, actions);
      }).join('');
    };

    // Debounced so it searches once someone pauses typing, not on every
    // keystroke — same reasoning as the catalog search / recommendation
    // signal recording elsewhere in this file.
    let friendsSearchTimer = null;
    friendsSearchInput?.addEventListener('input', () => {
      const q = friendsSearchInput.value.trim();
      clearTimeout(friendsSearchTimer);
      if (q.length < 2) {
        friendsSearchResults.innerHTML = '';
        return;
      }
      friendsSearchResults.innerHTML = '<div class="friends-loading">Ищем...</div>';
      friendsSearchTimer = setTimeout(async () => {
        const token = localStorage.getItem('stepplify_token');
        try {
          const res = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const results = await res.json();
          if (!res.ok) throw new Error(results.error || 'Ошибка поиска');
          renderSearchResults(results);
        } catch (err) {
          friendsSearchResults.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
        }
      }, 400);
    });

    // One delegated handler for every friend action button, across all
    // four lists (search results, incoming, outgoing, friends) — they
    // all funnel into the same three endpoints.
    profilePanelFriends?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const token = localStorage.getItem('stepplify_token');
      btn.disabled = true;
      try {
        if (action === 'add') {
          const res = await fetch(`${API_URL}/friends/request/${btn.dataset.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        } else if (action === 'cancel' || action === 'remove') {
          const res = await fetch(`${API_URL}/friends/${btn.dataset.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        } else if (action === 'accept' || action === 'decline') {
          const res = await fetch(`${API_URL}/friends/${btn.dataset.friendshipId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ accept: action === 'accept' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
        }
        await loadFriendsData();
        // Re-run the active search so its status pills (e.g. "Заявка
        // отправлена" -> "Друзья") reflect the action right away too.
        if (friendsSearchInput?.value.trim().length >= 2) {
          friendsSearchInput.dispatchEvent(new Event('input'));
        }
      } catch (err) {
        alert(err.message);
      } finally {
        if (document.body.contains(btn)) btn.disabled = false;
      }
    });

    // ---------- Open / close ----------
    userNavProfileBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('stepplify_token');
      const cachedUser = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
      if (!token || !cachedUser) return;

      profileOverlay.classList.add('open');
      profileOverlay.setAttribute('aria-hidden', 'false');
      switchProfileTab('info');
      if (friendsSearchInput) friendsSearchInput.value = '';
      friendsSearchResults.innerHTML = '';

      // Cached snapshot first so the modal never opens blank while the
      // fresh copy (with the article list) is still in flight.
      renderAvatarInto(profileAvatarEl, cachedUser);
      profileName.value = cachedUser.fullName || '';
      profileLevelBadge.textContent = levelTitle(cachedUser.level || 1);
      profileSchool.value = cachedUser.school || '';
      profileGrade.value = cachedUser.grade || '';
      profileRegion.value = cachedUser.region || '';
      profilePoints.textContent = cachedUser.points ?? '—';
      profileSaveBtn.disabled = true;
      profileSaveHint.textContent = '';
      profileSaveHint.className = 'profile-save-hint';
      profileArticlesList.innerHTML = '<div class="top10-loading">Загружаем статьи...</div>';
      friendsList.innerHTML = '<div class="friends-loading">Загружаем друзей...</div>';

      loadFriendsData();

      try {
        const res = await fetch(`${API_URL}/users/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки профиля');

        renderAvatarInto(profileAvatarEl, data);
        profileName.value = data.fullName;
        profileLevelBadge.textContent = levelTitle(data.level);
        profileSchool.value = data.school;
        profileGrade.value = data.grade;
        profileRegion.value = data.region;
        profilePoints.textContent = data.points;
        profileBaseline = { fullName: data.fullName, school: data.school, grade: data.grade, region: data.region };
        profileArticlesCount.textContent = data.articlesCount;
        renderProfileArticles(data.articles);
      } catch (err) {
        profileArticlesList.innerHTML = `<div class="auth-error">Не удалось загрузить профиль: ${err.message}</div>`;
      }
    });

    profileClose.addEventListener('click', closeProfileModal);
    profileOverlay.addEventListener('click', (e) => {
      if (e.target === profileOverlay) closeProfileModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && profileOverlay.classList.contains('open')) closeProfileModal();
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
      <article class="article-card" data-id="${a.id ?? ''}">
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

    // Delegated on the track itself (not the individual cards) so it
    // keeps working after innerHTML gets replaced above or by the
    // post-publish refresh further up this file.
    marqueeTrack.addEventListener('click', (e) => {
      const card = e.target.closest('.article-card[data-id]');
      const id = card?.dataset.id;
      if (id) {
        e.stopPropagation();
        window.openArticleModal?.(id);
      }
    });

    // Cards dissolve smoothly into/out of the edges instead of being
    // sliced by a flat color overlay (which looked muddy against the
    // bright sky background — a translucent gradient patch neither
    // hid the card nor let it read cleanly). Each card's own opacity
    // is driven continuously off its actual distance from the visible
    // edge, so it genuinely fades to nothing and the real background
    // shows through underneath — no color to clash with.
    const marqueeViewport = marqueeTrack.closest('.marquee');
    const reducedMotionMarquee = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (marqueeViewport && !reducedMotionMarquee) {
      const fadeZone = 130; // px inward from each edge over which opacity ramps
      const tickFade = () => {
        const viewportRect = marqueeViewport.getBoundingClientRect();
        Array.from(marqueeTrack.children).forEach((card) => {
          const cardRect = card.getBoundingClientRect();
          const centerX = cardRect.left + cardRect.width / 2;
          const distFromLeft = centerX - viewportRect.left;
          const distFromRight = viewportRect.right - centerX;
          const t = Math.max(0, Math.min(1, Math.min(distFromLeft, distFromRight) / fadeZone));
          card.style.opacity = t.toFixed(3);
        });
        requestAnimationFrame(tickFade);
      };
      requestAnimationFrame(tickFade);
    }
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

    // The CSS animation already pauses the strip on hover (see
    // .winners-pill-wrap:hover in styles.css) — this layers a manual
    // wheel-driven pan on top of it so the strip can be nudged left/right
    // while it's paused. The animation drives the independent `translate`
    // property, so setting `transform` here composes with it instead of
    // fighting it, and un-hovering just drops the manual offset and lets
    // the animation carry on from wherever it already was.
    const pillWrap = pillTrack.closest('.winners-pill-wrap');
    if (pillWrap) {
      let manualOffset = 0;
      pillWrap.addEventListener('wheel', (e) => {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!delta) return;
        e.preventDefault();

        const cs = getComputedStyle(pillTrack);
        const animX = cs.translate && cs.translate !== 'none' ? parseFloat(cs.translate) || 0 : 0;
        const setWidth = pillTrack.scrollWidth / 2; // width of one of the two duplicated pill sets

        // Wrap seamlessly within one set's width instead of clamping —
        // the track holds two identical copies back-to-back, so any
        // offset looks right once folded into that range, giving
        // endless scrolling in both directions rather than a dead stop.
        const target = animX + manualOffset - delta;
        const wrapped = -(((-target) % setWidth + setWidth) % setWidth);
        manualOffset = wrapped - animX;

        pillTrack.style.transform = `translateX(${manualOffset}px)`;
      }, { passive: false });

      pillWrap.addEventListener('mouseleave', () => {
        manualOffset = 0;
        pillTrack.style.transform = '';
      });
    }
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
