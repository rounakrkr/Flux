/* ============================================================
   FLUX — Storage Module
   Manages all localStorage state: feed cache, stats, saved cards
   ============================================================ */

const Storage = (() => {
  const K = {
    FEED:    'flux_feed_',   // + date string
    STATS:   'flux_stats',
    SAVED:   'flux_saved',
    PREFS:   'flux_prefs',
  };

  // Utility
  function get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
  }

  // ---- Daily Feed ----
  function getDailyFeed(dateStr) {
    return get(K.FEED + dateStr);
  }
  function saveDailyFeed(dateStr, cards) {
    set(K.FEED + dateStr, cards);
    // Clean up feeds older than current date
    Object.keys(localStorage)
      .filter(k => k.startsWith(K.FEED) && !k.endsWith(dateStr))
      .forEach(k => localStorage.removeItem(k));
  }

  // ---- Stats ----
  function defaultStats() {
    return {
      streak:       0,
      totalLearned: 0,
      totalSaved:   0,
      totalExplored:0,
      lastVisit:    null,
      activity:     [],   // last 30 date strings
      catCounts:    {},
    };
  }
  function getStats() { return get(K.STATS) || defaultStats(); }
  function saveStats(s) { set(K.STATS, s); }

  function updateDailyVisit() {
    const s     = getStats();
    const today = new Date().toDateString();
    const yest  = new Date(Date.now() - 864e5).toDateString();

    if (s.lastVisit === today) return s;

    s.streak     = s.lastVisit === yest ? s.streak + 1 : 1;
    s.lastVisit  = today;
    if (!s.activity.includes(today)) s.activity.unshift(today);
    s.activity   = s.activity.slice(0, 30);

    saveStats(s);
    return s;
  }

  function recordLearned(category) {
    const s = getStats();
    s.totalLearned += 1;
    s.catCounts[category] = (s.catCounts[category] || 0) + 1;
    saveStats(s);
    return s;
  }

  function recordExplored() {
    const s = getStats();
    s.totalExplored += 1;
    saveStats(s);
    return s;
  }

  // ---- Saved Cards ----
  function getSaved() { return get(K.SAVED) || []; }
  function saveCard(card) {
    const saved = getSaved();
    if (saved.find(c => c.title === card.title)) return false; // already saved
    saved.unshift({ ...card, savedAt: Date.now() });
    set(K.SAVED, saved.slice(0, 200));
    const s = getStats();
    s.totalSaved = saved.length;
    saveStats(s);
    return true;
  }

  // ---- Top Category ----
  function getTopCategory() {
    const s = getStats();
    const entries = Object.entries(s.catCounts);
    if (!entries.length) return null;
    return entries.sort(([,a],[,b]) => b - a)[0][0];
  }

  return {
    getDailyFeed, saveDailyFeed,
    getStats, updateDailyVisit, recordLearned, recordExplored,
    getSaved, saveCard,
    getTopCategory,
  };
})();
