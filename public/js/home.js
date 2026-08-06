// الصفحة الرئيسية — بتحقن مشهد الإسكندرية في الهيرو وتملّى الأرقام الحيّة.
// الهيرو خلفيته صورة حقيقية للكورنيش (راجع index.html) فمش محتاجين نرسم
// أفق سلويت فوقها — بس الموج والنوارس والنجوم فضلوا كلمسة حركة حيّة.
import { HERO_WAVES, seagulls, stars } from './marks.js';
import { api, formatNumber } from './common.js';

// ═══ ١. مشهد الهيرو ══════════════════════════════════════════════════════

function paintHero() {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const scene = document.createElement('div');
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = stars(46) + HERO_WAVES + seagulls(5);

  // الطبقات بتتحط قبل المحتوى عشان النص يفضل فوقها
  hero.prepend(...scene.childNodes);

  const credit = document.createElement('a');
  credit.className = 'photo-credit';
  credit.href = '/credits';
  credit.textContent = '📷 Abdelrhman 1990 · CC BY-SA 4.0';
  hero.append(credit);
}

// ═══ ٢. الأرقام الحيّة ═══════════════════════════════════════════════════

/** عدّاد بيعدّ لحد الرقم — بيحترم تفضيل تقليل الحركة. */
function countTo(el, target, suffix = '') {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || target <= 0) {
    el.textContent = formatNumber(target) + suffix;
    return;
  }

  const duration = 900;
  const start = performance.now();

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatNumber(Math.round(target * eased)) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function loadStats() {
  const total = document.getElementById('hsTotal');
  if (!total) return;

  try {
    // ملخّص عام مبسّط بس — بدون خريطة أو تفاصيل بلاغات فردية،
    // دي محجوزة لموظفي المحافظة في /dashboard
    const s = await api('/api/stats/public-summary');

    countTo(total, s.total ?? 0);
    countTo(document.getElementById('hsResolved'), s.resolved ?? 0);
    countTo(document.getElementById('hsSla'), Math.round(Number(s.slaCompliance) || 0), '٪');

    const districts = document.getElementById('hsDistricts');
    if (districts) countTo(districts, s.districtsCovered || 10);
  } catch {
    // السيرفر مش راد — نسيب الشرطات مكانها بدل ما نعرض رقم غلط
    for (const id of ['hsTotal', 'hsResolved', 'hsSla']) {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    }
  }
}

// ═══ ٣. التمرير السلس لنموذج البلاغ ══════════════════════════════════════

function smoothAnchors() {
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // خلّي أول حقل في القسم يستقبل الكيبورد
      target.querySelector('button, [href], input, select, textarea')?.focus({ preventScroll: true });
    });
  }
}

paintHero();
loadStats();
smoothAnchors();
