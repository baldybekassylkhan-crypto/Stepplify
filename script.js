document.addEventListener('DOMContentLoaded', () => {
  // script.js is shared across every page (home, catalog, …), and not
  // every page carries every widget — each block below only wires up
  // if its elements are actually present, so a page can include just
  // the topbar + modals it needs without the rest throwing on a
  // missing element.
  const langBtn = document.getElementById('langBtn');
  const langMenu = document.getElementById('langMenu');

  if (langBtn && langMenu) {
    // Inject Google Translate
    const gtDiv = document.createElement('div');
    gtDiv.id = 'google_translate_element';
    gtDiv.style.display = 'none';
    document.body.appendChild(gtDiv);

    window.googleTranslateElementInit = function() {
      new google.translate.TranslateElement({
        pageLanguage: 'ru',
        includedLanguages: 'ru,en,kk',
        autoDisplay: false
      }, 'google_translate_element');
    };

    const gtScript = document.createElement('script');
    gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(gtScript);

    const langMap = { eng: 'en', kaz: 'kk', rus: 'ru' };

    // Restore selected language from localStorage
    const savedLang = localStorage.getItem('stepplify_lang') || 'rus';
    langBtn.textContent = savedLang;
    
    // Attempt to apply translation on load
    const applyTranslation = (langCode) => {
      if (langCode === 'rus') {
        document.documentElement.style.opacity = '1';
        // When returning to rus, reload might be needed to clear GT changes cleanly,
        // but since Google Translate widget restores to original when 'ru' is selected (pageLang)
        // it will be fine. Just in case, if they want instant switch:
      }

      const select = document.querySelector('.goog-te-combo');
      if (select) {
        select.value = langMap[langCode];
        select.dispatchEvent(new Event('change'));

        if (langCode !== 'rus') {
          const checkTranslated = () => {
            if (document.documentElement.classList.contains('translated-ltr') || document.documentElement.classList.contains('translated-rtl')) {
              document.documentElement.style.opacity = '1';
            } else {
              setTimeout(checkTranslated, 50);
            }
          };
          setTimeout(checkTranslated, 50);
          // Fallback to show page after 1.5s anyway
          setTimeout(() => { document.documentElement.style.opacity = '1'; }, 1500);
        }
      } else {
        setTimeout(() => applyTranslation(langCode), 200);
      }
    };
    if (savedLang !== 'rus') {
      applyTranslation(savedLang);
    } else {
      document.documentElement.style.opacity = '1';
    }

    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('open');
    });

    langMenu.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const langCode = btn.dataset.lang;
        langBtn.textContent = langCode;
        localStorage.setItem('stepplify_lang', langCode);
        langMenu.classList.remove('open');
        applyTranslation(langCode);
      });
    });

    document.addEventListener('click', () => {
      langMenu.classList.remove('open');
    });
  }

  // ============ Mobile nav dropdown ============
  // Below ~900px .nav-center (Каталог статей / О проекте / Карта)
  // stops being a static row and becomes a toggleable dropdown — this
  // button is its only way in on a phone, so without this wiring those
  // links are simply unreachable there.
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navCenter = document.getElementById('navCenter');

  if (mobileMenuBtn && navCenter) {
    const closeMobileMenu = () => {
      navCenter.classList.remove('open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    };

    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navCenter.classList.toggle('open');
      mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Picking a link (including #aboutLink, which has its own separate
    // open/scroll handler elsewhere — this just also closes the
    // dropdown so it doesn't stay open over the revealed section).
    navCenter.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileMenu);
    });

    document.addEventListener('click', (e) => {
      if (!navCenter.contains(e.target) && e.target !== mobileMenuBtn) closeMobileMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileMenu();
    });
  }

  // ============ Typeahead autocomplete (school/university, region) ============
  // Reusable suggestion dropdown, the way education portals suggest
  // your school/region while verifying a school email — matches
  // highlighted inline, arrow keys + Enter to pick, click also works,
  // closes on Escape or a click outside.
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Sets a fixed <select>'s value, but if that value doesn't match any
  // of its options (e.g. free-text region data from before this field
  // became a strict list, or a typo like "областьо" someone typed at
  // registration) it first injects a one-off option carrying that exact
  // value instead of silently landing on the blank placeholder — used
  // by both the article region select and the profile region select so
  // an unmatched value is never lost or blocked from saving. Any
  // previously injected legacy option on this same element is removed
  // first, so re-calling it (e.g. re-opening the modal) doesn't pile up
  // stale one-off options.
  const setSelectValuePreservingUnknown = (selectEl, value, { legacyLabel = (v) => `${v} (текущее значение)` } = {}) => {
    if (!selectEl) return;
    selectEl.querySelectorAll('option[data-legacy-option]').forEach((o) => o.remove());
    const v = value || '';
    if (v && !Array.from(selectEl.options).some((o) => o.value === v)) {
      const legacyOption = document.createElement('option');
      legacyOption.value = v;
      legacyOption.textContent = legacyLabel(v);
      legacyOption.dataset.legacyOption = '1';
      selectEl.insertBefore(legacyOption, selectEl.options[1] || null);
    }
    selectEl.value = v;
  };

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
      userNavPoints.textContent = `⭐ ${user.points} б`;

      let adminLink = document.getElementById('adminReportsLink');
      if (user.role === 'moderator' || user.role === 'admin') {
        if (!adminLink) {
          adminLink = document.createElement('a');
          adminLink.id = 'adminReportsLink';
          adminLink.href = '#';
          adminLink.className = 'logout-link';
          adminLink.innerHTML = 'Жалобы <span id="adminReportsBadge" style="display:none; background:#ef4444; color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:999px; margin-left:4px;"></span>';
          adminLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.openAdminReportsModal();
          });
          document.getElementById('logoutLink').parentNode.insertBefore(adminLink, document.getElementById('logoutLink'));
        }
        
        fetch(`${API_URL}/reports/count`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const badge = document.getElementById('adminReportsBadge');
          if (badge && data && data.count > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = data.count > 99 ? '99+' : data.count;
          } else if (badge) {
            badge.style.display = 'none';
          }
        })
        .catch(() => {});
        
      } else if (adminLink) {
        adminLink.remove();
      }

      // Background sync profile (to update cached user role/points if changed in DB)
      fetch(`${API_URL}/users/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.ok ? r.json() : null)
      .then(freshUser => {
        if (freshUser) {
          const merged = { ...user, ...freshUser };
          localStorage.setItem('stepplify_user', JSON.stringify(merged));
        }
      })
      .catch(() => {});
    } else {
      signInLink.style.display = '';
      userNav.style.display    = 'none';
    }
  };
  updateNavFromStorage();

  // A stale token in localStorage (past its 7-day expiry, or left over
  // from an old session) used to leave whichever modal hit it stuck on
  // a raw "Недействительный или истекший токен." with no way out short
  // of the reader finding the logout link themselves — reloading the
  // page doesn't clear it, since the token only gets removed from
  // storage on an explicit logout. Any authenticated fetch that comes
  // back 401/403 should call this instead of just printing the error:
  // it drops the stale session, closes whatever modal was open, and
  // reopens the login form with an explanation.
  const handleSessionExpired = () => {
    localStorage.removeItem('stepplify_token');
    localStorage.removeItem('stepplify_user');
    updateNavFromStorage();
    document.querySelectorAll('.auth-overlay.open').forEach((el) => {
      if (el === authOverlay) return;
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
    });
    authOverlay.classList.add('open');
    authOverlay.setAttribute('aria-hidden', 'false');
    tabLogin.click();
    loginError.textContent = 'Сессия истекла — войдите снова.';
  };

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
    // Drop any one-off <option> openEditArticle injected below for a
    // legacy region value that didn't match the fixed list — keeps the
    // dropdown clean for publishing a brand-new article.
    document.querySelectorAll('#artRegion option[data-legacy-option]').forEach((o) => o.remove());
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
    if (publishTitleEl) publishTitleEl.textContent = 'Редактировать статью';
    if (publishSubmitBtn) publishSubmitBtn.textContent = 'Сохранить изменения';
    if (artImagesLabel) artImagesLabel.textContent = 'Фотографии (оставьте пустым, чтобы сохранить текущие)';

    document.getElementById('artTitle').value = article.title || '';

    // artRegion is a fixed <select> (needed so its value exact-matches a
    // map region for filtering) but articles published before this field
    // existed fall back to the author's own region, which was typed
    // free-text at registration and often won't match any option — e.g.
    // "Алматы" vs the list's "г. Алматы". Left as-is, the select would
    // silently land on the blank placeholder and, being required, block
    // the save with a native validation tooltip that's easy to miss in
    // this dark modal (looked exactly like the button "didn't work").
    // setSelectValuePreservingUnknown injects the actual value as a
    // one-off option instead, so the field is never blank and saving
    // never gets silently stuck.
    setSelectValuePreservingUnknown(document.getElementById('artRegion'), article.region);

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
      fd.append('region',   document.getElementById('artRegion').value);
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
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          handleSessionExpired();
          return;
        }
        throw new Error(data.error || (isEditing ? 'Ошибка сохранения' : 'Ошибка публикации'));
      }
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

  const renderAvatarElement = (avatarUrl, name, isSmall = false) => {
    const cls = isSmall ? 'threads-avatar threads-avatar--sm' : 'threads-avatar';
    if (avatarUrl) {
      return `<div class="${cls}"><img src="${resolveAvatarUrl(avatarUrl)}" alt="" class="threads-avatar-img" /></div>`;
    }
    return `<div class="${cls}">${getInitials(name)}</div>`;
  };

  const renderReviewsList = (reviews) => {
    const list = Array.isArray(reviews) ? reviews : [];
    const token = localStorage.getItem('stepplify_token');
    const currentUser = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
    const currentUserId = currentUser ? currentUser.id : null;
    const isMod = currentUser && (currentUser.role === 'moderator' || currentUser.role === 'admin');
    return `
      <h3 class="article-reviews-title">Отзывы <span class="article-reviews-count">${list.length}</span></h3>
      ${list.length
        ? list.map((rev) => {
            const replies = Array.isArray(rev.replies) ? rev.replies : [];
            const hasReplies = replies.length > 0;
            const isMyReview = currentUserId && rev.userId === currentUserId;
            const canDeleteReview = isMyReview || isMod;
            const repliesHtml = hasReplies
              ? `<div class="threads-replies-wrapper" id="repliesWrapper-${rev.id}">
                  <div class="threads-replies-inner">
                    <div class="threads-replies-list">
                      ${replies.map(rep => {
                        const isMyReply = currentUserId && rep.userId === currentUserId;
                        const canDeleteReply = isMyReply || isMod;
                        return `
                        <div class="threads-review threads-reply-item" data-reply-id="${rep.id}">
                          <div class="threads-reply-curve"></div>
                          <div class="threads-avatar-col clickable-profile" data-user-id="${rep.userId}">
                            ${renderAvatarElement(rep.avatarUrl, rep.author, true)}
                          </div>
                          <div class="threads-content-col">
                            <div class="threads-header">
                              <span class="threads-author clickable-profile" data-user-id="${rep.userId}">${escapeHtml(rep.author)}</span>
                              <span class="threads-meta">${escapeHtml(rep.meta)} · ${formatReviewDate(rep.createdAt)}</span>
                            </div>
                            <p class="threads-text">${escapeHtml(rep.text)}</p>
                            <div class="threads-actions threads-owner-actions" style="display:flex; gap:8px;">
                              ${isMyReply ? `<button type="button" class="threads-edit-btn threads-edit-reply-btn" data-reply-id="${rep.id}" data-review-id="${rev.id}" title="Редактировать">✎ Изменить</button>` : ''}
                              ${canDeleteReply ? `<button type="button" class="threads-delete-btn threads-delete-reply-btn" data-reply-id="${rep.id}" data-review-id="${rev.id}" title="Удалить">✕ Удалить</button>` : ''}
                              <button type="button" class="threads-delete-btn" onclick="window.openReportModal('reply', ${rep.id})" title="Пожаловаться" style="opacity:0.6;">Жалоба</button>
                            </div>
                            ${isMyReply ? `<div class="threads-edit-form" id="editReplyForm-${rep.id}" hidden>
                              <textarea class="article-reply-textarea" id="editReplyText-${rep.id}" rows="2">${escapeHtml(rep.text)}</textarea>
                              <div class="article-reply-actions">
                                <button type="button" class="auth-submit threads-edit-reply-save" data-reply-id="${rep.id}" data-review-id="${rev.id}">Сохранить</button>
                                <button type="button" class="article-reply-cancel threads-edit-reply-cancel" data-reply-id="${rep.id}">Отмена</button>
                              </div>
                            </div>` : ''}
                          </div>
                        </div>`;
                      }).join('')}
                    </div>
                  </div>
                </div>`
              : '';

            const replyForm = token ? `
              <div class="article-review-reply-form" id="replyForm-${rev.id}" hidden>
                <textarea class="article-reply-textarea" id="replyText-${rev.id}" rows="2" placeholder="Ответить пользователю ${escapeHtml(rev.author)}..."></textarea>
                <div class="article-reply-actions">
                  <button type="button" class="auth-submit article-reply-submit" data-review-id="${rev.id}">Отправить</button>
                  <button type="button" class="article-reply-cancel" data-review-id="${rev.id}">Отмена</button>
                </div>
              </div>` : '';

            const replyBtn = token ? `<button type="button" class="threads-reply-btn article-review-reply-btn" data-review-id="${rev.id}">Ответить</button>` : '';
            const toggleRepliesBtn = hasReplies ? `<button type="button" class="threads-toggle-replies-btn article-review-toggle-replies-btn" data-review-id="${rev.id}" data-count="${replies.length}">Посмотреть ответы (${replies.length}) <span class="threads-chevron">▾</span></button>` : '';
            const deleteReviewBtn = canDeleteReview ? `<button type="button" class="threads-delete-btn threads-delete-review-btn" data-review-id="${rev.id}" data-user-id="${rev.userId}" title="Удалить отзыв">✕ Удалить</button>` : '';
            const reportReviewBtn = `<button type="button" class="threads-delete-btn" onclick="window.openReportModal('review', ${rev.id})" title="Пожаловаться" style="opacity:0.6;">Жалоба</button>`;

            return `
              <div class="threads-review" id="review-${rev.id}">
                <div class="threads-avatar-col clickable-profile" data-user-id="${rev.userId}">
                  ${renderAvatarElement(rev.avatarUrl, rev.author)}
                  ${hasReplies ? '<div class="threads-line threads-line--has-replies"></div>' : ''}
                </div>
                <div class="threads-content-col">
                  <div class="threads-header">
                    <div class="threads-user-info">
                      <span class="threads-author clickable-profile" data-user-id="${rev.userId}">${escapeHtml(rev.author)}</span>
                      <span class="threads-meta">${escapeHtml(rev.meta)} · ${formatReviewDate(rev.createdAt)}</span>
                    </div>
                    ${renderStarRow(rev.value)}
                  </div>
                  <p class="threads-text">${escapeHtml(rev.text)}</p>
                  <div class="threads-actions" style="display:flex; gap:8px;">
                    ${replyBtn}
                    ${toggleRepliesBtn}
                    ${deleteReviewBtn}
                    ${reportReviewBtn}
                  </div>
                  ${replyForm}
                  ${repliesHtml}
                </div>
              </div>`;
          }).join('')
        : '<p class="article-reviews-empty">Отзывов пока нет — станьте первым.</p>'}`;
  };

  const wireReviewReplyHandlers = (articleId) => {
    const reviewsContainer = document.getElementById('articleReviews');
    if (!reviewsContainer) return;

    // Compute exact pixel height for each parent-to-replies vertical line
    const fixThreadLineHeights = () => {
      reviewsContainer.querySelectorAll('.threads-review:not(.threads-reply-item)').forEach(review => {
        const avatarCol = review.querySelector(':scope > .threads-avatar-col');
        if (!avatarCol) return;
        const wrapper = review.querySelector('.threads-replies-wrapper.is-open');
        if (!wrapper) {
          avatarCol.style.removeProperty('--line-h');
          return;
        }
        const lastReply = wrapper.querySelector('.threads-reply-item:last-child');
        if (!lastReply) {
          avatarCol.style.removeProperty('--line-h');
          return;
        }
        const avatar = avatarCol.querySelector('.threads-avatar');
        const curve = lastReply.querySelector('.threads-reply-curve');
        if (!avatar || !curve) return;
        const avatarBottom = avatar.getBoundingClientRect().bottom;
        const curveRect = curve.getBoundingClientRect();
        // Line should reach the vertical midpoint of the curve
        const lineH = Math.max(0, curveRect.top + curveRect.height * 0.5 - avatarBottom);
        avatarCol.style.setProperty('--line-h', lineH + 'px');
      });
    };

    // Run once on render, and again after the CSS grid transition completes
    requestAnimationFrame(fixThreadLineHeights);

    reviewsContainer.querySelectorAll('.article-review-toggle-replies-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const revId = btn.dataset.reviewId;
        const wrapper = document.getElementById(`repliesWrapper-${revId}`);
        if (!wrapper) return;
        const count = btn.dataset.count;
        const isOpen = wrapper.classList.toggle('is-open');
        btn.innerHTML = isOpen ? 'Скрыть ответы <span class="threads-chevron">▴</span>' : `Посмотреть ответы (${count}) <span class="threads-chevron">▾</span>`;
        // Recalculate after transition
        requestAnimationFrame(fixThreadLineHeights);
        setTimeout(fixThreadLineHeights, 400);
      });
    });

    reviewsContainer.querySelectorAll('.article-review-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const revId = btn.dataset.reviewId;
        const form = document.getElementById(`replyForm-${revId}`);
        if (form) {
          form.hidden = !form.hidden;
          if (!form.hidden) {
            const txt = document.getElementById(`replyText-${revId}`);
            if (txt) txt.focus();
          }
        }
      });
    });

    reviewsContainer.querySelectorAll('.article-reply-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const revId = btn.dataset.reviewId;
        const form = document.getElementById(`replyForm-${revId}`);
        if (form) form.hidden = true;
      });
    });

    reviewsContainer.querySelectorAll('.article-reply-submit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const revId = btn.dataset.reviewId;
        const txtEl = document.getElementById(`replyText-${revId}`);
        const text = txtEl ? txtEl.value.trim() : '';
        const token = localStorage.getItem('stepplify_token');

        if (!token || !text) return;
        btn.disabled = true;
        btn.textContent = 'Отправка...';

        try {
          const res = await fetch(`${API_URL}/articles/${articleId}/reviews/${revId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Ошибка отправки ответа');
          applyRatingResponse(articleId, data);
        } catch (err) {
          console.error('Reply submit failed:', err);
          btn.disabled = false;
          btn.textContent = 'Отправить ответ';
        }
      });
    });
  };
  const wireReviewEditDeleteHandlers = (articleId) => {
    const reviewsContainer = document.getElementById('articleReviews');
    if (!reviewsContainer) return;
    const token = localStorage.getItem('stepplify_token');
    if (!token) return;

    // Delete review (whole rating + text + all replies)
    reviewsContainer.querySelectorAll('.threads-delete-review-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить этот отзыв и все ответы к нему?')) return;
        const targetUserId = btn.dataset.userId;
        const query = targetUserId ? `?userId=${targetUserId}` : '';
        btn.disabled = true;
        btn.textContent = 'Удаляю...';
        try {
          const res = await fetch(`${API_URL}/articles/${articleId}/rate${query}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Ошибка удаления отзыва');
          applyRatingResponse(articleId, data);
        } catch (err) {
          console.error('Delete review failed:', err);
          btn.disabled = false;
          btn.textContent = '✕ Удалить';
        }
      });
    });

    // Delete reply
    reviewsContainer.querySelectorAll('.threads-delete-reply-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить ваш комментарий?')) return;
        const replyId = btn.dataset.replyId;
        btn.disabled = true;
        btn.textContent = 'Удаляю...';
        try {
          const res = await fetch(`${API_URL}/articles/${articleId}/replies/${replyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Ошибка удаления ответа');
          applyRatingResponse(articleId, data);
        } catch (err) {
          console.error('Delete reply failed:', err);
          btn.disabled = false;
          btn.textContent = '✕ Удалить';
        }
      });
    });

    // Toggle edit form for reply
    reviewsContainer.querySelectorAll('.threads-edit-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const replyId = btn.dataset.replyId;
        const form = document.getElementById(`editReplyForm-${replyId}`);
        if (form) {
          form.hidden = !form.hidden;
          if (!form.hidden) {
            const txt = document.getElementById(`editReplyText-${replyId}`);
            if (txt) txt.focus();
          }
        }
      });
    });

    // Cancel edit reply
    reviewsContainer.querySelectorAll('.threads-edit-reply-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const replyId = btn.dataset.replyId;
        const form = document.getElementById(`editReplyForm-${replyId}`);
        if (form) form.hidden = true;
      });
    });

    // Save edited reply
    reviewsContainer.querySelectorAll('.threads-edit-reply-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const replyId = btn.dataset.replyId;
        const txtEl = document.getElementById(`editReplyText-${replyId}`);
        const text = txtEl ? txtEl.value.trim() : '';
        if (!text) return;
        btn.disabled = true;
        btn.textContent = 'Сохраняю...';
        try {
          const res = await fetch(`${API_URL}/articles/${articleId}/replies/${replyId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Ошибка редактирования ответа');
          applyRatingResponse(articleId, data);
        } catch (err) {
          console.error('Edit reply failed:', err);
          btn.disabled = false;
          btn.textContent = 'Сохранить';
        }
      });
    });
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
    wireReviewReplyHandlers(articleId);
    wireReviewEditDeleteHandlers(articleId);
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

  const renderFavoriteButtonContent = (isFav) => `
    <svg class="fav-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>${isFav ? 'В избранном' : 'В избранное'}</span>`;

  const renderArticleReader = (a) => {
    const images = Array.isArray(a.images) ? a.images : [];
    const gallery = images.length
      ? `<div class="article-reader-gallery">${images.map((src) => `<img src="${src}" alt="" loading="lazy" />`).join('')}</div>`
      : '';
    const metaLine = [a.meta, a.region, a.locationName].filter(Boolean).join(' · ');
    const cachedUser = JSON.parse(localStorage.getItem('stepplify_user') || 'null');
    const isOwner = !!cachedUser && (cachedUser.id === a.authorId || cachedUser.role === 'moderator' || cachedUser.role === 'admin');
    const isMod = !!cachedUser && (cachedUser.role === 'moderator' || cachedUser.role === 'admin');

    const ownerActions = isOwner
      ? `<div class="article-owner-actions">
           <button type="button" class="article-owner-btn" id="articleEditBtn">Редактировать</button>
           <button type="button" class="article-owner-btn article-owner-btn--danger" id="articleDeleteBtn">Удалить</button>
         </div>`
      : '';
    const favoriteBtn = `
      <button type="button" class="article-favorite-btn ${a.isFavorite ? 'is-favorite' : ''}" id="articleFavoriteBtn">
        ${renderFavoriteButtonContent(a.isFavorite)}
      </button>`;

    const locationQuery = (a.geoLat && a.geoLng)
      ? `${a.geoLng},${a.geoLat}`
      : (a.locationName || a.title);
    const gisUrl = `https://2gis.kz/search/${encodeURIComponent(locationQuery)}`;

    const gisBtn = `
      <a href="${gisUrl}" target="_blank" rel="noopener noreferrer" class="article-2gis-btn" title="Открыть в 2GIS">
        <img src="2gis.png" class="gis-icon-img" alt="2GIS" />
        <span>2GIS</span>
      </a>`;

    const reportBtn = `
      <button type="button" class="article-report-btn" onclick="window.openReportModal('article', ${a.id})" title="Пожаловаться">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        Жалоба
      </button>`;

    const actionsRow = `<div class="article-actions-row" style="display:flex; gap:10px; flex-wrap:wrap;">${favoriteBtn}${gisBtn}${reportBtn}${ownerActions}</div>`;

    const hasVerification = a.verificationScore !== null && a.verificationScore !== undefined;
    const scoreVal = hasVerification ? a.verificationScore : 0;
    const scoreText = hasVerification ? `${a.verificationScore}%` : '<span class="verification-unverified">Ещё не проверено модератором</span>';
    
    const verificationBadge = `
      <div class="article-verification-badge" id="articleVerificationBadge">
        <div class="verification-badge-header">
          <span class="verification-badge-label">Проверка достоверности:</span>
          <span class="verification-badge-value" id="verificationBadgeValue">${scoreText}</span>
        </div>
        <div class="verification-progress-track">
          <div class="verification-progress-fill" id="verificationBadgeFill" style="width: ${hasVerification ? scoreVal : 0}%"></div>
        </div>
      </div>`;

    const modVerificationBox = isMod
      ? `<div class="article-verification-mod-box">
           <div class="mod-box-header">
             <span class="mod-box-title">Оценка достоверности статьи (Модератор)</span>
             <span class="mod-box-val" id="verificationValDisplay">${scoreVal}%</span>
           </div>
           <div class="mod-box-controls">
             <input type="range" min="0" max="100" value="${scoreVal}" id="verificationRangeInput" class="verification-range-slider" />
             <button type="button" class="auth-submit verification-save-btn" id="saveVerificationBtn">Сохранить оценку</button>
           </div>
           <div class="verification-hint" id="verificationSaveHint"></div>
         </div>`
      : '';

    return `
      ${gallery}
      <h2 class="article-reader-title">${escapeHtml(a.title)}</h2>
      <div class="article-reader-byline">
        <span class="article-reader-author clickable-profile" data-user-id="${a.authorId}">${escapeHtml(a.author)}</span>
        <span class="article-reader-meta">${escapeHtml(metaLine)}</span>
      </div>
      ${actionsRow}
      ${verificationBadge}
      ${modVerificationBox}
      <div class="article-reader-stats">👁 <span id="articleViewsValue">${escapeHtml(String(a.viewsFormatted ?? a.views ?? 0))}</span></div>
      <div class="article-reader-body">${escapeHtml(a.content).replace(/\n/g, '<br>')}</div>
      <div class="article-reader-rating" id="articleReaderRating">${renderRatingBlock(a.rating)}</div>
      <div class="article-reviews" id="articleReviews">${renderReviewsList(a.reviews)}</div>`;
  };

  const wireFavoriteAction = (articleId, data) => {
    const favBtn = document.getElementById('articleFavoriteBtn');
    if (!favBtn) return;

    favBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('stepplify_token');
      if (!token) {
        const signInLink = document.getElementById('signInLink');
        signInLink?.click();
        return;
      }

      favBtn.disabled = true;
      favBtn.classList.remove('animating');
      // Trigger reflow to restart CSS animation if clicked rapidly
      void favBtn.offsetWidth;
      favBtn.classList.add('animating');

      try {
        const res = await fetch(`${API_URL}/articles/${articleId}/favorite`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Ошибка');

        favBtn.classList.toggle('is-favorite', resData.isFavorite);
        favBtn.innerHTML = renderFavoriteButtonContent(resData.isFavorite);
        data.isFavorite = resData.isFavorite;

        if (window.loadFavoritesData) window.loadFavoritesData();
      } catch (err) {
        alert(err.message);
      } finally {
        favBtn.disabled = false;
        setTimeout(() => favBtn.classList.remove('animating'), 450);
      }
    });
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
        deleteBtn.textContent = 'Удалить';
      }
    });
  };

  const wireVerificationAction = (articleId) => {
    const rangeInput = document.getElementById('verificationRangeInput');
    const valDisplay = document.getElementById('verificationValDisplay');
    const saveBtn = document.getElementById('saveVerificationBtn');
    const hint = document.getElementById('verificationSaveHint');
    const badgeVal = document.getElementById('verificationBadgeValue');
    const badgeFill = document.getElementById('verificationBadgeFill');

    if (!rangeInput || !saveBtn) return;

    rangeInput.addEventListener('input', () => {
      if (valDisplay) valDisplay.textContent = `${rangeInput.value}%`;
    });

    saveBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('stepplify_token');
      if (!token) return;
      const score = parseInt(rangeInput.value);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохраняю...';
      if (hint) hint.textContent = '';

      try {
        const res = await fetch(`${API_URL}/articles/${articleId}/verification`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ score })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка при сохранении');

        if (hint) {
          hint.style.color = '#4ade80';
          hint.textContent = '✓ Оценка достоверности сохранена!';
        }
        if (badgeVal) badgeVal.textContent = `${score}%`;
        if (badgeFill) badgeFill.style.width = `${score}%`;
      } catch (err) {
        console.error('Verification update failed:', err);
        if (hint) {
          hint.style.color = '#ef4444';
          hint.textContent = err.message;
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить оценку';
      }
    });
  };

  window.openArticleModal = async (id, highlightType = null, highlightId = null) => {
    if (!articleOverlay || !articleReader || !id) return;
    articleOpenedAt = Date.now();
    articleReader.innerHTML = '<div class="article-reader-loading">Загрузка статьи...</div>';
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
      wireReviewReplyHandlers(id);
      wireReviewEditDeleteHandlers(id);
      wireFavoriteAction(id, data);
      wireOwnerActions(id, data);
      wireVerificationAction(id);
      recordArticleView(data);

      if (highlightType && highlightId) {
        setTimeout(() => {
          let targetEl = null;
          if (highlightType === 'review') {
            targetEl = document.getElementById(`review-${highlightId}`);
          } else if (highlightType === 'reply') {
            targetEl = document.querySelector(`[data-reply-id="${highlightId}"]`);
            if (targetEl) {
              const wrapper = targetEl.closest('.threads-replies-wrapper');
              if (wrapper && !wrapper.classList.contains('is-open')) {
                const revId = wrapper.id.replace('repliesWrapper-', '');
                const btn = document.querySelector(`.article-review-toggle-replies-btn[data-review-id="${revId}"]`);
                if (btn) btn.click();
              }
            }
          }

          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('highlight-flash');
            setTimeout(() => {
              targetEl.classList.remove('highlight-flash');
            }, 2000);
          }
        }, 300); // Allow modal animation to settle
      }

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

  // ============ Top-3 Monthly Modal ============
  // Not every page has a "Топ-3 месяца" trigger — guarded so pages
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
        const res = await fetch(`${API_URL}/leaderboard/monthly`);
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
              <div class="top10-weekly">+${u.monthlyPoints} <span>за месяц</span></div>
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

  // ============ Public Profile Modal ============
  const renderPublicUserProfile = (container, u) => {
    const metaLine = [u.school, u.grade ? `${u.grade} класс` : '', u.region].filter(Boolean).join(' · ');
    const articles = Array.isArray(u.articles) ? u.articles : [];

    let friendBtnHtml = '';
    if (u.friendStatus === 'none') {
      friendBtnHtml = `<button type="button" class="auth-submit pub-profile-friend-btn" data-action="add" data-user-id="${u.id}">➕ Добавить в друзья</button>`;
    } else if (u.friendStatus === 'pending_outgoing') {
      friendBtnHtml = `<button type="button" class="btn btn-secondary pub-profile-friend-btn" disabled>⏳ Заявка отправлена</button>`;
    } else if (u.friendStatus === 'pending_incoming') {
      friendBtnHtml = `<button type="button" class="auth-submit pub-profile-friend-btn" data-action="accept" data-friendship-id="${u.friendshipId}">✔ Принять заявку</button>`;
    } else if (u.friendStatus === 'friends') {
      friendBtnHtml = `<button type="button" class="btn btn-secondary pub-profile-friend-btn" data-action="remove" data-user-id="${u.id}">👥 В друзьях (Удалить)</button>`;
    }

    const articlesHtml = articles.length
      ? articles.map(art => `
          <div class="pub-profile-article-item" data-article-id="${art.id}">
            <div class="pub-profile-article-info">
              <span class="pub-profile-article-category">${escapeHtml(art.category)}</span>
              <h4 class="pub-profile-article-title">${escapeHtml(art.title)}</h4>
              <span class="pub-profile-article-meta">👁 ${art.viewsCount || 0} просмотров</span>
            </div>
          </div>
        `).join('')
      : '<p class="pub-profile-empty">У пользователя пока нет публикаций.</p>';

    const modBadge = u.role === 'moderator' || u.role === 'admin'
      ? '<span class="pub-profile-role-badge">Модератор</span>'
      : '';

    container.innerHTML = `
      <div class="pub-profile-header">
        <div class="pub-profile-avatar-wrap">
          ${renderAvatarElement(u.avatarUrl, u.fullName)}
        </div>
        <h3 class="pub-profile-name">${escapeHtml(u.fullName)} ${modBadge}</h3>
        <p class="pub-profile-meta">${escapeHtml(metaLine)}</p>
        
        <div class="pub-profile-stats">
          <div class="pub-stat-card">
            <span class="pub-stat-val">⭐ ${u.points || 0}</span>
            <span class="pub-stat-lbl">Баллы</span>
          </div>
          <div class="pub-stat-card">
            <span class="pub-stat-val">🏆 ${u.level || 1}</span>
            <span class="pub-stat-lbl">Уровень</span>
          </div>
          <div class="pub-stat-card">
            <span class="pub-stat-val">📝 ${u.articlesCount || 0}</span>
            <span class="pub-stat-lbl">Статьи</span>
          </div>
        </div>

        ${(() => {
          let modActionHtml = '';
          const loggedUserStr = localStorage.getItem('stepplify_user');
          const loggedUser = loggedUserStr ? JSON.parse(loggedUserStr) : null;
          
          if (u.role === 'moderator' || u.role === 'admin') {
            const canRevoke = loggedUser && (loggedUser.role === 'admin' || loggedUser.role === 'moderator') && loggedUser.id !== u.id;
            modActionHtml = `<div style="text-align:center; padding:12px; border-radius:14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); font-weight:600; font-size:13px; display:flex; flex-direction:column; gap:8px;">
              <div>Пользователь — модератор</div>
              ${canRevoke ? `<button type="button" class="btn btn-secondary" style="padding:6px; font-size:12px; width:100%; box-shadow:none;" onclick="this.innerHTML='Загрузка...'; window.revokeModRights(${u.id})">Снять права</button>` : ''}
            </div>`;
          } else if (loggedUser && (loggedUser.role === 'moderator' || loggedUser.role === 'admin') && loggedUser.id !== u.id) {
            modActionHtml = `<button type="button" class="btn btn-primary pub-profile-mod-btn" style="width:100%; box-shadow:none;" onclick="this.innerHTML='Загрузка...'; window.grantModRights(${u.id})">Выдать права модератора</button>`;
          }
          
          if (friendBtnHtml || modActionHtml) {
            return `<div class="pub-profile-actions" style="display:flex; flex-direction:column; gap:10px;">${friendBtnHtml}${modActionHtml}</div>`;
          }
          return '';
        })()}
      </div>

      <div class="pub-profile-articles-section">
        <h4 class="pub-profile-section-title">Публикации автора (${articles.length})</h4>
        <div class="pub-profile-articles-list">
          ${articlesHtml}
        </div>
      </div>
    `;

    // Wire friend button actions
    const friendBtn = container.querySelector('.pub-profile-friend-btn');
    if (friendBtn) {
      friendBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('stepplify_token');
        if (!token) {
          document.getElementById('signInLink')?.click();
          return;
        }
        const action = friendBtn.dataset.action;
        friendBtn.disabled = true;

        try {
          if (action === 'add') {
            const res = await fetch(`${API_URL}/friends/request/${u.id}`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка');
            friendBtn.textContent = '⏳ Заявка отправлена';
            friendBtn.className = 'btn btn-secondary pub-profile-friend-btn';
            friendBtn.dataset.action = '';
          } else if (action === 'accept') {
            const res = await fetch(`${API_URL}/friends/${friendBtn.dataset.friendshipId}/respond`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ action: 'accept' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка');
            friendBtn.textContent = '👥 В друзьях';
            friendBtn.className = 'btn btn-secondary pub-profile-friend-btn';
          } else if (action === 'remove') {
            if (!confirm('Удалить из друзей?')) return;
            const res = await fetch(`${API_URL}/friends/${u.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка');
            friendBtn.textContent = '➕ Добавить в друзья';
            friendBtn.className = 'auth-submit pub-profile-friend-btn';
            friendBtn.dataset.action = 'add';
          }
        } catch (err) {
          alert(err.message);
        } finally {
          friendBtn.disabled = false;
        }
      });
    }

    // Wire clicking on an article item to open it
    container.querySelectorAll('.pub-profile-article-item').forEach(item => {
      item.addEventListener('click', () => {
        const artId = item.dataset.articleId;
        document.getElementById('publicProfileOverlay')?.classList.remove('open');
        window.openArticleModal?.(artId);
      });
    });
  };

  window.openPublicProfileModal = async (userId) => {
    if (!userId) return;

    let overlay = document.getElementById('publicProfileOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'publicProfileOverlay';
      overlay.className = 'auth-overlay';
      overlay.innerHTML = `
        <div class="auth-modal profile-modal public-profile-modal" role="dialog">
          <button type="button" class="auth-close" id="publicProfileClose">&times;</button>
          <div id="publicProfileContent">
            <div class="article-reader-loading">Загружаем профиль...</div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#publicProfileClose').addEventListener('click', () => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    }

    const contentEl = overlay.querySelector('#publicProfileContent');
    contentEl.innerHTML = '<div class="article-reader-loading">Загружаем профиль...</div>';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

    const token = localStorage.getItem('stepplify_token');
    try {
      const res = await fetch(`${API_URL}/users/by-id/${userId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const u = await res.json();
      if (!res.ok) throw new Error(u.error || 'Не удалось загрузить профиль.');

      renderPublicUserProfile(contentEl, u);
    } catch (err) {
      contentEl.innerHTML = `<div class="article-reader-loading" style="color: #ef4444;">${escapeHtml(err.message)}</div>`;
    }
  };

  // Document click delegation for opening public profiles
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.clickable-profile');
    if (trigger) {
      const userId = trigger.dataset.userId;
      if (userId) {
        window.openPublicProfileModal?.(userId);
      }
    }
  });

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
  const profileTabFavorites = document.getElementById('profileTabFavorites');
  const profileTabFriends  = document.getElementById('profileTabFriends');
  const profileTabSupport  = document.getElementById('profileTabSupport');
  const profilePanelInfo   = document.getElementById('profilePanelInfo');
  const profilePanelFavorites = document.getElementById('profilePanelFavorites');
  const profilePanelFriends = document.getElementById('profilePanelFriends');
  const profilePanelSupport = document.getElementById('profilePanelSupport');
  const profileSupportQuickBtn = document.getElementById('profileSupportQuickBtn');
  const profileSupportForm = document.getElementById('profileSupportForm');
  const profileFriendsBadge = document.getElementById('profileFriendsBadge');
  const profileFavoritesList = document.getElementById('profileFavoritesList');
  const profileFavoritesCount = document.getElementById('profileFavoritesCount');

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
      const isFav = tab === 'favorites';
      const isFriends = tab === 'friends';
      const isSupport = tab === 'support';
      profileTabInfo?.classList.toggle('active', isInfo);
      profileTabFavorites?.classList.toggle('active', isFav);
      profileTabFriends?.classList.toggle('active', isFriends);
      profileTabSupport?.classList.toggle('active', isSupport);
      if (profilePanelInfo) profilePanelInfo.hidden = !isInfo;
      if (profilePanelFavorites) profilePanelFavorites.hidden = !isFav;
      if (profilePanelFriends) profilePanelFriends.hidden = !isFriends;
      if (profilePanelSupport) profilePanelSupport.hidden = !isSupport;
      if (isFav) loadFavoritesData();
      if (isFriends) loadFriendsData();
    };
    profileTabInfo?.addEventListener('click', () => switchProfileTab('info'));
    profileTabFavorites?.addEventListener('click', () => switchProfileTab('favorites'));
    profileTabFriends?.addEventListener('click', () => switchProfileTab('friends'));
    profileTabSupport?.addEventListener('click', () => switchProfileTab('support'));
    document.querySelectorAll('.support-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.profile-field');
        if (parent) {
          parent.querySelectorAll('.support-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const hiddenInput = parent.querySelector('#supportSubject');
          if (hiddenInput) hiddenInput.value = btn.dataset.value || 'Вопрос';
        }
      });
    });

    profileSupportForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = document.getElementById('supportSubject')?.value.trim();
      const message = document.getElementById('supportMessage')?.value.trim();
      const hint = document.getElementById('supportSendHint');
      const btn = document.getElementById('supportSendBtn');
      if (!subject || !message) return;
      if (btn) btn.disabled = true;

      try {
        const token = localStorage.getItem('stepplify_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/support`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ subject, message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка при отправке обращения');

        if (hint) {
          hint.textContent = 'Обращение отправлено! Мы ответим вам в ближайшее время.';
          hint.className = 'profile-save-hint is-success';
        }
        if (profileSupportForm) profileSupportForm.reset();
      } catch (err) {
        if (hint) {
          hint.textContent = err.message || 'Ошибка при отправке обращения';
          hint.className = 'profile-save-hint is-error';
        }
      } finally {
        setTimeout(() => {
          if (btn) btn.disabled = false;
          if (hint) {
            hint.textContent = '';
            hint.className = 'profile-save-hint';
          }
        }, 4000);
      }
    });

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
        <div class="friend-row-avatar clickable-profile" data-user-id="${user.id}">${user.avatarUrl ? `<img src="${resolveAvatarUrl(user.avatarUrl)}" alt="" />` : `<span>${getInitials(user.fullName)}</span>`}</div>
        <div class="friend-row-info clickable-profile" data-user-id="${user.id}">
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

    const renderFavoritesPanel = (favorites) => {
      if (profileFavoritesCount) profileFavoritesCount.textContent = String(favorites.length);
      if (!profileFavoritesList) return;
      if (!favorites.length) {
        profileFavoritesList.innerHTML = '<div class="profile-articles-empty">У вас пока нет избранных статей.</div>';
        return;
      }
      profileFavoritesList.innerHTML = favorites.map((a) => `
        <button type="button" class="profile-article-row" data-article-id="${a.id}">
          <div class="profile-article-info">
            <div class="profile-article-title">${escapeHtml(a.title)}</div>
            <div class="profile-article-meta">${escapeHtml(a.category)}${a.locationName ? ' · ' + escapeHtml(a.locationName) : ''}</div>
          </div>
          <div class="profile-article-views">👁 ${a.viewsCount ?? 0}</div>
        </button>
      `).join('');
      profileFavoritesList.querySelectorAll('.profile-article-row').forEach((row) => {
        row.addEventListener('click', () => {
          closeProfileModal();
          window.openArticleModal?.(row.dataset.articleId);
        });
      });
    };

    const loadFavoritesData = async () => {
      const token = localStorage.getItem('stepplify_token');
      if (!token) return;
      if (profileFavoritesList) {
        profileFavoritesList.innerHTML = '<div class="top10-loading">Загружаем избранное...</div>';
      }
      try {
        const res = await fetch(`${API_URL}/favorites`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки избранного');
        renderFavoritesPanel(data);
      } catch (err) {
        if (profileFavoritesList) {
          profileFavoritesList.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
        }
      }
    };
    window.loadFavoritesData = loadFavoritesData;

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
      setSelectValuePreservingUnknown(profileRegion, cachedUser.region);
      profilePoints.textContent = cachedUser.points ?? '—';
      profileSaveBtn.disabled = true;
      profileSaveHint.textContent = '';
      profileSaveHint.className = 'profile-save-hint';
      profileArticlesList.innerHTML = '<div class="top10-loading">Загружаем статьи...</div>';
      friendsList.innerHTML = '<div class="friends-loading">Загружаем друзей...</div>';
      if (profileFavoritesList) profileFavoritesList.innerHTML = '<div class="top10-loading">Загружаем избранное...</div>';

      loadFriendsData();
      loadFavoritesData();

      try {
        const res = await fetch(`${API_URL}/users/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            closeProfileModal();
            handleSessionExpired();
            return;
          }
          throw new Error(data.error || 'Ошибка загрузки профиля');
        }

        renderAvatarInto(profileAvatarEl, data);
        profileName.value = data.fullName;
        profileLevelBadge.textContent = levelTitle(data.level);
        profileSchool.value = data.school;
        profileGrade.value = data.grade;
        setSelectValuePreservingUnknown(profileRegion, data.region);
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

  // ============ Scroll-entry reveal ============
  // Section headings ease up into place as their section arrives,
  // rather than the whole thing appearing fully formed the instant the
  // seam above it scrolls past. The hidden pre-state is added here, not
  // in the stylesheet, so a visitor without JS never ends up with
  // permanently invisible headings; reduced motion skips it entirely.
  const revealTargets = document.querySelectorAll('.recent-title, .recent-sub');
  if (revealTargets.length
      && 'IntersectionObserver' in window
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealTargets.forEach((el, i) => {
      el.classList.add('reveal-up');
      // Heading first, subtitle just behind it.
      el.style.transitionDelay = `${i * 90}ms`;
    });
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  // One-shot highlight along the yurt panel's leading edge as it arrives
  // over the hero — the join is a crisp overlap now, with no fade
  // smeared over the video, so this is what marks the handover.
  const yurtEdge = document.getElementById('yurtEdge');
  if (yurtEdge
      && 'IntersectionObserver' in window
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const edgeObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      yurtEdge.classList.add('is-lit');
      edgeObserver.disconnect();
    }, { rootMargin: '0px 0px -15% 0px' });
    edgeObserver.observe(yurtEdge);
  }

  // ============ Nav pill over light sections ============
  // The pill is glass over the video — white text with shadows — and
  // switches to the .is-light treatment (see styles.css) over the cream
  // yurt panel, where that white-on-white is unreadable.
  //
  // Which one it needs depends on what is under the pill RIGHT NOW, not
  // on how far down the page we have got: keying this off "the hero has
  // scrolled away" left it light for the rest of the page, including the
  // recent-articles and winners sections, where the dark video is back
  // behind it and white-on-white returned. So test the light sections
  // themselves against the band the pill occupies. Pages without one
  // (catalog, map — dark all the way down) simply never flip.
  const topbarEl = document.querySelector('.topbar');
  const litSections = Array.from(document.querySelectorAll('.yurt-section'));
  if (topbarEl && litSections.length) {
    const NAV_BAND = 96; // the pill's footprint down from the viewport top
    const syncTopbar = () => {
      const overLight = litSections.some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= NAV_BAND && r.bottom >= 0;
      });
      topbarEl.classList.toggle('is-light', overLight);
    };
    let navTicking = false;
    const onNavScroll = () => {
      if (navTicking) return;
      navTicking = true;
      requestAnimationFrame(() => { syncTopbar(); navTicking = false; });
    };
    window.addEventListener('scroll', onNavScroll, { passive: true });
    window.addEventListener('resize', onNavScroll, { passive: true });
    syncTopbar();
  }

  // ============ Rotating-yurt facts section (scroll-scrubbed) ============
  // Left half of the section is a yurt rendered from a tiny 3D model —
  // a cylinder (the wall) plus a dome of revolution (the roof) — that
  // gets re-projected at whatever angle the scroll position works out
  // to, so scrolling spins it on its axis. Right half cross-fades to
  // the next fact every 1/6 of the way through.
  //
  // See the .yurt-section comment in styles.css for the progressive
  // enhancement contract this leans on: index.html already ships the
  // finished, readable, unpinned state (still yurt + all six facts), so
  // anything this block fails to do degrades to that rather than to an
  // empty section or a giant blank runway.
  (() => {
    const section = document.getElementById('yurtSection');
    const svgBody = document.getElementById('yurtBody');
    const factEls = Array.from(document.querySelectorAll('#yurtFacts .yurt-fact'));
    const railEls = Array.from(document.querySelectorAll('#yurtRail i'));
    const countEl = document.getElementById('yurtCount');
    const hintEl = document.getElementById('yurtHint');
    if (!section || !svgBody || !factEls.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // ---- The model ----
    // A yurt is (very nearly) a surface of revolution, which makes the
    // projection cheap enough to redo every frame without any 3D
    // library: a point is just (angle around the axis, height above the
    // ground), and since we're looking from slightly above, its screen
    // position is x = sin(angle) and y = height + cos(angle) * squash.
    // The near side of the yurt is wherever cos(angle) > 0.
    //
    // These numbers are duplicated in the hand-written still yurt in
    // index.html (the no-JS state) — keep the two in sync.
    const CX = 260;         // the yurt's axis, in viewBox units
    const BASE_Y = 336;     // where the wall meets the ground
    const WALL_TOP = 210;   // top of the wall
    const APEX_Y = 104;     // centre of the crown ring (shanyrak)
    const R = 175;          // wall radius
    const EAVE_R = 182;     // roof edge — overhangs the wall a little
    const TOP_R = 48;       // crown radius
    const K = 0.3;          // ellipse squash — i.e. how high we look from
    const DOME_H = WALL_TOP - APEX_Y;
    const BAND_TOP = 222;   // woven belt (baskur) around the wall
    const BAND_BOTTOM = 246;
    // The belt's ornaments: the koshkar-muyiz artwork itself instead of
    // the plain diamonds this used to draw. Points at the keyed-out copy
    // — the original ornament-gold.png is gold on FULLY OPAQUE white, so
    // used directly every motif reads as a white box on the maroon belt.
    const MOTIF_HREF = 'assets/ornament-gold-alpha.png';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';
    // 20 x 55 units ~= the wall's 1100-unit circumference, so the band
    // meets itself all the way round rather than sitting as medallions.
    const MOTIF_W = 55;
    const MOTIF_H = 22;
    const DOOR_TOP = 264;   // wall height the door reaches
    const DOOR_HALF = 0.3;  // half the door's angular width, in radians
    // The felt door-curtain (kiiz esik), rolled up and tied above the
    // doorway. Slightly wider than the door, as it overhangs it, and
    // thick enough to be a bundle of rolled felt rather than a batten —
    // at the old 16 units it read as a painted plank however it was
    // shaded. The top edge tucks a little under the ornament band, the
    // way the real thing hangs from the wall above the frame.
    const ROLL_TOP = 240;
    const ROLL_BOTTOM = 268;
    const ROLL_HALF = 0.345;

    // Roof profile: radius shrinks from the eave to the crown while the
    // height climbs fast at first then flattens out — the bent-uyk
    // silhouette, rather than a plain cone. Deliberately shallow: a yurt
    // roof is barely a third of the whole height, and anything taller
    // starts reading as an egg.
    const domeR = (t) => EAVE_R - (EAVE_R - TOP_R) * Math.pow(t, 1.25);
    const domeY = (t) => WALL_TOP - DOME_H * Math.sin((t * Math.PI) / 2);
    const wallX = (a) => CX + R * Math.sin(a);
    const wallY = (a, h) => h + R * K * Math.cos(a);

    // Counts, not positions: everything below is generated by walking
    // these evenly around the yurt and letting the projection bunch them
    // up towards the silhouette. That bunching is what actually reads as
    // "turning" — a fixed picture with a spin transform would not.
    const RIBS = 26;        // roof poles (uyk) fanning out of the crown
    const SEAMS = 22;       // felt seams down the wall
    const MOTIFS = 20;      // ornaments repeated along the belt
    const CROWN_GRID = 3;         // bars each way inside the crown ring
    const CROWN_GRID_SPAN = 0.62; // outermost bar's offset, as a fraction
                                  // of the crown's radius
    // How high a full-length bar bows above the ring, as a fraction of
    // the crown's radius. Deliberately NOT K/2: at exactly that value a
    // bar running away from the viewer has its control point land on its
    // own start point — the arch cancels against the depth squash and
    // that whole set of bars draws as straight posts. Above K it would
    // poke past the ring's far edge instead.
    const CROWN_ARCH = 0.22;
    const RIB_STEPS = 10;   // samples along one roof pole

    const NS = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
      return n;
    };

    // Front half of the horizontal circle of radius r at height h, as an
    // arc that sags towards the viewer.
    const frontArc = (h, r = R) => `M${CX - r} ${h}A${r} ${r * K} 0 0 0 ${CX + r} ${h}`;
    // The rope trim at the eave and at the foot of the wall. It used to be
    // the same front arc with a thick round-capped stroke on it, and that
    // had two faults. The cap stuck out past the end of the arc into open
    // sky — at the eave, whose radius overhangs the wall's, that left a
    // red nub hanging off the silhouette that stayed put through the whole
    // rotation. And a stroke is flat, where this is a rope.
    //
    // So it is a filled band instead, swept from the left edge of the
    // circle round to the right, thickest at the front and tapering to
    // nothing at both ends — which is what the rope does as it turns away
    // behind the yurt, and leaves nothing at the edges to poke out.
    const trimPath = (h, r, width) => {
      const steps = 28;
      const at = (i) => -Math.PI / 2 + (Math.PI * i) / steps;
      const x = (a) => CX + r * Math.sin(a);
      const y = (a) => h + r * K * Math.cos(a);
      // Square-rooted so it holds most of its thickness across the front
      // and gives it all up in the last few degrees, rather than thinning
      // steadily the whole way round.
      const w = (a) => (width * Math.sqrt(Math.max(0, Math.cos(a)))) / 2;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const a = at(i);
        d += `${i ? 'L' : 'M'}${x(a).toFixed(1)} ${(y(a) - w(a)).toFixed(1)}`;
      }
      for (let i = steps; i >= 0; i--) {
        const a = at(i);
        d += `L${x(a).toFixed(1)} ${(y(a) + w(a)).toFixed(1)}`;
      }
      return `${d}Z`;
    };

    // The lit crest of that rope: the same sweep, riding the upper half of
    // the band. One highlight along the top is what turns a filled bar
    // into something round.
    const trimCrestPath = (h, r, width) => {
      const steps = 28;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / steps;
        const w = (width * Math.sqrt(Math.max(0, Math.cos(a)))) / 2;
        d += `${i ? 'L' : 'M'}${(CX + r * Math.sin(a)).toFixed(1)} ${(h + r * K * Math.cos(a) - w * 0.42).toFixed(1)}`;
      }
      return d;
    };

    const bandOf = (top, bottom) =>
      `${frontArc(top)}L${CX + R} ${bottom}A${R} ${R * K} 0 0 1 ${CX - R} ${bottom}Z`;

    const ribPath = (a) => {
      let d = '';
      for (let i = 0; i <= RIB_STEPS; i++) {
        const t = i / RIB_STEPS;
        const r = domeR(t);
        d += `${i ? 'L' : 'M'}${(CX + r * Math.sin(a)).toFixed(1)} ${(domeY(t) + r * K * Math.cos(a)).toFixed(1)}`;
      }
      return d;
    };

    const seamPath = (a) =>
      `M${wallX(a).toFixed(1)} ${wallY(a, WALL_TOP).toFixed(1)}L${wallX(a).toFixed(1)} ${wallY(a, BASE_Y).toFixed(1)}`;

    // Anything laid on the wall wraps around it, so its edges follow the
    // cylinder rather than being a flat rectangle — sample the arc along
    // the bottom, then back along the top. Used for the door and for the
    // rolled curtain above it.
    const wallPanelPath = (a, half, topY, bottomY) => {
      const steps = 8;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const aa = a - half + (2 * half * i) / steps;
        d += `${i ? 'L' : 'M'}${wallX(aa).toFixed(1)} ${wallY(aa, bottomY).toFixed(1)}`;
      }
      for (let i = steps; i >= 0; i--) {
        const aa = a - half + (2 * half * i) / steps;
        d += `L${wallX(aa).toFixed(1)} ${wallY(aa, topY).toFixed(1)}`;
      }
      return `${d}Z`;
    };
    const doorPath = (a) => wallPanelPath(a, DOOR_HALF, DOOR_TOP, BASE_Y);
    // The roll is the one thing on the wall that isn't a flat panel: a
    // bundle has ends, and squared-off ones left it reading as a board
    // however it was shaded. Same sampled top and bottom edges as any wall
    // panel, but each end closes with a curve bulging past the edge, which
    // is the cylinder's cap seen almost side-on.
    const rollPath = (a) => {
      const steps = 8;
      const mid = (ROLL_TOP + ROLL_BOTTOM) / 2;
      const cap = 7; // how far each end bows out past the panel edge
      const at = (i) => a - ROLL_HALF + (2 * ROLL_HALF * i) / steps;
      let d = `M${wallX(at(0)).toFixed(1)} ${wallY(at(0), ROLL_TOP).toFixed(1)}`;
      for (let i = 1; i <= steps; i++) {
        d += `L${wallX(at(i)).toFixed(1)} ${wallY(at(i), ROLL_TOP).toFixed(1)}`;
      }
      const rx = wallX(at(steps));
      d += `Q${(rx + cap).toFixed(1)} ${wallY(at(steps), mid).toFixed(1)} ${rx.toFixed(1)} ${wallY(at(steps), ROLL_BOTTOM).toFixed(1)}`;
      for (let i = steps - 1; i >= 0; i--) {
        d += `L${wallX(at(i)).toFixed(1)} ${wallY(at(i), ROLL_BOTTOM).toFixed(1)}`;
      }
      const lx = wallX(at(0));
      d += `Q${(lx - cap).toFixed(1)} ${wallY(at(0), mid).toFixed(1)} ${lx.toFixed(1)} ${wallY(at(0), ROLL_TOP).toFixed(1)}`;
      return `${d}Z`;
    };
    // The rail across both leaves, at the height a yurt door's cross-piece
    // sits. Follows the wall like everything else laid on it.
    const doorRailPath = (a) => {
      const steps = 8;
      const y = DOOR_TOP + (BASE_Y - DOOR_TOP) * 0.42;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const aa = a - DOOR_HALF * 0.97 + (2 * DOOR_HALF * 0.97 * i) / steps;
        d += `${i ? 'L' : 'M'}${wallX(aa).toFixed(1)} ${wallY(aa, y).toFixed(1)}`;
      }
      return d;
    };

    // A ring pull on each leaf, just off the seam and hanging from the
    // rail. Closed loops rather than single arcs — an arc on its own came
    // out as a smile drawn on the door. Built from wall samples rather
    // than from a circle, since the surface it lies on is turning away
    // from the viewer and a true circle would sit flat on top of it.
    const doorPullsPath = (a) => {
      const y = DOOR_TOP + (BASE_Y - DOOR_TOP) * 0.42 + 2;
      const r = 0.034;  // angular half-width of a pull
      const drop = 9;   // how far it hangs below the rail
      let d = '';
      for (const side of [-1, 1]) {
        const c = a + side * DOOR_HALF * 0.34;
        for (let i = 0; i <= 8; i++) {
          const aa = c - r + (2 * r * i) / 8;
          d += `${i ? 'L' : 'M'}${wallX(aa).toFixed(1)} ${(wallY(aa, y) + Math.sin((i / 8) * Math.PI) * drop).toFixed(1)}`;
        }
        for (let i = 8; i >= 0; i--) {
          const aa = c - r + (2 * r * i) / 8;
          d += `L${wallX(aa).toFixed(1)} ${(wallY(aa, y) + Math.sin((i / 8) * Math.PI) * drop * 0.28).toFixed(1)}`;
        }
        d += 'Z';
      }
      return d;
    };

    // The two straps the rolled curtain is tied up with. The comment above
    // has always said it was tied; until these it simply wasn't, and the
    // roll read as a painted plank rather than as felt held up by anything.
    const rollTiesPath = (a) => {
      let d = '';
      for (const side of [-1, 1]) {
        const aa = a + side * ROLL_HALF * 0.52;
        const x = wallX(aa);
        // Starts up under the band the curtain hangs from and crosses the
        // bundle, stopping just inside its lower edge. It used to run on
        // past onto the door, where maroon strap over maroon door simply
        // disappeared — everything that has to read stays on the felt.
        d += `M${x.toFixed(1)} ${(wallY(aa, ROLL_TOP) - 5).toFixed(1)}`;
        d += `L${x.toFixed(1)} ${(wallY(aa, ROLL_BOTTOM) - 2).toFixed(1)}`;
      }
      return d;
    };

    // The knot on each strap, just under the bundle.
    const rollKnotsPath = (a) => {
      let d = '';
      for (const side of [-1, 1]) {
        const aa = a + side * ROLL_HALF * 0.52;
        const x = wallX(aa);
        const y = wallY(aa, ROLL_BOTTOM) - 4.5;
        d += `M${(x - 3.2).toFixed(1)} ${y.toFixed(1)}L${(x + 3.2).toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    };

    // Bands along the roll's length, inset from its outline. A cylinder
    // reads as round from its shading before it reads as round from its
    // outline, and the outline here can't help: the roll is a panel on a
    // wall, so its edges are the wall's curve, not the bundle's. Light
    // catches the upper third, the underside falls away.
    const rollBandPath = (a, from, to) => {
      const t = ROLL_BOTTOM - ROLL_TOP;
      return wallPanelPath(a, ROLL_HALF * 0.985, ROLL_TOP + t * from, ROLL_TOP + t * to);
    };
    const rollHighlightPath = (a) => rollBandPath(a, 0.08, 0.3);
    const rollShadePath = (a) => rollBandPath(a, 0.68, 0.97);

    // The spiral seam running the length of the bundle — the edge of the
    // felt where it finishes wrapping. This is the line that says "rolled"
    // rather than "solid".
    const rollCreasePath = (a) => {
      const steps = 8;
      const y = ROLL_TOP + (ROLL_BOTTOM - ROLL_TOP) * 0.46;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const aa = a - ROLL_HALF * 0.86 + (2 * ROLL_HALF * 0.86 * i) / steps;
        d += `${i ? 'L' : 'M'}${wallX(aa).toFixed(1)} ${wallY(aa, y).toFixed(1)}`;
      }
      return d;
    };

    // The coiled ends. Not drawn as discs: the roll wraps around the wall,
    // so its end faces point along the wall's tangent, and at the angle
    // the door is visible from they are nearly edge-on — a circle there
    // would be a sticker on the surface rather than the end of a bundle.
    // A short bowed line each side gives the coil's edge instead, which is
    // all that is left of the end face from the front.
    const rollCurlPath = (a) => {
      let d = '';
      for (const side of [-1, 1]) {
        const aa = a + side * ROLL_HALF * 0.9;
        const x = wallX(aa);
        const yTop = wallY(aa, ROLL_TOP + 4);
        const yBottom = wallY(aa, ROLL_BOTTOM - 4);
        d += `M${x.toFixed(1)} ${yTop.toFixed(1)}`;
        d += `Q${(x + side * 5).toFixed(1)} ${((yTop + yBottom) / 2).toFixed(1)} ${x.toFixed(1)} ${yBottom.toFixed(1)}`;
      }
      return d;
    };

    // Kuldreuish: two sets of parallel bars crossing each other, and
    // every bar ARCHED up out of the ring's plane — the crown is a
    // shallow dome of bent rods, not a flat grate. Laid out in the
    // crown's own plane and then rotated with the yurt: the projection
    // is affine, so a straight chord stays straight and only the arch
    // has to be drawn as a curve.
    const crownPath = (theta) => {
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const project = (p, q) => [
        CX + TOP_R * (p * ct + q * st),
        APEX_Y + TOP_R * K * (q * ct - p * st),
      ];
      let d = '';
      for (let i = 0; i < CROWN_GRID; i++) {
        const t = -CROWN_GRID_SPAN + (2 * CROWN_GRID_SPAN * i) / (CROWN_GRID - 1);
        const half = Math.sqrt(Math.max(0, 1 - t * t)); // chord ends on the rim
        // A quadratic passes through half its control point's offset, so
        // the control has to be lifted twice the arch height. Shorter
        // bars nearer the rim rise less, as bending one radius would.
        const lift = 2 * TOP_R * CROWN_ARCH * half;
        for (let axis = 0; axis < 2; axis++) {
          const [x1, y1] = axis ? project(t, -half) : project(-half, t);
          const [x2, y2] = axis ? project(t, half) : project(half, t);
          const [mx, my] = axis ? project(t, 0) : project(0, t);
          d += `M${x1.toFixed(1)} ${y1.toFixed(1)}`
            + `Q${mx.toFixed(1)} ${(my - lift).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        }
      }
      return d;
    };

    // ---- Build once, then only ever mutate attributes ----
    // Rebuilding ~70 nodes per scroll frame would be wasteful; the
    // element set never changes, only each one's path/opacity does.
    const ribEls = [];
    const seamEls = [];
    const motifEls = [];
    let doorEl = null;
    let doorSplitEl = null;
    let doorRailEl = null;
    let doorPullsEl = null;
    let rollTiesEl = null;
    let rollShadeEl = null;
    let rollHighlightEl = null;
    let rollCurlEl = null;
    let rollKnotsEl = null;
    let rollEl = null;
    let rollCreaseEl = null;
    let crownBarEl = null;

    const build = () => {
      svgBody.textContent = ''; // drop the hand-written no-JS yurt
      const frag = document.createDocumentFragment();

      frag.appendChild(node('ellipse', {
        cx: CX, cy: BASE_Y + 10, rx: R * 1.17, ry: R * K * 0.64, fill: 'url(#yurtShadowGrad)',
      }));
      const wallD = `${frontArc(WALL_TOP)}L${CX + R} ${BASE_Y}A${R} ${R * K} 0 0 1 ${CX - R} ${BASE_Y}Z`;
      frag.appendChild(node('path', { d: wallD, fill: 'url(#yurtWallGrad)' }));

      // The ornaments are the one thing on the wall not built from the
      // cylinder projection itself — they are rectangles laid on it — so
      // near the silhouette a corner can still reach a couple of units
      // past the wall's edge. Clipping them to the wall settles it for
      // every angle at once, and is what the wall would really do: it
      // occludes anything that carries on round the back.
      const wallClip = node('clipPath', { id: 'yurtWallClip' });
      wallClip.appendChild(node('path', { d: wallD }));
      frag.appendChild(wallClip);

      for (let i = 0; i < SEAMS; i++) {
        const el = node('path', { class: 'yurt-seam', d: '', opacity: 0 });
        seamEls.push(el);
        frag.appendChild(el);
      }

      frag.appendChild(node('path', { class: 'yurt-band', d: bandOf(BAND_TOP, BAND_BOTTOM) }));
      const motifLayer = node('g', { 'clip-path': 'url(#yurtWallClip)' });
      frag.appendChild(motifLayer);
      for (let i = 0; i < MOTIFS; i++) {
        // The shape is drawn around its own origin, so the horizontal
        // squash in render() foreshortens it about its middle, like
        // every other point on the wall.
        const el = node('image', {
          class: 'yurt-motif',
          x: -MOTIF_W / 2,
          y: -MOTIF_H / 2,
          width: MOTIF_W,
          height: MOTIF_H,
          preserveAspectRatio: 'none',
          opacity: 0,
        });
        el.setAttribute('href', MOTIF_HREF);
        // Older renderers still want the xlink form; harmless elsewhere.
        el.setAttributeNS(XLINK_NS, 'xlink:href', MOTIF_HREF);
        motifEls.push(el);
        motifLayer.appendChild(el);
      }

      doorEl = node('path', { class: 'yurt-door', d: '', opacity: 0 });
      frag.appendChild(doorEl);
      doorSplitEl = node('path', { class: 'yurt-door-split', d: '', opacity: 0 });
      frag.appendChild(doorSplitEl);
      doorRailEl = node('path', { class: 'yurt-door-rail', d: '', opacity: 0 });
      frag.appendChild(doorRailEl);
      doorPullsEl = node('path', { class: 'yurt-door-pull', d: '', opacity: 0 });
      frag.appendChild(doorPullsEl);
      rollEl = node('path', { class: 'yurt-roll', d: '', opacity: 0 });
      frag.appendChild(rollEl);
      rollShadeEl = node('path', { class: 'yurt-roll-shade', d: '', opacity: 0 });
      frag.appendChild(rollShadeEl);
      rollHighlightEl = node('path', { class: 'yurt-roll-hi', d: '', opacity: 0 });
      frag.appendChild(rollHighlightEl);
      rollCreaseEl = node('path', { class: 'yurt-roll-crease', d: '', opacity: 0 });
      frag.appendChild(rollCreaseEl);
      rollCurlEl = node('path', { class: 'yurt-roll-curl', d: '', opacity: 0 });
      frag.appendChild(rollCurlEl);
      rollTiesEl = node('path', { class: 'yurt-roll-tie', d: '', opacity: 0 });
      frag.appendChild(rollTiesEl);
      rollKnotsEl = node('path', { class: 'yurt-roll-knot', d: '', opacity: 0 });
      frag.appendChild(rollKnotsEl);
      frag.appendChild(node('path', { class: 'yurt-base', d: trimPath(BASE_Y, R, 5) }));
      frag.appendChild(node('path', { class: 'yurt-trim-crest', d: trimCrestPath(BASE_Y, R, 5) }));

      // Roof silhouette: up the left profile, over the crown, down the
      // right profile, closed along the front half of the eave.
      let dome = '';
      for (let i = 0; i <= RIB_STEPS; i++) {
        const t = i / RIB_STEPS;
        dome += `${i ? 'L' : 'M'}${(CX - domeR(t)).toFixed(1)} ${domeY(t).toFixed(1)}`;
      }
      dome += `A${TOP_R} ${TOP_R * K} 0 0 1 ${CX + TOP_R} ${APEX_Y}`;
      for (let i = RIB_STEPS; i >= 0; i--) {
        const t = i / RIB_STEPS;
        dome += `L${(CX + domeR(t)).toFixed(1)} ${domeY(t).toFixed(1)}`;
      }
      dome += `A${EAVE_R} ${EAVE_R * K} 0 0 1 ${CX - EAVE_R} ${WALL_TOP}Z`;
      frag.appendChild(node('path', { d: dome, fill: 'url(#yurtDomeGrad)' }));
      frag.appendChild(node('path', { class: 'yurt-eave', d: trimPath(WALL_TOP, EAVE_R, 5.5) }));
      frag.appendChild(node('path', { class: 'yurt-trim-crest', d: trimCrestPath(WALL_TOP, EAVE_R, 5.5) }));

      for (let i = 0; i < RIBS; i++) {
        const el = node('path', { class: 'yurt-rib', d: '', opacity: 0 });
        ribEls.push(el);
        frag.appendChild(el);
      }

      frag.appendChild(node('ellipse', { class: 'yurt-crown-fill', cx: CX, cy: APEX_Y, rx: TOP_R, ry: TOP_R * K }));
      crownBarEl = node('path', { class: 'yurt-crown-bar', d: crownPath(0) });
      frag.appendChild(crownBarEl);
      frag.appendChild(node('ellipse', { class: 'yurt-crown-rim', cx: CX, cy: APEX_Y, rx: TOP_R, ry: TOP_R * K }));
      frag.appendChild(node('ellipse', {
        class: 'yurt-crown-rim-inner',
        cx: CX,
        cy: APEX_Y,
        rx: TOP_R - 4.5,
        ry: (TOP_R - 4.5) * K,
      }));

      svgBody.appendChild(frag);
    };

    // Anything on the far side is hidden by the felt; anything close to
    // the silhouette fades out instead of blinking off there.
    const facing = (a, fade) => {
      const c = Math.cos(a);
      return c <= 0 ? 0 : Math.min(1, c / fade);
    };

    const render = (theta) => {
      for (let i = 0; i < SEAMS; i++) {
        const a = theta + (i * 2 * Math.PI) / SEAMS;
        const vis = facing(a, 0.45);
        seamEls[i].setAttribute('opacity', (vis * 0.3).toFixed(3));
        if (vis) seamEls[i].setAttribute('d', seamPath(a));
      }

      const bandMid = (BAND_TOP + BAND_BOTTOM) / 2;
      for (let i = 0; i < MOTIFS; i++) {
        const a = theta + (i * 2 * Math.PI) / MOTIFS;
        const vis = facing(a, 0.4);
        motifEls[i].setAttribute('opacity', (vis * 0.95).toFixed(3));
        if (!vis) continue;
        // Not just a horizontal squash: the belt runs along an ellipse,
        // so towards the silhouette it also tilts, and an ornament that
        // stays level pokes out above and below it. Mapping the motif's
        // own x-axis onto the belt's tangent — (cos a, -K sin a), the
        // derivative of the projection — squashes and tilts it in one
        // matrix, so every ornament lies along the belt however far
        // round it has turned.
        const c = Math.cos(a);
        const sn = Math.sin(a);
        motifEls[i].setAttribute(
          'transform',
          `matrix(${c.toFixed(4)} ${(-K * sn).toFixed(4)} 0 1 ${wallX(a).toFixed(1)} ${wallY(a, bandMid).toFixed(1)})`,
        );
      }

      const doorVis = facing(theta, 0.35);
      doorEl.setAttribute('opacity', doorVis.toFixed(3));
      doorSplitEl.setAttribute('opacity', (doorVis * 0.8).toFixed(3));
      rollEl.setAttribute('opacity', doorVis.toFixed(3));
      rollCreaseEl.setAttribute('opacity', (doorVis * 0.75).toFixed(3));
      doorRailEl.setAttribute('opacity', (doorVis * 0.85).toFixed(3));
      doorPullsEl.setAttribute('opacity', (doorVis * 0.9).toFixed(3));
      // Squared, unlike everything else here: the straps are maroon on
      // pale felt, so they hold their contrast long after the bundle
      // under them has faded out, and a linear fade left them hanging on
      // the wall as red sticks with nothing beneath them.
      rollTiesEl.setAttribute('opacity', (doorVis * doorVis * 0.9).toFixed(3));
      rollShadeEl.setAttribute('opacity', (doorVis * 0.9).toFixed(3));
      rollHighlightEl.setAttribute('opacity', (doorVis * 0.85).toFixed(3));
      rollCurlEl.setAttribute('opacity', (doorVis * 0.8).toFixed(3));
      rollKnotsEl.setAttribute('opacity', (doorVis * doorVis * 0.9).toFixed(3));
      if (doorVis) {
        doorEl.setAttribute('d', doorPath(theta));
        doorSplitEl.setAttribute(
          'd',
          `M${wallX(theta).toFixed(1)} ${wallY(theta, BASE_Y).toFixed(1)}L${wallX(theta).toFixed(1)} ${wallY(theta, DOOR_TOP).toFixed(1)}`,
        );
        doorRailEl.setAttribute('d', doorRailPath(theta));
        doorPullsEl.setAttribute('d', doorPullsPath(theta));
        rollEl.setAttribute('d', rollPath(theta));
        rollShadeEl.setAttribute('d', rollShadePath(theta));
        rollHighlightEl.setAttribute('d', rollHighlightPath(theta));
        rollCreaseEl.setAttribute('d', rollCreasePath(theta));
        rollCurlEl.setAttribute('d', rollCurlPath(theta));
        rollTiesEl.setAttribute('d', rollTiesPath(theta));
        rollKnotsEl.setAttribute('d', rollKnotsPath(theta));
      }

      for (let i = 0; i < RIBS; i++) {
        const a = theta + (i * 2 * Math.PI) / RIBS;
        const vis = facing(a, 0.4);
        ribEls[i].setAttribute('opacity', (vis * 0.5).toFixed(3));
        if (vis) ribEls[i].setAttribute('d', ribPath(a));
      }

      crownBarEl.setAttribute('d', crownPath(theta));
    };

    // ---- Ridges ----
    // Scroll drives the horizon as well as the yurt: each ridge slides
    // sideways at its own rate (nearer ones faster — plain parallax) and
    // rises and falls on a sine of the same scroll position. Giving each
    // layer a different phase is what turns five ridges sliding together
    // into swell rolling through them. Amplitudes are in viewBox units,
    // which the SVG maps to roughly one screen pixel each.
    const hillEls = Array.from(section.querySelectorAll('.yurt-hill'));
    const HILL_MOTION = [
      { slide: -20, lift: 6, phase: 0 },
      { slide: -40, lift: 8, phase: 0.6 },
      { slide: -66, lift: 10, phase: 1.2 },
      { slide: -96, lift: 12, phase: 1.8 },
      { slide: -132, lift: 14, phase: 2.4 },
    ];
    // The range is further off than any of them, so it barely moves —
    // that near-stillness against the sliding grass is the whole reason
    // it reads as distance. It doesn't rise and fall either: swell in a
    // mountain would look like an earthquake. The snow caps have to be
    // carried along with the peaks they sit on, hence the class rather
    // than a query for the ridges alone.
    const mtnFarEls = Array.from(section.querySelectorAll('.yurt-mountains .is-far'));
    const mtnNearEls = Array.from(section.querySelectorAll('.yurt-mountains .is-near'));
    const MTN_FAR_SLIDE = -7;
    const MTN_NEAR_SLIDE = -13;
    const WAVE_CYCLES = 2; // rises and falls twice over the whole section
    const HALO_TURNS = 0.55; // revolutions of the sun wheel, counter to the yurt

    // ---- Time of day ----
    // One pass down the section is one full day: morning at the first
    // fact, an evening in the middle of it, night, and morning again by
    // the last. Every colour that has to move with it is blended from the
    // same three palettes here, so the sky, the mountains, the grass and
    // the text can't drift out of step with each other. The stylesheet
    // carries each daylight value as its own var() fallback, which is
    // exactly what a visitor without JS - or with reduced motion, which
    // returns above - sees: a section frozen at midday.
    const PALETTES = {
      day: {
        '--sky-top':  [12, 70, 146],
        '--sky-mid':  [58, 130, 200],
        // The horizon keeps a paler band than the zenith in all three
        // palettes - the sky thinning towards the ground is what gives
        // the flat scene its depth, and it is also the half the facts sit
        // over, so it cannot go as deep without taking the type with it.
        '--sky-low':  [134, 189, 228],
        // Distance haze: the far range is lighter and bluer than the near
        // one, which is what separates them once both are silhouettes.
        '--mtn-far':        [158, 184, 208],
        '--mtn-far-shade':  [132, 162, 192],
        '--mtn-near':       [110, 143, 178],
        '--mtn-near-shade': [86, 118, 155],
        '--mtn-snow':       [240, 247, 253],
        '--mtn-snow-shade': [211, 226, 241],
        // Midday sun, kept off pure white so it still reads as a disc
        // against cloud rather than as a hole in the sky.
        '--sun':      [255, 226, 140],
        '--sun-edge': [255, 197, 94],
      },
      evening: {
        '--sky-top':  [46, 74, 125],
        '--sky-mid':  [219, 132, 104],
        '--sky-low':  [255, 200, 140],
        // Peaks catch the last of the light while the ground below has
        // already lost it: warm on the snow, cold and purple in the rock.
        '--mtn-far':        [150, 120, 150],
        '--mtn-far-shade':  [120, 92, 126],
        '--mtn-near':       [104, 80, 112],
        '--mtn-near-shade': [80, 59, 91],
        '--mtn-snow':       [250, 210, 194],
        '--mtn-snow-shade': [223, 170, 165],
        '--sun':      [255, 168, 92],
        '--sun-edge': [244, 118, 58],
      },
      night: {
        '--sky-top':  [7, 13, 36],
        '--sky-mid':  [16, 26, 56],
        '--sky-low':  [30, 43, 74],
        '--mtn-far':        [26, 35, 60],
        '--mtn-far-shade':  [20, 27, 50],
        '--mtn-near':       [17, 24, 45],
        '--mtn-near-shade': [12, 18, 37],
        // Moonlit rather than lit: bright enough to pick the peaks out of
        // the silhouette, dim enough that the caps aren't the first thing
        // the eye lands on in a dark frame.
        '--mtn-snow':       [70, 84, 118],
        '--mtn-snow-shade': [54, 66, 99],
        // Never seen — the sun is fully faded out well before here — but
        // every palette has to carry every key for the blend to work.
        '--sun':      [255, 168, 92],
        '--sun-edge': [244, 118, 58],
      },
    };

    // Where each state sits along the runway, and how long it holds. A
    // pair of stops on the same palette is a plateau: without them the
    // section is one continuous fade with no actual day, evening or night
    // in it, and the evening in particular would be a colour the scroll
    // passes through rather than a place it visits. Roughly a fact each:
    // day, evening, night, then dawn - which reuses the evening palette,
    // the same light running the other way - and back to day.
    const TIMELINE = [
      [0.00, 'day'],
      [0.23, 'day'],
      [0.26, 'evening'],
      [0.45, 'evening'],
      [0.48, 'night'],
      [0.68, 'night'],
      [0.71, 'evening'],
      [0.87, 'evening'],
      [0.90, 'day'],
      [1.00, 'day'],
    ];

    // The type is not in the palettes above, because it has to stay
    // legible the whole way through rather than merely end up the right
    // colour. Each of these carries a third, dusk stop between its
    // daylight and night values: the daytime greys were picked to sit on
    // white, and have nothing left on a sky that has gone dim. Leaning
    // them towards black first keeps them readable right up to the point
    // where the sky is dark enough for the swap to light. See renderSky.
    const INK_RAMPS = [
      // The dusk and night stops are deliberately pushed apart, hardest
      // on the body copy: the swap happens while the sky still has some
      // light in it, and the further each side is from that the better
      // the one frame it lands on reads. Measured either side of the
      // step, this is about as good as a two-state swap gets.
      ['--ink',      [16, 24, 34, 1],     [12, 18, 26, 1],    [237, 243, 251, 1]],
      // Daylight value is well darker than the grey this started as: that
      // one was picked to sit on cream, and every step the sky took
      // towards a real blue cost it contrast. At this depth of sky only
      // something this close to black still clears 4.5:1 - the hierarchy
      // between it and the headline above rides on size and weight now
      // rather than on tone.
      ['--ink-soft', [26, 33, 42, 1],     [14, 20, 28, 1],    [206, 217, 231, 1]],
      ['--ink-mute', [16, 24, 34, 0.72],  [12, 18, 26, 0.88], [226, 236, 248, 0.7]],
      ['--warm',     [250, 195, 80, 1],   [45, 35, 95, 1],    [253, 186, 116, 1]],
      ['--rail',     [250, 195, 80, 0.3], [45, 35, 95, 0.4],  [253, 186, 116, 0.35]],
    ];

    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    const smoothstep = (t) => t * t * (3 - 2 * t);
    const sharpstep = (t) => {
      const c = clamp01(t);
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    };
    const lerp = (a, b, t) => a + (b - a) * t;

    // Three-stage interpolation: day -> evening (dusk / brand red) -> night (warm amber gold)
    const applyRamps = (ramps, eveningFactor, nightFactor) => {
      ramps.forEach(([name, day, dusk, night]) => {
        let parts, a;
        if (nightFactor > 0) {
          const from = dusk || day;
          parts = [0, 1, 2].map((i) => Math.round(lerp(from[i], night[i], nightFactor)));
          a = lerp(from[3], night[3], nightFactor);
        } else if (eveningFactor > 0 && dusk) {
          parts = [0, 1, 2].map((i) => Math.round(lerp(day[i], dusk[i], eveningFactor)));
          a = lerp(day[3], dusk[3], eveningFactor);
        } else {
          parts = [day[0], day[1], day[2]];
          a = day[3];
        }
        section.style.setProperty(name, `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${typeof a === 'number' ? a.toFixed(3) : a})`);
      });
    };

    // Which two states the given point on the runway falls between, and
    // how far across. Eased sharply so each state transitions fast and crisp.
    const stateAt = (p) => {
      let i = 0;
      while (i < TIMELINE.length - 2 && p > TIMELINE[i + 1][0]) i++;
      const [pFrom, from] = TIMELINE[i];
      const [pTo, to] = TIMELINE[i + 1];
      const span = pTo - pFrom;
      return { from, to, t: span > 0 ? sharpstep((p - pFrom) / span) : 0 };
    };

    const INK_SWAP = 0.417;

    const renderSky = (p) => {
      const { from, to, t } = stateAt(p);
      const a = PALETTES[from];
      const b = PALETTES[to];
      Object.keys(a).forEach((name) => {
        const parts = [0, 1, 2].map((i) => Math.round(lerp(a[name][i], b[name][i], t)));
        section.style.setProperty(name, `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`);
      });

      const night = (from === 'night' ? 1 - t : 0) + (to === 'night' ? t : 0);
      const evening = (from === 'evening' ? 1 - t : 0) + (to === 'evening' ? t : 0);
      section.style.setProperty('--night', night.toFixed(4));
      section.style.setProperty('--evening', evening.toFixed(4));

      const eveningFactor = smoothstep(clamp01(evening));
      const nightFactor = night >= INK_SWAP ? 1 : smoothstep(clamp01(night / INK_SWAP));
      applyRamps(INK_RAMPS, eveningFactor, nightFactor);
    };

    // Stars are built here rather than shipped in the markup because
    // they have no daytime state to degrade to: without this block
    // running there is no night for them to belong to. Seeded rather
    // than Math.random so a resize can't reshuffle the constellation
    // under a visitor who is looking straight at it.
    const buildStars = () => {
      const backdrop = section.querySelector('.yurt-backdrop');
      if (!backdrop) return;
      const sky = node('svg', {
        class: 'yurt-stars',
        viewBox: '0 0 100 100',
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
      });
      let seed = 20260906;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let i = 0; i < 60; i++) {
        // Kept to the top ~58% of the sky: any lower and they come out
        // below the horizon, sitting in the grass.
        const star = node('circle', {
          cx: (rnd() * 100).toFixed(2),
          cy: (rnd() * 58).toFixed(2),
          r: (0.09 + rnd() * 0.15).toFixed(3),
          opacity: (0.4 + rnd() * 0.6).toFixed(2),
        });
        if (i % 3 === 0) {
          star.classList.add('is-twinkling');
          star.style.setProperty('--tw-dur', `${(2.8 + rnd() * 3.4).toFixed(2)}s`);
          star.style.setProperty('--tw-delay', `${(-rnd() * 6).toFixed(2)}s`);
        }
        sky.appendChild(star);
      }
      backdrop.prepend(sky);
    };

    const renderHills = (p) => {
      hillEls.forEach((el, i) => {
        const m = HILL_MOTION[i] || HILL_MOTION[HILL_MOTION.length - 1];
        const x = m.slide * p;
        const y = Math.sin(p * Math.PI * 2 * WAVE_CYCLES + m.phase) * m.lift;
        // The transform ATTRIBUTE, not a CSS transform: keeps this out
        // of the way of anything the stylesheet may animate later.
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      });
      // Each range moves as one piece — silhouette, shading and snow
      // together — or the snow would slide off the peaks it sits on.
      const shift = (els, slide) => {
        const x = (slide * p).toFixed(1);
        els.forEach((el) => el.setAttribute('transform', `translate(${x} 0)`));
      };
      shift(mtnFarEls, MTN_FAR_SLIDE);
      shift(mtnNearEls, MTN_NEAR_SLIDE);
    };

    // ---- Scroll scrubbing ----
    const steps = factEls.length;
    const TURNS = 1; // full revolutions across the whole section
    const pad = (n) => String(n).padStart(2, '0');
    let current = -1;

    const setFact = (i) => {
      if (i === current) return;
      current = i;
      factEls.forEach((el, j) => el.classList.toggle('is-active', j === i));
      railEls.forEach((el, j) => el.classList.toggle('is-done', j <= i));
      if (countEl) countEl.textContent = `${pad(i + 1)} / ${pad(steps)}`;
    };

    const update = () => {
      const runway = section.offsetHeight - window.innerHeight;
      const p = runway > 0
        ? Math.min(1, Math.max(0, -section.getBoundingClientRect().top / runway))
        : 0;
      render(p * TURNS * 2 * Math.PI);
      renderHills(p);
      renderSky(p);
      // Sun wheel behind the yurt, turning the other way and slower, so
      // the two read as separate objects rather than one rigid piece.
      // Fed in as a variable because the element's own transform also
      // has to centre it — see .yurt-halo in styles.css.
      section.style.setProperty('--halo-turn', `${(-p * HALO_TURNS * 360).toFixed(2)}deg`);
      setFact(Math.min(steps - 1, Math.floor(p * steps)));
      if (hintEl) hintEl.classList.toggle('is-fading', p > 0.03);
    };

    build();
    buildStars();
    // The runway is a viewport to settle into the pin plus a slice per
    // fact (see styles.css), so the section stretches with the list
    // instead of the facts flicking past faster the more there are.
    section.style.setProperty('--yurt-steps', steps);
    section.classList.add('js-yurt-active');

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    setFact(0);
    update();
  })();

  const rotator = document.getElementById('rotator');
  if (rotator) {
    rotator.classList.add('notranslate'); // Prevent Google Translate from messing it up

    const phrasesMap = {
      'rus': [
        'о своём крае',
        'о малоизвестных местах',
        'и находи читателей',
        'получай отклики',
        'выиграй путёвку'
      ],
      'kaz': [
        'өз өлкең жайлы',
        'аз білетін жерлер жайлы',
        'оқырмандар тап',
        'пікірлер ал',
        'жолдама ұтып ал'
      ],
      'eng': [
        'about your region',
        'about hidden places',
        'and find readers',
        'get feedback',
        'win a trip'
      ]
    };

    const minScale = 0.52;
    const slot = rotator.parentElement;
    const fitPhrase = () => {
      rotator.style.fontSize = '1em';
      const available = slot.getBoundingClientRect().width;
      const needed = rotator.getBoundingClientRect().width;
      if (!available || !needed || needed <= available) return;
      rotator.style.fontSize = `${Math.max(minScale, available / needed).toFixed(3)}em`;
    };

    let index = 0;
    const swapDuration = 350;
    const holdDuration = 2600;

    // Apply translation to initial state too
    const initialLang = localStorage.getItem('stepplify_lang') || 'rus';
    rotator.textContent = (phrasesMap[initialLang] || phrasesMap['rus'])[0];

    fitPhrase();
    window.addEventListener('resize', fitPhrase, { passive: true });

    setInterval(() => {
      rotator.classList.add('is-swapping');
      setTimeout(() => {
        const lang = localStorage.getItem('stepplify_lang') || 'rus';
        const phrases = phrasesMap[lang] || phrasesMap['rus'];
        index = (index + 1) % phrases.length;
        rotator.textContent = phrases[index];
        fitPhrase();
        rotator.classList.remove('is-swapping');
      }, swapDuration);
    }, holdDuration);
  }

  // ============ Interactive regions map ============
  // The ~150KB of oblast path data lives in assets/kazakhstan-map.svg
  // (not inline in index.html) — fetch it once and inject it into the
  // page, then wire up hover/tap so a region lifts to the front of its
  // neighbors (SVG has no z-index, so "front" means moving the element
  // to the end of its parent) and a name tooltip follows the pointer.
  const kzMapWrap    = document.getElementById('kzMapWrap');
  const kzMapTooltip = document.getElementById('kzMapTooltip');

  if (kzMapWrap && kzMapTooltip) {
    fetch('assets/kazakhstan-map.svg')
      .then((res) => {
        if (!res.ok) throw new Error('Не удалось загрузить карту');
        return res.text();
      })
      .then((svgMarkup) => {
        kzMapWrap.innerHTML = svgMarkup;
        kzMapWrap.setAttribute('aria-hidden', 'false');

        const mapSvg = kzMapWrap.querySelector('svg');

        const showTooltip = (name, x, y) => {
          kzMapTooltip.innerHTML = `${escapeHtml(name)}<span class="map-tooltip-hint">Нажмите — статьи региона</span>`;
          kzMapTooltip.style.left = `${x}px`;
          kzMapTooltip.style.top = `${y}px`;
          kzMapTooltip.classList.add('visible');
        };
        const hideTooltip = () => kzMapTooltip.classList.remove('visible');

        // Parallax tilt — the whole map continuously leans toward the
        // pointer, sharing .map-wrap's perspective with each region's
        // hover translateZ so the lean and the "popped up" region read
        // as one 3D surface, not two unrelated effects. Tracked on
        // `window` (not just while over the map) so the map keeps
        // following the cursor around the rest of the page instead of
        // resetting flat the moment the pointer leaves it, and eased
        // through a rAF loop rather than a CSS transition — restarting
        // a CSS transition from wherever it currently is on every single
        // mousemove is what made the old version feel like it was
        // snapping instead of gliding.
        const MAX_TILT = 18;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        let targetRotateX = 0;
        let targetRotateY = 0;
        let currentRotateX = 0;
        let currentRotateY = 0;

        const setTiltTarget = (x, y) => {
          const rect = kzMapWrap.getBoundingClientRect();
          const px = (x - rect.left) / rect.width - 0.5;
          const py = (y - rect.top) / rect.height - 0.5;
          targetRotateY = clamp(px * MAX_TILT * 2, -MAX_TILT, MAX_TILT);
          targetRotateX = clamp(-py * MAX_TILT * 2, -MAX_TILT, MAX_TILT);
        };
        window.addEventListener('pointermove', (e) => setTiltTarget(e.clientX, e.clientY));
        // Ease back to flat once the cursor leaves the window entirely
        // (rather than staying tilted toward wherever it last was).
        document.addEventListener('mouseleave', () => {
          targetRotateX = 0;
          targetRotateY = 0;
        });

        const EASE = 0.08; // lower = glidier, higher = snappier
        const tiltLoop = () => {
          currentRotateX += (targetRotateX - currentRotateX) * EASE;
          currentRotateY += (targetRotateY - currentRotateY) * EASE;
          if (mapSvg) {
            mapSvg.style.transform = `rotateX(${currentRotateX.toFixed(2)}deg) rotateY(${currentRotateY.toFixed(2)}deg)`;
          }
          requestAnimationFrame(tiltLoop);
        };
        requestAnimationFrame(tiltLoop);

        // Delegated on the wrapper (not one listener per region) with a
        // single "currently active" reference, so there's exactly one
        // .is-active region at any time. Per-region pointerenter/leave
        // listeners used to do this instead, but tracking "active"
        // ourselves and always clearing the old one before lighting the
        // new one is what actually guarantees that, regardless of event
        // order.
        //
        // "Bring to front" is a literal DOM move (parentNode.appendChild)
        // — SVG paints purely in document order, and CSS z-index turned
        // out NOT to override that here despite .kz-region already having
        // `filter`/`transform` (both of which create a stacking context
        // for regular HTML boxes): a popped region could still render
        // partly hidden under a neighbor that simply comes later in the
        // SVG's source order, which is exactly the "part of it stays
        // hidden behind other regions" bug this replaces. Moving the
        // element to the end of its parent is what actually guarantees
        // top-most paint order.
        //
        // The catch with reparenting: doing it in the same tick as adding
        // the class that triggers the scale-up transition gave the
        // browser no clean "before" frame to transition from, so the pop
        // read as instant instead of eased. Forcing a synchronous layout
        // (reading getBoundingClientRect right after the move, before the
        // class add) makes the browser commit the un-popped frame at its
        // new DOM position first, so the class add on the next line has
        // a real "before" state to ease from.
        let activeRegion = null;
        const setActiveRegion = (region) => {
          if (region === activeRegion) return;
          if (activeRegion) activeRegion.classList.remove('is-active');
          activeRegion = region;
          if (region) {
            region.parentNode.appendChild(region);
            void region.getBoundingClientRect();
            region.classList.add('is-active');
          }
        };

        kzMapWrap.addEventListener('pointermove', (e) => {
          const region = e.target.closest && e.target.closest('.kz-region');
          setActiveRegion(region || null);
          if (region) {
            showTooltip(region.dataset.name, e.clientX, e.clientY);
          } else {
            hideTooltip();
          }
        });
        kzMapWrap.addEventListener('pointerleave', () => {
          setActiveRegion(null);
          hideTooltip();
        });

        // The whole point of the map: hovering a region is a preview,
        // clicking it is the actual action — jump into the catalog
        // pre-filtered to whatever this region's authors have
        // published, same name string as the registration form's
        // region field so catalog.js's ?region= match hits exactly.
        kzMapWrap.addEventListener('click', (e) => {
          const region = e.target.closest && e.target.closest('.kz-region');
          if (region) window.location.href = `catalog.html?region=${encodeURIComponent(region.dataset.name)}`;
        });
      })
      .catch((err) => {
        kzMapWrap.innerHTML = `<div class="map-loading">${escapeHtml(err.message)}</div>`;
      });
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
      const fadeStart = 40;  // Начинаем скрывать, когда до края всего 40px
      const fadeEnd = -40;   // Полностью скрыт, когда ушел за край на 40px
      const tickFade = () => {
        const viewportRect = marqueeViewport.getBoundingClientRect();
        Array.from(marqueeTrack.children).forEach((card) => {
          const cardRect = card.getBoundingClientRect();
          const distFromLeft = cardRect.left - viewportRect.left;
          const distFromRight = viewportRect.right - cardRect.right;
          const minDist = Math.min(distFromLeft, distFromRight);
          
          let t = (minDist - fadeEnd) / (fadeStart - fadeEnd);
          t = Math.max(0, Math.min(1, t));
          card.style.opacity = t.toFixed(3);
        });
        requestAnimationFrame(tickFade);
      };
      requestAnimationFrame(tickFade);
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
    let mouseX = 0;
    let mouseY = 0;
    let curX = 0;
    let curY = 0;

    window.addEventListener('mousemove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      mouseX = -nx * strength;
      mouseY = -ny * strength;
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => {
      mouseX = 0;
      mouseY = 0;
    });

    let lastTime = performance.now();

    const tick = (time) => {
      // Calculate delta time in seconds, capped to avoid huge jumps if tab was inactive
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Frame-rate independent lerp (exponential decay)
      // speed factor: 4.0 gives a nice, smooth, slightly delayed follow effect
      const factor = 1 - Math.exp(-dt * 4.0);

      // Smooth interpolation towards the target mouse position
      curX += (mouseX - curX) * factor;
      curY += (mouseY - curY) * factor;

      // Ensure we round to avoid sub-pixel rendering jitter on some screens
      // scale(1.04) prevents the edges of the image from showing during translation
      scene.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0) scale(1.04)`;
      requestAnimationFrame(tick);
    };

    requestAnimationFrame((time) => {
      lastTime = time;
      tick(time);
    });
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

  // Service Worker Registration for Offline & 404 Fallback
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration skipped:', err);
      });
    });
  }

  // Network Offline Event Listener
  window.addEventListener('offline', () => {
    if (!window.location.pathname.includes('404.html')) {
      window.location.href = '404.html?mode=offline';
    }
  });
});


// --- REPORT SYSTEM (INJECTED) ---
const reportModalsHTML = `
<!-- Report Modal -->
<div class="auth-overlay" id="reportOverlay" aria-hidden="true" style="align-items:center; justify-content:center; position:fixed; inset:0; z-index:9999;">
  <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Пожаловаться" style="background:#161b26; padding:24px; border-radius:16px; width:400px; max-width:90%; position:relative; border:1px solid rgba(255,255,255,0.1);">
    <button class="auth-close" id="reportClose" aria-label="Закрыть" style="position:absolute; top:16px; right:16px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:24px; cursor:pointer;">&times;</button>
    <h2 class="modal-title" style="margin-bottom:16px; color:#fff; font-size:1.2rem;">Пожаловаться</h2>
    <form id="reportForm">
      <input type="hidden" id="reportTargetType" name="targetType">
      <input type="hidden" id="reportTargetId" name="targetId">
      <div class="auth-field" style="margin-bottom:16px;">
        <label for="reportReason" style="display:block; margin-bottom:8px; color:rgba(255,255,255,0.7); font-size:0.9rem;">Причина жалобы</label>
        <select id="reportReason" name="reason" required style="width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff;">
          <option value="spam">Спам или реклама</option>
          <option value="inaccurate">Недостоверная информация</option>
          <option value="offensive">Оскорбления / Недопустимый контент</option>
          <option value="other">Другое</option>
        </select>
        <input type="text" id="reportReasonOther" style="display:none; width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; margin-top:8px;" placeholder="Опишите причину...">
      </div>
      <button type="submit" class="auth-submit btn btn-primary" style="width:100%; padding:12px; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer;">Отправить жалобу</button>
    </form>
  </div>
</div>

<!-- Admin Reports Modal -->
<div class="auth-overlay" id="adminReportsOverlay" aria-hidden="true" style="align-items:center; justify-content:center; position:fixed; inset:0; z-index:9999;">
  <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Панель жалоб" style="background:#161b26; padding:24px; border-radius:16px; width:600px; max-width:90%; max-height:80vh; display:flex; flex-direction:column; position:relative; border:1px solid rgba(255,255,255,0.1);">
    <button class="auth-close" id="adminReportsClose" aria-label="Закрыть" style="position:absolute; top:16px; right:16px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:24px; cursor:pointer;">&times;</button>
    <h2 class="modal-title" style="margin-bottom:16px; color:#fff; font-size:1.2rem;">Жалобы (Модерация)</h2>
    <div id="adminReportsList" style="display:flex; flex-direction:column; gap:12px; overflow-y:auto; padding-right:8px;"></div>
  </div>
</div>
`;

if (document.body) {
  if (!document.getElementById('reportOverlay')) {
    document.body.insertAdjacentHTML('beforeend', reportModalsHTML);
    bindReportEvents();
  }
} else {
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('reportOverlay')) {
      document.body.insertAdjacentHTML('beforeend', reportModalsHTML);
      bindReportEvents();
    }
  });
}

