/* ============================================================
   FLUX — Swipe Manager
   Handles touch + mouse drag swipe gestures for Explore screen
   ============================================================ */

class SwipeManager {
  constructor(arenaEl, { onSwipe, onTap }) {
    this.arena    = arenaEl;
    this.onSwipe  = onSwipe;  // (direction: 'save'|'skip', cardData) => void
    this.onTap    = onTap;    // (cardData) => void
    this.threshold = 85;       // px offset to trigger a swipe
    this._active  = false;
    this._startX  = 0;
    this._startY  = 0;
    this._curX    = 0;
    this._didDrag = false;
  }

  // ------------------------------------------------------------------
  // Public: add a card to the bottom of the stack
  // ------------------------------------------------------------------
  addCard(data) {
    const el = this._buildCard(data);
    el._flux_data = data;
    // Insert at beginning so it appears behind existing cards visually
    this.arena.insertBefore(el, this.arena.firstChild);
    this._updateStack();
    return el;
  }

  // ------------------------------------------------------------------
  // Public: programmatic swipe (from button click)
  // ------------------------------------------------------------------
  programmaticSwipe(direction) {
    const top = this._topCard();
    if (!top) return;
    this._flyAway(top, direction);
  }

  // ------------------------------------------------------------------
  // Public: clear all cards
  // ------------------------------------------------------------------
  clear() {
    this.arena.innerHTML = '';
  }

  // ------------------------------------------------------------------
  // Internal: build card DOM element
  // ------------------------------------------------------------------
  _buildCard(data) {
    const el = document.createElement('div');
    el.className = 'swipe-card';

    // Compute category color for accent
    const color = this._catColor(data.category);

    el.innerHTML = `
      <div class="sc-ind save">✓ SAVE</div>
      <div class="sc-ind skip">✕ SKIP</div>

      <span class="sc-emoji">${data.emoji || '⚡'}</span>
      <div class="sc-title">${data.title}</div>
      <div class="sc-cat" style="color:${color}">${data.category}</div>

      <div class="sc-divider"></div>

      <div class="sc-section">
        <div class="sc-label">In simple words</div>
        <div class="sc-text hi">${data.oneLiner || ''}</div>
      </div>
      <div class="sc-section">
        <div class="sc-label">Real-world analogy</div>
        <div class="sc-text">${data.analogy || ''}</div>
      </div>
      <div class="sc-section">
        <div class="sc-label">Engineer's take</div>
        <div class="sc-text">${data.engineerTake || ''}</div>
      </div>
    `;

    // Subtle category top-border color
    el.style.setProperty('--card-accent', color);
    el.style.borderTopColor = color + '55';

    this._bindEvents(el);
    return el;
  }

  // ------------------------------------------------------------------
  // Internal: bind touch + mouse events
  // ------------------------------------------------------------------
  _bindEvents(el) {
    // Touch
    el.addEventListener('touchstart',  e => this._onStart(e, el), { passive: true });
    el.addEventListener('touchmove',   e => this._onMove(e, el),  { passive: false });
    el.addEventListener('touchend',    e => this._onEnd(e, el));
    el.addEventListener('touchcancel', e => this._onEnd(e, el));

    // Mouse
    el.addEventListener('mousedown',   e => this._onStart(e, el));
    el.addEventListener('mousemove',   e => this._onMove(e, el));
    el.addEventListener('mouseup',     e => this._onEnd(e, el));
    el.addEventListener('mouseleave',  e => { if (this._active) this._onEnd(e, el); });

    // Tap (open deep dive) — handled via click but only if no drag occurred
    el.addEventListener('click', () => {
      if (!this._didDrag && el._flux_data) this.onTap(el._flux_data);
    });
  }

  _getPoint(e) {
    return e.touches ? e.touches[0] : e;
  }

  _onStart(e, el) {
    if (el !== this._topCard()) return;
    const pt = this._getPoint(e);
    this._startX  = pt.clientX;
    this._startY  = pt.clientY;
    this._curX    = 0;
    this._active  = true;
    this._didDrag = false;
    el.style.transition = 'none';
  }

