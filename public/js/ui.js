// طبقة التفاعل المشتركة — الثيم · التوست · لوحة الأوامر · الهيدر · معلم الصفحة
// بتتحمّل في كل صفحة وبتشتغل لوحدها من غير إعداد.

import { pageBanner, LANDMARK_PHOTOS, ILLO_CORNICHE, ILLO_LIBRARY, ILLO_LIGHTHOUSE } from './marks.js';

// ═══ ١. الثيم (دارك/لايت) ═══════════════════════════════════════════════

const THEME_KEY = 'alx-theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) ?? 'auto';
}

export function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(THEME_KEY);
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  updateThemeButton();
}

/** الترتيب: تلقائي ← فاتح ← داكن ← تلقائي */
export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  applyTheme(next);

  const labels = { auto: 'الثيم يتبع النظام', light: 'الوضع الفاتح', dark: 'الوضع الداكن' };
  toast(labels[next], { icon: next === 'dark' ? '🌙' : next === 'light' ? '☀️' : '🖥️' });
}

const THEME_ICONS = {
  auto: '<path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  dark: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
};

function updateThemeButton() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;

  const theme = getTheme();
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">${THEME_ICONS[theme]}</svg>`;
  btn.setAttribute('aria-label', { auto: 'الثيم: تلقائي', light: 'الثيم: فاتح', dark: 'الثيم: داكن' }[theme]);
  btn.title = btn.getAttribute('aria-label');
}

// ═══ ٢. التوست ══════════════════════════════════════════════════════════

let toastHost = null;

function ensureToastHost() {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  return toastHost;
}

const TOAST_ICONS = { success: '✅', error: '⚠️', warn: '⚡', info: 'ℹ️' };

/**
 * إشعار عائم.
 * @param {string} message
 * @param {{type?: 'info'|'success'|'error'|'warn', title?: string, icon?: string, duration?: number}} options
 */