function bindReportEvents() {
  document.getElementById('reportClose').addEventListener('click', () => {
    document.getElementById('reportOverlay').classList.remove('open');
  });

  document.getElementById('reportReason').addEventListener('change', (e) => {
    const otherInput = document.getElementById('reportReasonOther');
    if (e.target.value === 'other') {
      otherInput.style.display = 'block';
      otherInput.required = true;
    } else {
      otherInput.style.display = 'none';
      otherInput.required = false;
    }
  });

  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('stepplify_token');
    const type = document.getElementById('reportTargetType').value;
    const id = document.getElementById('reportTargetId').value;
    let reason = document.getElementById('reportReason').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    if (reason === 'other') {
      reason = 'Другое: ' + document.getElementById('reportReasonOther').value;
    }
    
    btn.textContent = 'Отправка...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetType: type, targetId: id, reason })
      });
      if (res.ok) {
        btn.textContent = 'Успешно отправлено!';
        btn.style.background = '#555'; // Gray
        setTimeout(() => {
          document.getElementById('reportOverlay').classList.remove('open');
          document.getElementById('reportForm').reset();
          document.getElementById('reportReasonOther').style.display = 'none';
          document.getElementById('reportReasonOther').required = false;
          btn.textContent = originalText;
          btn.style.background = originalBg;
          btn.disabled = false;
        }, 1200);
      } else {
        btn.textContent = 'Ошибка отправки';
        setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      }
    } catch (err) {
      console.error(err);
      btn.textContent = 'Ошибка сети';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    }
  });

  document.getElementById('adminReportsClose').addEventListener('click', () => {
    document.getElementById('adminReportsOverlay').classList.remove('open');
  });
}