  _onMove(e, el) {
    if (!this._active || el !== this._topCard()) return;
    if (e.cancelable) e.preventDefault();

    const pt  = this._getPoint(e);
    const dx  = pt.clientX - this._startX;
    const dy  = pt.clientY - this._startY;
    this._curX = dx;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this._didDrag = true;

    const rot    = dx * 0.07;
    const liftY  = dy * 0.1;
    el.style.transform = `translateX(${dx}px) translateY(${liftY}px) rotate(${rot}deg)`;

    // Indicators
    const ratio = Math.min(Math.abs(dx) / this.threshold, 1);
    const saveEl = el.querySelector('.sc-ind.save');
    const skipEl = el.querySelector('.sc-ind.skip');

    if (dx > 20) {
      saveEl.style.opacity = ratio;
      skipEl.style.opacity = 0;
      el.style.boxShadow   = `0 12px 50px rgba(16,185,129,${ratio * 0.45})`;
    } else if (dx < -20) {
      skipEl.style.opacity = ratio;
      saveEl.style.opacity = 0;
      el.style.boxShadow   = `0 12px 50px rgba(239,68,68,${ratio * 0.45})`;
    } else {
      saveEl.style.opacity = 0;
      skipEl.style.opacity = 0;
      el.style.boxShadow   = '';
    }
  }

  _onEnd(e, el) {
    if (!this._active || el !== this._topCard()) return;
    this._active = false;

    if (Math.abs(this._curX) > this.threshold) {
      this._flyAway(el, this._curX > 0 ? 'save' : 'skip');
    } else {
      // Snap back with spring
      el.style.transition = 'transform .48s cubic-bezier(.175,.885,.32,1.275), box-shadow .3s ease';
      el.style.transform  = 'translateX(0) translateY(0) rotate(0deg)';
      el.style.boxShadow  = '';
      const sav = el.querySelector('.sc-ind.save');
      const ski = el.querySelector('.sc-ind.skip');
      if (sav) sav.style.opacity = 0;
      if (ski) ski.style.opacity = 0;
    }
    this._curX = 0;
  }

  _flyAway(el, direction) {
    const x   = direction === 'save' ? '140vw' : '-140vw';
    const rot = direction === 'save' ? '22deg'  : '-22deg';
    el.style.transition = 'transform .46s cubic-bezier(.55,0,1,.45)';
    el.style.transform  = `translateX(${x}) rotate(${rot})`;

    const data = el._flux_data;
    setTimeout(() => {
      el.remove();
      this._updateStack();
      this.onSwipe(direction, data);
    }, 460);
  }

  // ------------------------------------------------------------------
  // Internal: update visual stack positions
  // ------------------------------------------------------------------
  _updateStack() {
    const cards = [...this.arena.querySelectorAll('.swipe-card')].reverse(); // index 0 = top
    cards.forEach((card, i) => {
      card.style.transition = 'transform .38s cubic-bezier(.175,.885,.32,1.275), opacity .38s ease';
      card.style.zIndex     = 10 - i;

      if (i === 0) {
        card.style.transform     = 'scale(1) translateY(0)';
        card.style.opacity       = '1';
        card.style.pointerEvents = 'all';
      } else if (i === 1) {
        card.style.transform     = 'scale(0.945) translateY(16px)';
        card.style.opacity       = '0.62';
        card.style.pointerEvents = 'none';
      } else if (i === 2) {
        card.style.transform     = 'scale(0.89) translateY(32px)';
        card.style.opacity       = '0.32';
        card.style.pointerEvents = 'none';
      } else {
        card.style.opacity       = '0';
        card.style.pointerEvents = 'none';
      }
    });
  }

  _topCard() {
    const cards = this.arena.querySelectorAll('.swipe-card');
    return cards.length ? cards[cards.length - 1] : null;
  }

  cardCount() {
    return this.arena.querySelectorAll('.swipe-card').length;
  }

  _catColor(cat) {
    const map = {
      'AI & ML':            '#a855f7',
      'IoT':                '#06b6d4',
      'Computer Networks':  '#3b82f6',
      'Cybersecurity':      '#ef4444',
      'Hardware':           '#f59e0b',
      'New Inventions':     '#f97316',
      'Robotics':           '#10b981',
      'Programming':        '#6366f1',
      'The Basics':         '#14b8a6',
    };
    return map[cat] || '#4f8dff';
  }
}