export function toast(message, options = {}) {
  const { type = 'info', title, icon, duration = 4200 } = options;
  const host = ensureToastHost();

  const node = document.createElement('div');
  node.className = `toast toast-${type}`;

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.textContent = icon ?? TOAST_ICONS[type];

  const body = document.createElement('div');
  body.className = 'toast-body';
  if (title) {
    const t = document.createElement('div');
    t.className = 'toast-title';
    t.textContent = title;
    body.append(t);
  }
  body.append(document.createTextNode(message));

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'إغلاق');

  const dismiss = () => {
    node.classList.add('leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };

  close.addEventListener('click', dismiss);
  node.append(iconEl, body, close);
  host.append(node);

  if (duration > 0) setTimeout(dismiss, duration);
  return dismiss;
}

export const toastSuccess = (m, o) => toast(m, { ...o, type: 'success' });
export const toastError = (m, o) => toast(m, { ...o, type: 'error', duration: 6500 });

// ═══ ٣. لوحة الأوامر (Ctrl+K) ═══════════════════════════════════════════

const COMMANDS = [
  { label: 'بلّغ عن مشكلة', hint: 'إنشاء بلاغ جديد', icon: '📝', href: '/' },
  { label: 'احجز موعد', hint: 'موعد في مقر الحي', icon: '📅', href: '/appointments' },
  { label: 'حسابي', hint: 'طلباتي ومواعيدي', icon: '👤', href: '/my' },
  { label: 'تابع بلاغك', hint: 'بالرقم المرجعي', icon: '🔍', href: '/track' },
  { label: 'دخول المواطنين', hint: 'بالرقم القومي', icon: '🆔', href: '/citizen-login' },
  { label: 'دخول الموظفين', hint: 'لموظفي المحافظة', icon: '🔐', href: '/login' },
  { label: 'تبديل الثيم', hint: 'فاتح / داكن / تلقائي', icon: '🌓', action: cycleTheme },
];

let palette = null;
let paletteIndex = 0;

function buildPalette() {
  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
      <div class="palette-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="ابحث عن صفحة أو أمر..." aria-label="ابحث" autocomplete="off">
        <kbd>Esc</kbd>
      </div>
      <ul class="palette-list" role="listbox"></ul>
    </div>`;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });
  document.body.append(overlay);
  return overlay;
}

function renderPaletteList(query = '') {
  const list = palette.querySelector('.palette-list');
  const q = query.trim().toLowerCase();

  const matches = COMMANDS.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
  );

  paletteIndex = 0;
  list.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement('li');
    empty.className = 'palette-empty';
    empty.textContent = 'مفيش نتايج';
    list.append(empty);
    return;
  }

  for (const [i, cmd] of matches.entries()) {
    const li = document.createElement('li');
    li.className = 'palette-item' + (i === 0 ? ' active' : '');
    li.setAttribute('role', 'option');
    li.dataset.index = String(i);

    li.innerHTML = `<span class="palette-icon"></span>
      <span class="palette-text"><span class="palette-label"></span>
      <span class="palette-hint"></span></span>`;

    li.querySelector('.palette-icon').textContent = cmd.icon;
    li.querySelector('.palette-label').textContent = cmd.label;
    li.querySelector('.palette-hint').textContent = cmd.hint;

    li.addEventListener('click', () => runCommand(cmd));
    li.addEventListener('mouseenter', () => {
      list.querySelector('.active')?.classList.remove('active');
      li.classList.add('active');
      paletteIndex = i;
    });

    list.append(li);
  }
}

function runCommand(cmd) {
  closePalette();
  if (cmd.action) cmd.action();
  else if (cmd.href) window.location.href = cmd.href;
}

export function openPalette() {
  if (!palette) palette = buildPalette();

  palette.classList.add('open');
  const input = palette.querySelector('input');
  input.value = '';
  renderPaletteList();
  requestAnimationFrame(() => input.focus());

  input.oninput = () => renderPaletteList(input.value);
  input.onkeydown = (e) => {
    const items = [...palette.querySelectorAll('.palette-item')];
    if (!items.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[paletteIndex]?.classList.remove('active');
      paletteIndex = e.key === 'ArrowDown'
        ? (paletteIndex + 1) % items.length
        : (paletteIndex - 1 + items.length) % items.length;
      items[paletteIndex].classList.add('active');
      items[paletteIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[paletteIndex]?.click();
    }
  };
}

export function closePalette() {
  palette?.classList.remove('open');
}

// ═══ ٤. التشغيل التلقائي ════════════════════════════════════════════════

function initHeader() {
  // ظل الهيدر عند التمرير
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // قائمة الموبايل
  const toggle = document.getElementById('navToggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    // اقفلها لما تضغط على لينك
    nav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') nav.classList.remove('open');
    });
  }

  document.getElementById('themeBtn')?.addEventListener('click', cycleTheme);
  document.getElementById('paletteBtn')?.addEventListener('click', openPalette);
}

// ═══ ٥. معلم الصفحة ═════════════════════════════════════════════════════

const LANDMARK_NAMES = {
  qaitbay: 'قلعة قايتباي',
  bibliotheca: 'مكتبة الإسكندرية',
  pharos: 'منارة الإسكندرية · فاروس',
  stanley: 'كوبري ستانلي',
  montaza: 'قصر المنتزه',
  pompey: 'عمود السواري',
  amphitheatre: 'المسرح الروماني · كوم الدكة',
};

/**
 * بيملّى شريط المعلم اللي محجوز مكانه في الـ HTML.
 * الـ div موجود أصلاً بارتفاعه عشان مايحصلش قفزة في التخطيط (CLS).
 */
function initBanner() {
  const slot = document.querySelector('.page-banner[data-landmark]');
  if (!slot) return;

  const key = slot.dataset.landmark;
  const tmp = document.createElement('div');
  tmp.innerHTML = pageBanner(key);

  // انقل جوّه العنصر الموجود بدل ما تستبدله — الارتفاع محجوز من الأول
  slot.append(...tmp.firstElementChild.childNodes);

  const name = LANDMARK_NAMES[key];
  if (name) {
    const caption = document.createElement('span');
    caption.className = 'banner-caption';
    caption.textContent = name;
    slot.append(caption);
  }

  // صورة حقيقية للمعلم لو متاحة — راجع LANDMARK_PHOTOS في marks.js
  const photo = LANDMARK_PHOTOS[key];
  if (photo) {
    slot.classList.add('has-photo');
    slot.style.setProperty('--hero-photo-url', `url('/img/landmarks/${photo.file}')`);

    const credit = document.createElement('a');
    credit.className = 'photo-credit';
    credit.href = '/credits';
    credit.textContent = `📷 ${photo.author} · ${photo.license}`;
    slot.append(credit);
  }
}

/** أي عنصر عليه data-illo بياخد رسمة توضيحية فوق نصه. */
const ILLOS = { corniche: ILLO_CORNICHE, library: ILLO_LIBRARY, lighthouse: ILLO_LIGHTHOUSE };

function initIllustrations() {
  for (const box of document.querySelectorAll('[data-illo]')) {
    if (box.querySelector('.illo')) continue;

    const svg = ILLOS[box.dataset.illo];
    if (!svg) continue;

    const tmp = document.createElement('div');
    tmp.innerHTML = svg;
    tmp.firstElementChild.setAttribute('aria-hidden', 'true');
    box.prepend(tmp.firstElementChild);
  }
}

// ═══ ٧. اختصارات الكيبورد ═══════════════════════════════════════════════

function initShortcuts() {
  addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K → لوحة الأوامر
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette?.classList.contains('open') ? closePalette() : openPalette();
    }
    if (e.key === 'Escape') closePalette();
  });
}

/** موجة الضغط على الأزرار — بتتبع مكان الماوس */
function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--x', `${((e.clientX - r.left) / r.width) * 100}%`);
    btn.style.setProperty('--y', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
}

/** ظهور تدريجي للعناصر عند التمرير */
function initReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  // من غير IntersectionObserver مافيش طريقة نعرف إمتى العنصر بان — فنظهّر
  // الكل فورًا. الخروج من غير كده كان بيسيب المحتوى مخفي للأبد.
  if (!('IntersectionObserver' in window)) {
    for (const t of targets) t.classList.add('revealed');
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    }
    // threshold صفر = أول بكسل يبان يكفي. النسبة المئوية كانت هشّة مع
    // الأقسام الأطول من الشاشة (النموذج ٢٠٠٠px) ومع السكرول السريع.
  }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });

  for (const t of targets) io.observe(t);
}

// الثيم بيتطبّق قبل أي رسم عشان مايحصلش وميض
applyTheme(getTheme());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

function boot() {
  initHeader();
  initBanner();
  initIllustrations();
  initShortcuts();
  initRipple();
  initReveal();
  updateThemeButton();
}