window.openReportModal = (type, id) => {
  const token = localStorage.getItem('stepplify_token');
  if (!token) {
    alert('Пожалуйста, войдите в систему, чтобы отправить жалобу.');
    return;
  }
  const overlay = document.getElementById('reportOverlay');
  if (!overlay) {
    alert('Модальное окно еще не загружено, попробуйте еще раз.');
    return;
  }
  document.getElementById('reportTargetType').value = type;
  document.getElementById('reportTargetId').value = id;
  overlay.classList.add('open');
};

window.openAdminReportsModal = async () => {
  const token = localStorage.getItem('stepplify_token');
  const overlay = document.getElementById('adminReportsOverlay');
  if (!overlay) {
    alert('Модальное окно еще не загружено, попробуйте еще раз.');
    return;
  }
  overlay.classList.add('open');
  const list = document.getElementById('adminReportsList');
  list.innerHTML = 'Загрузка...';

  try {
    const res = await fetch('/api/reports', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load');
    const reports = await res.json();
    
    if (reports.length === 0) {
      list.innerHTML = '<div style="color:rgba(255,255,255,0.5);">Нет активных жалоб.</div>';
      return;
    }

    list.innerHTML = reports.map(r => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:12px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong 
            style="color:#fff; ${r.targetArticleId ? 'cursor:pointer; text-decoration:underline;' : ''}" 
            ${r.targetArticleId ? `onclick="document.getElementById('adminReportsOverlay').classList.remove('open'); window.openArticleModal(${r.targetArticleId}, '${r.targetType}', ${r.targetId})"` : ''}
          >
            ID: ${r.id} | ${r.targetTitle || `Тип: ${r.targetType} (${r.targetId})`}
          </strong>
          <span style="color:${r.status === 'pending' ? 'var(--accent)' : 'gray'};">${r.status}</span>
        </div>
        <div style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:8px;">
          От: ${r.user.fullName} (${r.user.email})<br>
          Причина: ${r.reason}
        </div>
        ${r.status === 'pending' ? `
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button onclick="resolveReport(${r.id}, 'resolved')" style="padding:6px 12px; background:#2e7d32; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Подтвердить</button>
            <button onclick="resolveReport(${r.id}, 'dismissed')" style="padding:6px 12px; background:#555; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Отклонить</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = '<div style="color:var(--accent);">Ошибка загрузки жалоб. Вы точно модератор?</div>';
  }
};

window.resolveReport = async (id, status) => {
  const token = localStorage.getItem('stepplify_token');
  try {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      window.openAdminReportsModal(); // refresh list
      if (typeof updateNavFromStorage === 'function') updateNavFromStorage();
    }
  } catch (err) {
    console.error(err);
    alert('Ошибка при обновлении статуса');
  }
};
// --- END REPORT SYSTEM ---

window.grantModRights = async (userId) => {
  const token = localStorage.getItem('stepplify_token');
  try {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ role: 'moderator' })
    });
    if (res.ok) {
      window.openPublicProfileModal?.(userId);
    }
  } catch(e) {
    console.error(e);
  }
};

window.revokeModRights = async (userId) => {
  const token = localStorage.getItem('stepplify_token');
  try {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ role: 'user' }) // Downgrade back to normal user
    });
    if (res.ok) {
      window.openPublicProfileModal?.(userId);
    }
  } catch(e) {
    console.error(e);
  }
};
