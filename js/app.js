/* ============================================================
   FLUX — Main App Module
   Orchestrates all screens, navigation, modals, and modules
   ============================================================ */

/* ============================================================
   Utility helpers
   ============================================================ */
function catColor(cat) {
  const m = {
    'AI & ML':'#a855f7','IoT':'#06b6d4','Computer Networks':'#3b82f6',
    'Cybersecurity':'#ef4444','Hardware':'#f59e0b','New Inventions':'#f97316',
    'Robotics':'#10b981','Programming':'#6366f1','The Basics':'#14b8a6',
  };
  return m[cat] || '#4f8dff';
}

function showToast(msg, type = 'info') {
  const wrap  = document.getElementById('toast-wrap');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideDown .28s ease reverse';
    setTimeout(() => toast.remove(), 280);
  }, 2400);
}

/* ============================================================
   FEED MODULE
   ============================================================ */
const Feed = {
  _cards: [],

  async load() {
    const container = document.getElementById('feed-container');

    // Set date label
    document.getElementById('feed-date').textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    // Skeleton
    container.innerHTML = Array(6).fill(0).map(() => `
      <div class="skel-card">
        <div class="skel-row">
          <div class="skel-sq"></div>
          <div class="skel-lines">
            <div class="skel-line m"></div>
            <div class="skel-line s"></div>
          </div>
        </div>
        <div class="skel-line l"></div>
        <div class="skel-line m" style="margin-top:6px"></div>
      </div>
    `).join('');

    try {
      const cards = await Gemini.generateDailyFeed();
      this._cards = cards;
      this._render(cards, container);
      Storage.updateDailyVisit();
      // Update streak display
      const stats = Storage.getStats();
      document.getElementById('streak-count').textContent = stats.streak;
    } catch (err) {
      console.error('Feed error:', err);
      container.innerHTML = `
        <div class="empty">
          <span class="ico">⚡</span>
          <h3>Couldn't load feed</h3>
          <p>Check your internet connection. Gemini API needs to reach the internet.</p>
          <button class="btn-primary" onclick="Feed.load()">Retry</button>
        </div>`;
    }
  },

  _render(cards, container) {
    container.innerHTML = cards.map((card, i) => {
      const color = catColor(card.category);
      return `
        <div class="feed-card" data-cat="${card.category}" data-index="${i}"
             style="border-left-color:${color}; animation-delay:${i * 0.065}s">
          <div class="fc-dot"></div>
          <div class="fc-head">
            <div class="fc-emoji">${card.emoji || '⚡'}</div>
            <div class="fc-meta">
              <div class="fc-title">${card.title}</div>
              <span class="fc-tag" style="background:${color}22;color:${color}">${card.category}</span>
            </div>
          </div>
          <div class="fc-liner">${card.oneLiner}</div>
        </div>`;
    }).join('');

    const savedCards = this._cards;
    container.querySelectorAll('.feed-card').forEach((el, i) => {
      el.addEventListener('click', () => {
        el.classList.add('read');
        App.openModal(savedCards[i]);
        Storage.recordLearned(savedCards[i].category);
        document.getElementById('streak-count').textContent = Storage.getStats().streak;
      });
    });
  },
};

/* ============================================================
   EXPLORE MODULE
   ============================================================ */
