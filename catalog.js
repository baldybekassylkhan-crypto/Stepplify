document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return; // not on the catalog page

  const countEl = document.getElementById('catalogCount');
  const searchInput = document.getElementById('catalogSearch');
  const resetBtn = document.getElementById('catalogResetBtn');
  const regionChip = document.getElementById('catalogRegionChip');
  const regionChipName = document.getElementById('catalogRegionChipName');
  const regionChipClear = document.getElementById('catalogRegionChipClear');

  // Custom sort dropdown (button + listbox) — see the markup comment
  // in catalog.html for why this isn't a native <select>.
  const sortSelectEl = document.getElementById('catalogSortSelect');
  const sortBtn = document.getElementById('catalogSortBtn');
  const sortValueEl = document.getElementById('catalogSortValue');
  const sortMenu = document.getElementById('catalogSortMenu');

  const API_URL = 'http://localhost:5000/api';

  // Populated by loadArticles() below; the filtering/sorting/rendering
  // that follows works against whatever ends up in this array.
  let allArticles = [];

  async function loadArticles() {
    try {
      const res = await fetch(`${API_URL}/articles`);
      if (!res.ok) throw new Error('Failed to load articles');
      const data = await res.json();
      allArticles = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Не удалось загрузить статьи для каталога:', err);
      allArticles = [];
    }
    renderCatalog();
  }

  // A freshly published/edited/deleted article (from this page's own
  // publish modal, or the shared one on index.html before navigating
  // here) should show up without a manual refresh — script.js dispatches
  // these after a successful POST/PUT/DELETE against /articles.
  document.addEventListener('stepplify:articlePublished', loadArticles);
  document.addEventListener('stepplify:articleUpdated', loadArticles);
  document.addEventListener('stepplify:articleDeleted', loadArticles);

  const state = {
    query: '',
    sort: 'nearby',
    // Arrives via ?region=... — set when a reader clicks a region on
    // map.html instead of picked from a filter control on this page,
    // so it's plain state rather than one more checkbox group.
    region: new URLSearchParams(window.location.search).get('region') || null,
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const matchesFilters = (article) => {
    if (state.region && article.region !== state.region) return false;
    if (!state.query) return true;
    const haystack = `${article.title} ${article.author} ${article.locationName || ''}`.toLowerCase();
    return haystack.includes(state.query);
  };

  // ============ Recommendations ("Рекомендуем для вас") ============
  // Reading history is tracked in script.js (window.stepplifyReading —
  // shared across pages since it's populated from the home page's
  // marquee too, not just this catalog). Scored on four signals,
  // each normalized to 0..1 against the current list before weighting
  // so no single signal (e.g. raw view counts running into the
  // hundreds) can drown out the others by scale alone:
  //   - category affinity (40%) — categories this reader actually opens
  //   - search relevance  (35%) — do their past searches show up in
  //     this article's title/body/location?
  //   - recency           (15%) — a small tiebreak toward newer work so
  //     "recommended" doesn't calcify into "more of the same 3 old posts"
  //   - popularity        (10%) — a light general-quality signal
  // Already-read articles are scored normally but then discounted 40%,
  // so a strong new match still beats a so-so rehash of something seen.
  const CATEGORY_WEIGHT = 0.40;
  const SEARCH_WEIGHT = 0.35;
  const RECENCY_WEIGHT = 0.15;
  const POPULARITY_WEIGHT = 0.10;
  const ALREADY_READ_MULTIPLIER = 0.6;

  const scoreArticles = (list, profile) => {
    const categoryViews = profile.categoryViews || {};
    const searchEntries = Object.entries(profile.searchTerms || {});
    const viewedSet = new Set(profile.viewedArticleIds || []);
    const now = Date.now();

    const raw = list.map((article) => {
      const categoryRaw = categoryViews[article.category] || 0;

      const haystack = `${article.title} ${article.content || ''} ${article.locationName || ''} ${article.category}`.toLowerCase();
      let searchRaw = 0;
      for (const [term, count] of searchEntries) {
        if (haystack.includes(term)) searchRaw += count;
      }

      const ageDays = article.createdAt ? Math.max(0, (now - new Date(article.createdAt).getTime()) / 86400000) : 999;
      const recencyRaw = 1 / (1 + ageDays);

      const popularityRaw = article.views || 0;

      return { article, categoryRaw, searchRaw, recencyRaw, popularityRaw };
    });

    // Divide each component by its own max across the current list —
    // the normalization step that keeps e.g. a search-term match (a
    // small integer) comparable to a popularity count (could be 500+).
    const maxOf = (key) => Math.max(1e-9, ...raw.map((r) => r[key]));
    const categoryMax = maxOf('categoryRaw');
    const searchMax = maxOf('searchRaw');
    const recencyMax = maxOf('recencyRaw');
    const popularityMax = maxOf('popularityRaw');

    return raw.map((r) => {
      let score =
        CATEGORY_WEIGHT * (r.categoryRaw / categoryMax) +
        SEARCH_WEIGHT * (r.searchRaw / searchMax) +
        RECENCY_WEIGHT * (r.recencyRaw / recencyMax) +
        POPULARITY_WEIGHT * (r.popularityRaw / popularityMax);
      if (viewedSet.has(String(r.article.id))) score *= ALREADY_READ_MULTIPLIER;
      return { article: r.article, score };
    });
  };

  // Below this, there just isn't enough signal yet to personalize
  // responsibly — falls back to the neutral "Сначала новые" default
  // rather than confidently "recommending" off one stray click. Summed
  // interaction *counts*, not distinct categories/terms — a reader who
  // opened five Экология articles has a strong, clear signal even
  // though that's only one distinct category key.
  const MIN_SIGNALS_FOR_AUTO_RECOMMEND = 3;
  const sumValues = (obj) => Object.values(obj || {}).reduce((sum, n) => sum + n, 0);
  const hasEnoughSignal = (profile) =>
    sumValues(profile.categoryViews) + sumValues(profile.searchTerms) >= MIN_SIGNALS_FOR_AUTO_RECOMMEND;

  const getNearbyDistance = (article, userHomeRegion) => {
    const target = (userHomeRegion || 'Жетысуская область').toLowerCase();
    const reg = (article.region || '').toLowerCase();
    const loc = (article.locationName || '').toLowerCase();
    const title = (article.title || '').toLowerCase();

    const textToMatch = `${reg} ${loc} ${title}`;

    // Direct match with home region / target region (e.g. "жетысуская", "жетысу", "талдыкорган")
    if (
      (target && textToMatch.includes(target)) ||
      (textToMatch.includes('жетысу') || textToMatch.includes('жетису') || textToMatch.includes('талдыкорган'))
    ) {
      return 0;
    }

    // Tier 1: Neighboring regions to Zhetysu
    const tier1 = ['алматинская', 'алматы', 'абайская', 'карагандинская', 'жамбылская'];
    if (tier1.some((t) => textToMatch.includes(t))) {
      return 1;
    }

    // Tier 2: Nearby East / Central / South regions
    const tier2 = ['восточно-казахстанская', 'улытауская', 'туркестанская', 'шымкент', 'павлодарская'];
    if (tier2.some((t) => textToMatch.includes(t))) {
      return 2;
    }

    // Tier 3: Capital & North regions
    const tier3 = ['астана', 'акмолинская', 'кызылординская', 'костанайская', 'северо-казахстанская'];
    if (tier3.some((t) => textToMatch.includes(t))) {
      return 3;
    }

    // Tier 4: West Kazakhstan
    const tier4 = ['актюбинская', 'атырауская', 'мангистауская', 'западно-казахстанская'];
    if (tier4.some((t) => textToMatch.includes(t))) {
      return 4;
    }

    return 5;
  };

  const sortArticles = (list) => {
    const sorted = [...list];
    if (state.sort === 'nearby') {
      const userObj = JSON.parse(localStorage.getItem('stepplify_user') || '{}');
      const homeRegion = userObj.region || 'Жетысуская область';
      sorted.sort((a, b) => {
        const distA = getNearbyDistance(a, homeRegion);
        const distB = getNearbyDistance(b, homeRegion);
        if (distA !== distB) return distA - distB;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      return sorted;
    }
    if (state.sort === 'recommended') {
      const profile = window.stepplifyReading?.getProfile() || { categoryViews: {}, searchTerms: {}, viewedArticleIds: [] };
      return scoreArticles(sorted, profile)
        .sort((a, b) => b.score - a.score || new Date(b.article.createdAt || 0) - new Date(a.article.createdAt || 0))
        .map((s) => s.article);
    }
    if (state.sort === 'popular') {
      sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (state.sort === 'az') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return sorted;
  };

  const renderCard = (a) => `
    <article class="article-card catalog-card" data-id="${a.id}">
      <h3>${escapeHtml(a.title)}</h3>
      <div class="article-author">${escapeHtml(a.author)}</div>
      <div class="article-meta">
        <span>${escapeHtml(a.meta || a.locationName || '')}</span>
        <span>👁 ${escapeHtml(a.viewsFormatted ?? a.views ?? 0)}</span>
      </div>
    </article>`;

  // No publish button in the "no articles at all" case — the toolbar
  // right above the grid already has one, and repeating it here just
  // duplicated the exact same action a few pixels apart.
  const emptyState = (hasAnyArticles) => `
    <div class="catalog-empty">
      <span class="catalog-empty-icon">${hasAnyArticles ? '🔍' : '🗺️'}</span>
      <h3>${hasAnyArticles ? 'Ничего не найдено' : 'Статей пока нет'}</h3>
      <p>${hasAnyArticles
        ? 'Под текущие фильтры ничего не подошло — попробуйте изменить запрос или сбросить фильтры.'
        : 'Здесь появятся исследования учеников про туристические места Казахстана. Станьте первым автором!'}</p>
      ${hasAnyArticles
        ? '<button type="button" class="btn btn-secondary" id="catalogEmptyReset">Сбросить фильтры</button>'
        : ''}
    </div>`;

  const renderCatalog = () => {
    const filtered = sortArticles(allArticles.filter(matchesFilters));

    countEl && (countEl.textContent = `${filtered.length} ${pluralizeArticles(filtered.length)}`);

    if (!filtered.length) {
      grid.innerHTML = emptyState(allArticles.length > 0);
      grid.querySelector('#catalogEmptyReset')?.addEventListener('click', resetFilters);
    } else {
      grid.innerHTML = filtered.map(renderCard).join('');
    }
  };

  function pluralizeArticles(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'статья';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'статьи';
    return 'статей';
  }

  function setRegionFilter(region) {
    state.region = region || null;
    if (regionChip) regionChip.hidden = !state.region;
    if (regionChipName) regionChipName.textContent = state.region || '';
    // Keep the URL in sync (so refresh/share preserves it, and clearing
    // it doesn't leave a stale ?region= behind) without adding a
    // history entry for what's just a filter toggle.
    const url = new URL(window.location.href);
    if (state.region) url.searchParams.set('region', state.region);
    else url.searchParams.delete('region');
    window.history.replaceState({}, '', url);
  }

  regionChipClear?.addEventListener('click', () => {
    setRegionFilter(null);
    renderCatalog();
  });

  function resetFilters() {
    state.query = '';
    setRegionFilter(null);
    if (searchInput) searchInput.value = '';
    applySortSelection('nearby', { render: false });
    renderCatalog();
  }

  // Recording the search term itself is debounced separately from
  // filtering — filtering should feel instant on every keystroke, but
  // "гор" -> "горы" should register as one search signal for "горы",
  // not three weak ones for each prefix typed on the way there.
  let searchRecordTimer = null;
  searchInput?.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderCatalog();
    clearTimeout(searchRecordTimer);
    searchRecordTimer = setTimeout(() => {
      window.stepplifyReading?.recordSearch(state.query);
    }, 600);
  });

  // Applies a sort choice to state + the button's label + which <li>
  // shows as selected. render:false is used by resetFilters, which
  // already triggers its own single renderCatalog() call afterward.
  function applySortSelection(value, { render = true } = {}) {
    const optionEl = sortMenu?.querySelector(`li[data-value="${value}"]`);
    if (!optionEl) return;
    state.sort = value;
    if (sortValueEl) sortValueEl.textContent = optionEl.textContent;
    sortMenu?.querySelectorAll('li').forEach((li) => li.classList.toggle('is-selected', li === optionEl));
    if (render) renderCatalog();
  }

  const closeSortMenu = () => {
    sortSelectEl?.classList.remove('open');
    sortBtn?.setAttribute('aria-expanded', 'false');
  };

  if (sortSelectEl && sortBtn && sortMenu) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sortSelectEl.classList.toggle('open');
      sortBtn.setAttribute('aria-expanded', String(isOpen));
    });

    sortMenu.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-value]');
      if (!li) return;
      applySortSelection(li.dataset.value);
      closeSortMenu();
    });

    document.addEventListener('click', (e) => {
      if (!sortSelectEl.contains(e.target)) closeSortMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSortMenu();
    });
  }

  resetBtn?.addEventListener('click', resetFilters);

  // Delegated on the grid itself so it survives every re-render from
  // renderCatalog()/loadArticles() rebuilding grid.innerHTML.
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.catalog-card[data-id]');
    const id = card?.dataset.id;
    if (id) {
      e.stopPropagation();
      window.openArticleModal?.(id);
    }
  });

  setRegionFilter(state.region);
  loadArticles();
});