const Explore = {
  _swiper:     null,
  _category:   'All',
  _loading:    false,
  _activated:  false,
  MIN_STACK:   3,

  CATEGORIES: ['All','AI & ML','IoT','Computer Networks','Cybersecurity',
               'Hardware','New Inventions','Robotics','Programming','The Basics'],

  init() {
    const arena = document.getElementById('swipe-arena');
    this._swiper = new SwipeManager(arena, {
      onSwipe: (dir, data) => this._onSwipe(dir, data),
      onTap:   (data) => App.openModal(data),
    });

    // Build filter chips
    const filtersEl = document.getElementById('explore-filters');
    filtersEl.innerHTML = this.CATEGORIES.map(c => `
      <button class="chip${c === 'All' ? ' active' : ''}" data-cat="${c}">${c}</button>
    `).join('');

    filtersEl.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      filtersEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.setCategory(chip.dataset.cat);
    });

    // Button controls
    document.getElementById('btn-skip').addEventListener('click', () => this._swiper.programmaticSwipe('skip'));
    document.getElementById('btn-save').addEventListener('click', () => this._swiper.programmaticSwipe('save'));
  },

  async activate() {
    if (this._swiper.cardCount() < this.MIN_STACK) {
      await this._fillStack();
    }
    this._activated = true;
  },

  setCategory(cat) {
    this._category = cat;
    this._swiper.clear();
    this._fillStack();
  },

  async _fillStack() {
    if (this._loading) return;
    this._loading = true;

    // Show loading indicator inside arena if empty
    const arena = document.getElementById('swipe-arena');
    if (this._swiper.cardCount() === 0) {
      arena.innerHTML = '<div class="no-cards"><div class="icon">⚡</div><p>Loading cards...</p></div>';
    }

    try {
      const cards = await Gemini.generateExploreBatch(this._category);

      // Remove loading state if present
      const noCards = arena.querySelector('.no-cards');
      if (noCards) noCards.remove();

      // Add in reverse so first card ends up on top
      for (let i = cards.length - 1; i >= 0; i--) {
        this._swiper.addCard(cards[i]);
      }
    } catch (err) {
      console.error('Explore fill error:', err);
      if (this._swiper.cardCount() === 0) {
        arena.innerHTML = `
          <div class="no-cards">
            <div class="icon">😕</div>
            <p>Couldn't load cards. Check your connection.</p>
            <button class="btn-primary" style="margin-top:12px" onclick="Explore._fillStack()">Try Again</button>
          </div>`;
      }
    } finally {
      this._loading = false;
    }
  },

  _onSwipe(direction, data) {
    if (!data) return;
    if (direction === 'save') {
      const isNew = Storage.saveCard(data);
      Storage.recordLearned(data.category);
      showToast(isNew ? '✓ Saved to collection!' : 'Already saved!', 'success');
    } else {
      Storage.recordExplored();
    }
    document.getElementById('streak-count').textContent = Storage.getStats().streak;

    // Refill if running low
    if (this._swiper.cardCount() < this.MIN_STACK && !this._loading) {
      this._fillStack();
    }
  },
};

/* ============================================================
   CATEGORIES MODULE
   ============================================================ */
const Categories = {
  DATA: [
    { name:'AI & ML',           emoji:'🧠', desc:'Machine Learning & AI Systems'  },
    { name:'IoT',               emoji:'📡', desc:'Internet of Things'              },
    { name:'Computer Networks', emoji:'🌐', desc:'Protocols & Architectures'       },
    { name:'Cybersecurity',     emoji:'🔒', desc:'Security & Cryptography'         },
    { name:'Hardware',          emoji:'💾', desc:'Electronics & Architecture'       },
    { name:'New Inventions',    emoji:'🚀', desc:'Emerging Technologies'            },
    { name:'Robotics',          emoji:'🤖', desc:'Automation & Robotics'           },
    { name:'Programming',       emoji:'⌨️', desc:'CS Theory & Code Concepts'       },
    { name:'The Basics',        emoji:'🔭', desc:'Fundamentals Every Engineer Knows'},
  ],

  render() {
    const stats = Storage.getStats();
    const grid  = document.getElementById('cat-grid');
    grid.innerHTML = this.DATA.map((c, i) => {
      const count = stats.catCounts[c.name] || 0;
      return `
        <div class="cat-card" data-cat="${c.name}"
             style="animation-delay:${i * 0.05}s">
          <div class="cat-emoji">${c.emoji}</div>
          <div class="cat-info">
            <div class="cat-name">${c.name}</div>
            <div class="cat-count">${count} learned</div>
          </div>
        </div>`;
    }).join('');

    // Event delegation — handles all category clicks
    grid.onclick = (e) => {
      const card = e.target.closest('.cat-card');
      if (!card) return;
      this.explore(card.dataset.cat);
    };
  },

  explore(cat) {
    App.switchScreen('explore');
    Explore.setCategory(cat);
    // Update chip UI
    document.querySelectorAll('#explore-filters .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === cat);
    });
  },
};

/* ============================================================
   STATS MODULE
   ============================================================ */
const Stats = {
  render() {
    const s     = Storage.getStats();
    const saved = Storage.getSaved();
    const topCat = Storage.getTopCategory();
    const days  = this._last7(s.activity);
    const wrap  = document.getElementById('stats-wrap');

    const topCatData = topCat
      ? Categories.DATA.find(c => c.name === topCat)
      : null;

    wrap.innerHTML = `
      <div class="stats-hero">
        <div style="font-size:48px;margin-bottom:6px">🔥</div>
        <div class="hero-num">${s.streak}</div>
        <div class="hero-label">${s.streak === 1 ? '1 day streak' : `${s.streak} day streak`} — keep it up!</div>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="stat-val">${s.totalLearned}</div><div class="stat-lbl">Learned</div></div>
        <div class="stat-box"><div class="stat-val">${saved.length}</div><div class="stat-lbl">Saved</div></div>
        <div class="stat-box"><div class="stat-val">${s.totalExplored}</div><div class="stat-lbl">Explored</div></div>
        <div class="stat-box"><div class="stat-val">${Object.keys(s.catCounts).length}</div><div class="stat-lbl">Topics Hit</div></div>
      </div>

      <div class="activity-box">
        <div class="act-title">Last 7 days</div>
        <div class="act-row">
          ${days.map(d => `
            <div class="act-day">
              <div class="act-dot ${d.active ? 'on' : ''}"></div>
              <div class="act-lbl">${d.label}</div>
            </div>`).join('')}
        </div>
      </div>

      ${topCatData ? `
        <div class="top-cat-box">
          <div class="top-cat-label">⭐ Your Top Topic</div>
          <div class="top-cat-name">${topCatData.emoji} ${topCatData.name}</div>
          <div class="top-cat-desc">${topCatData.desc}</div>
        </div>` : ''}
    `;
  },

  _last7(activity) {
    const dayLabels = ['S','M','T','W','T','F','S'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 864e5);
      return { label: dayLabels[d.getDay()], active: activity.includes(d.toDateString()) };
    });
  },
};

/* ============================================================
   MAIN APP MODULE
   ============================================================ */
const App = {
  _screen:    'feed',
  _modalCard: null,
  _installEvent: null,

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this._installEvent = e;
      const banner = document.getElementById('install-banner');
      banner.style.display = 'flex';
      banner.addEventListener('click', () => this._install());
    });

    // Init modules
    Explore.init();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchScreen(btn.dataset.screen));
    });

    // Check URL param for initial screen
    const urlScreen = new URLSearchParams(location.search).get('screen');
    if (urlScreen && ['feed','explore','categories','stats'].includes(urlScreen)) {
      this._screen = urlScreen;
      document.querySelector('.screen.active').classList.remove('active');
      document.querySelector('.nav-item.active').classList.remove('active');
      document.getElementById(`screen-${urlScreen}`).classList.add('active');
      document.getElementById(`nav-${urlScreen}`).classList.add('active');
    }

    // Modal events
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    document.getElementById('modal-close-btn').addEventListener('click', () => this.closeModal());

    document.getElementById('modal-share-btn').addEventListener('click', () => this._share());
    document.getElementById('modal-save-btn').addEventListener('click', () => this._saveModal());

    document.getElementById('chat-send').addEventListener('click', () => this._sendChat());
    document.getElementById('chat-input').addEventListener('keypress', e => {
      if (e.key === 'Enter') this._sendChat();
    });

    document.getElementById('modal-related').addEventListener('click', e => {
      const chip = e.target.closest('.rel-chip');
      if (chip) {
        document.getElementById('chat-input').value = `What is ${chip.textContent}?`;
        this._sendChat();
      }
    });

    // Streak pill — long press to open settings (change API key)
    let pressTimer;
    const streakPill = document.getElementById('streak-pill');
    streakPill.addEventListener('mousedown', () => { pressTimer = setTimeout(() => this._showKeySettings(), 800); });
    streakPill.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => this._showKeySettings(), 800); }, { passive: true });
    streakPill.addEventListener('mouseup', () => clearTimeout(pressTimer));
    streakPill.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    streakPill.addEventListener('touchend', () => clearTimeout(pressTimer));
    streakPill.addEventListener('touchcancel', () => clearTimeout(pressTimer));

    // Setup onboarding events
    this._setupOnboarding();

    // Hide loading
    this._hideLoading();

    // Check if API key is set
    if (!Gemini.hasApiKey()) {
      this._showOnboarding();
    } else {
      document.getElementById('app').style.display = '';
      await Feed.load();
    }
  },

  _setupOnboarding() {
    const submitBtn = document.getElementById('onb-submit');
    const keyInput  = document.getElementById('onb-key-input');
    const errorEl   = document.getElementById('onb-error');

    submitBtn.addEventListener('click', async () => {
      const key = keyInput.value.trim();
      if (!key) {
        errorEl.textContent = 'Please enter your API key.';
        return;
      }
      if (!key.startsWith('AIza')) {
        errorEl.textContent = 'That doesn\'t look like a valid Gemini API key. It should start with "AIza".';
        return;
      }

      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying key...';

      // Quick test call to verify the key works
      Gemini.setApiKey(key);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with just the word OK' }] }],
            generationConfig: { maxOutputTokens: 10 }
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = data?.error?.message || `Error ${res.status}`;
          throw new Error(msg);
        }

        // Key works!
        document.getElementById('onboarding').style.display = 'none';
        document.getElementById('app').style.display = '';
        showToast('✓ API key saved! Welcome to Flux.', 'success');
        await Feed.load();
      } catch (err) {
        Gemini.setApiKey(''); // Clear bad key
        errorEl.textContent = `Key didn't work: ${err.message}`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Start Learning →';
      }
    });

    keyInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') submitBtn.click();
    });
  },

  _showOnboarding() {
    document.getElementById('app').style.display = 'none';
    document.getElementById('onboarding').style.display = '';
    document.getElementById('onb-key-input').value = '';
    document.getElementById('onb-error').textContent = '';
    document.getElementById('onb-submit').disabled = false;
    document.getElementById('onb-submit').textContent = 'Start Learning →';
  },

  _showKeySettings() {
    const currentKey = Gemini.getApiKey();
    const masked = currentKey ? currentKey.slice(0, 8) + '•••' + currentKey.slice(-4) : 'not set';
    const newKey = prompt(`Current key: ${masked}\n\nPaste a new API key to replace it (or cancel):`);
    if (newKey && newKey.trim()) {
      Gemini.setApiKey(newKey.trim());
      showToast('🔑 API key updated!', 'info');
    }
  },

  switchScreen(name) {
    if (name === this._screen) return;

    document.getElementById(`screen-${this._screen}`).classList.remove('active');
    document.getElementById(`nav-${this._screen}`).classList.remove('active');

    this._screen = name;

    document.getElementById(`screen-${name}`).classList.add('active');
    document.getElementById(`nav-${name}`).classList.add('active');

    // Lazy load screens
    if (name === 'explore')    Explore.activate();
    if (name === 'categories') Categories.render();
    if (name === 'stats')      Stats.render();
  },

  openModal(card) {
    this._modalCard = card;
    const color = catColor(card.category);

    document.getElementById('modal-emoji').textContent   = card.emoji || '⚡';
    document.getElementById('modal-title').textContent   = card.title;
    document.getElementById('modal-analogy').textContent = card.analogy || '';
    document.getElementById('modal-engineer').textContent= card.engineerTake || '';
    document.getElementById('modal-dyk').textContent     = card.didYouKnow || '';

    const tag = document.getElementById('modal-cat-tag');
    tag.textContent  = card.category;
    tag.style.background = color + '22';
    tag.style.color      = color;

    // Related topics
    const rel = document.getElementById('modal-related');
    rel.innerHTML = (card.relatedTopics || [])
      .map(t => `<button class="rel-chip">${t}</button>`)
      .join('');

    // Clear chat
    document.getElementById('chat-msgs').innerHTML = '';
    document.getElementById('chat-input').value    = '';

    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
    this._modalCard = null;
  },

  async _sendChat() {
    const card = this._modalCard;
    if (!card) return;

    const input = document.getElementById('chat-input');
    const q     = input.value.trim();
    if (!q) return;
    input.value = '';

    const msgs = document.getElementById('chat-msgs');
    msgs.innerHTML += `<div class="chat-msg user">${q}</div>`;

    const thinking = document.createElement('div');
    thinking.className = 'chat-msg thinking';
    thinking.textContent = 'Thinking…';
    msgs.appendChild(thinking);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const ctx = `Title: ${card.title}\nSummary: ${card.oneLiner}\nAnalogy: ${card.analogy}\nTechnical: ${card.engineerTake}\nFact: ${card.didYouKnow}`;
      const reply = await Gemini.deepDive(card.title, ctx, q);
      thinking.remove();
      msgs.innerHTML += `<div class="chat-msg ai">${reply}</div>`;
    } catch {
      thinking.textContent = 'Hmm, couldn\'t respond. Try again.';
    }

    msgs.scrollTop = msgs.scrollHeight;
  },

  async _share() {
    const card = this._modalCard;
    if (!card) return;
    const text = `🔬 ${card.title}\n\n${card.oneLiner}\n\n💡 ${card.analogy}\n\n—\nLearned on Flux • Tech is always changing, so are you.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Flux: ${card.title}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('📋 Copied to clipboard!', 'info');
      }
    } catch { /* user cancelled */ }
  },

  _saveModal() {
    const card = this._modalCard;
    if (!card) return;
    const isNew = Storage.saveCard(card);
    Storage.recordLearned(card.category);
    document.getElementById('streak-count').textContent = Storage.getStats().streak;
    showToast(isNew ? '✓ Card saved!' : 'Already in your collection.', 'success');
  },

  async _install() {
    if (!this._installEvent) return;
    this._installEvent.prompt();
    const res = await this._installEvent.userChoice;
    if (res.outcome === 'accepted') {
      document.getElementById('install-banner').style.display = 'none';
    }
  },

  _hideLoading() {
    const ov = document.getElementById('loading-overlay');
    // Small delay so fonts load
    setTimeout(() => {
      ov.classList.add('fade');
      setTimeout(() => ov.remove(), 400);
    }, 600);
  },
};

/* ============================================================
   Bootstrap — use DOMContentLoaded so Google Fonts loading
   doesn't block the app from starting
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => App.init());
