// رسومات الإسكندرية — SVG مكتوب بالإيد، بيتحقن في الصفحات اللي محتاجاه.
// مفيش صور خارجية ولا فيديو: كله vector خفيف بيتلوّن من الـ CSS tokens.

/** علامة المنصة: فنار فاروس + موجة. أبيض على تدرّج الهيدر. */
export const BRAND_MARK = `
<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
  <path d="M16 10 3 5.5v9L16 10Z" fill="#fff" opacity=".4"/>
  <path d="M16 10 29 5.5v9L16 10Z" fill="#fff" opacity=".4"/>
  <path d="M13 13h6l1.5 13.6a1 1 0 0 1-1 1.1h-7a1 1 0 0 1-1-1.1L13 13Z" fill="#fff"/>
  <rect x="12.3" y="7.3" width="7.4" height="5.7" rx="1.4" fill="#fff"/>
  <circle cx="16" cy="10.1" r="1.7" fill="#E1A736"/>
  <path d="M16 3.3l1.2 3.1h-2.4z" fill="#fff"/>
  <path d="M4 28.4c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"
        stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>
</svg>`;

/** موجة واحدة قابلة للتكرار أفقيًا (تتكرر مرتين جوّه العنصر). */
function waveTile(d, fill, opacity) {
  return `<svg viewBox="0 0 1440 120" preserveAspectRatio="none" fill="${fill}"
               opacity="${opacity}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

const WAVE_D = {
  front: 'M0 60c120-30 240-30 360 0s240 30 360 0 240-30 360 0 240 30 360 0v60H0V60Z',
  mid:   'M0 48c160 36 320 36 480 0s320-36 480 0 320 36 480 0v72H0V48Z',
  back:  'M0 70c180-24 300 24 480 24s300-48 480-48 300 48 480 24v50H0V70Z',
};

/** ثلاث طبقات موج بسرعات مختلفة — كل طبقة فيها البلاطة مرتين عشان التكرار سلس. */
export const HERO_WAVES = `
<div class="hero-waves" aria-hidden="true">
  <div class="hero-wave-layer hero-wave-3">
    ${waveTile(WAVE_D.back, '#0A3F58', '.5').repeat(2)}
  </div>
  <div class="hero-wave-layer hero-wave-2">
    ${waveTile(WAVE_D.mid, '#0E5C7A', '.7').repeat(2)}
  </div>
  <div class="hero-wave-layer hero-wave-1">
    ${waveTile(WAVE_D.front, '#0C6577', '1').repeat(2)}
  </div>
</div>`;

/** شريط موج فاصل بين الأقسام. */
export const WAVE_BAND = `
<div class="wave-band" aria-hidden="true">
  <div class="tiles">${waveTile(WAVE_D.mid, 'currentColor', '.14').repeat(2)}</div>
</div>`;

/** نورس — بيتحرك عرض الشاشة. */
const GULL = `
<svg viewBox="0 0 40 16" fill="none" stroke="currentColor" width="100%"
     stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
  <path class="bird-flap" d="M2 10c5 0 7-6 10-6s4 6 8 6"/>
  <path class="bird-flap" d="M20 10c4 0 6-5 9-5s4 5 8 5" opacity=".7"/>
</svg>`;

/** بيولّد نوارس بمواقع/سرعات عشوائية جوّه الهيرو.
    الحجم بيتظبط بالـ width مش بالـ transform عشان مايتعاركش مع أنيميشن الطيران. */
export function seagulls(count = 4) {
  let html = '';
  for (let i = 0; i < count; i++) {
    const top = 10 + Math.random() * 32;
    const dur = 26 + Math.random() * 22;
    const delay = -Math.random() * 30;
    const w = 20 + Math.random() * 22;
    html += `<span class="hero-bird" style="top:${top.toFixed(1)}%;` +
      ` animation-duration:${dur.toFixed(0)}s; animation-delay:${delay.toFixed(0)}s;` +
      ` width:${w.toFixed(0)}px; color:rgba(255,255,255,.7)">${GULL}</span>`;
  }
  return html;
}

/** نجوم للسما في الوضع الداكن. */
export function stars(count = 40) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<span class="star" style="top:${(Math.random() * 45).toFixed(1)}%;
      inset-inline-start:${(Math.random() * 100).toFixed(1)}%;
      animation-delay:${(Math.random() * 3).toFixed(1)}s;
      opacity:${(0.3 + Math.random() * 0.7).toFixed(2)}"></span>`;
  }
  return `<div class="hero-stars" aria-hidden="true">${html}</div>`;
}

// ═══ معالم الإسكندرية — واحد لكل صفحة ════════════════════════════════════
// كلها viewBox "0 0 360 170" وقاعدتها عند y=170 عشان تتبدّل مكان بعض.

/** صف شرفات (مرلونات) فوق حائط — بيتكرر في القلعة والأسوار. */
function merlons(x, y, width, count, h = 9) {
  const step = width / count;
  const w = step * 0.56;
  let d = '';
  for (let i = 0; i < count; i++) {
    d += `M${(x + i * step + (step - w) / 2).toFixed(1)} ${y}h${w.toFixed(1)}v${-h}h${(-w).toFixed(1)}z`;
  }
  return `<path d="${d}"/>`;
}

/** نافذة مقوّسة (شقّ دفاعي أو شباك) */
function archWindow(x, y, w, h) {
  const r = w / 2;
  return `<path d="M${x} ${y + h}v${-(h - r)}a${r} ${r} 0 0 1 ${w} 0v${h - r}z" fill="#000" opacity=".22"/>`;
}

/** نخلة */
function palm(x, baseY, h, flip = 1) {
  return `<g transform="translate(${x} ${baseY}) scale(${flip} 1)">
    <path d="M0 0v${-h}c0-3 1-5 2-5s2 2 2 5V0z"/>
    <path d="M2 ${-h}c-9-9-20-12-28-9 7-8 20-6 28 4 4-12 15-18 24-15-9 3-16 10-19 20z"/>
    <path d="M2 ${-h}c-12-4-22-1-27 6 1-11 15-16 27-11z"/>
    <path d="M2 ${-h}c11-6 21-4 26 3-2-11-15-15-26-9z"/>
  </g>`;
}

const svgWrap = (inner) =>
  `<svg viewBox="0 0 360 170" fill="currentColor" aria-hidden="true" focusable="false"
        preserveAspectRatio="xMidYMax meet">${inner}</svg>`;

const PARTS = {
  /** قلعة قايتباي — الحصن المملوكي مكان الفنار القديم */
  qaitbay: (`
    <path d="M18 170v-46h324v46z"/>
    ${merlons(18, 124, 324, 22)}
    <path d="M8 170V88h48v82z"/>${merlons(8, 88, 48, 4)}
    <path d="M304 170V88h48v82z"/>${merlons(304, 88, 48, 4)}
    <path d="M124 170V58h112v112z"/>${merlons(124, 58, 112, 8)}
    <path d="M166 58V20h16v38z"/>
    <path d="M160 20h28v-5h-28z"/>
    <path d="M174 2l10 14h-20z"/>
    ${archWindow(146, 84, 14, 30)}${archWindow(186, 84, 14, 30)}
    ${archWindow(24, 112, 12, 24)}${archWindow(324, 112, 12, 24)}
    <path d="M166 170v-28a14 14 0 0 1 28 0v28z" fill="#000" opacity=".28"/>`),

  /** مكتبة الإسكندرية — القرص المائل والكرة السماوية */
  bibliotheca: (`
    <path d="M22 170v-26c0-58 62-104 142-104 52 0 98 20 126 52v78z"/>
    <g stroke="#000" stroke-opacity=".16" stroke-width="2.4" fill="none">
      <path d="M40 158c6-44 58-78 122-78 44 0 82 16 106 40"/>
      <path d="M60 164c8-34 52-60 106-60 38 0 70 13 90 32"/>
      <path d="M84 170c10-24 44-44 86-44 32 0 60 11 78 26"/>
      <path d="M112 170c10-14 34-26 62-26 24 0 44 8 58 18"/>
      <path d="M164 170V40M212 170V46M116 170V62M258 170V70"/>
    </g>
    <path d="M22 170v-14h268v14z" opacity=".8"/>
    <circle cx="316" cy="146" r="24"/>
    <path d="M292 170h48v6h-48z" opacity=".7"/>
    <g stroke="#000" stroke-opacity=".2" stroke-width="1.6" fill="none">
      <path d="M292 146h48M316 122v48M298 130c12 8 24 8 36 0M298 162c12-8 24-8 36 0"/>
    </g>`),

  /** فنار فاروس — برج نحيل عالي بطوابقه الثلاثة: مربع ثم مثمّن ثم أسطواني */
  pharos: (`
    <!-- الرصيف -->
    <path d="M112 170v-10h136v10z"/>
    <!-- الطابق المربع: عالي وجوانبه شبه رأسية (ده اللي بيميّزه عن الهرم المدرّج) -->
    <path d="M128 160 140 82h80l12 78z"/>
    <!-- كورنيش بارز يفصل المربع عن المثمّن -->
    <path d="M134 82h92v-8h-92z"/>
    <!-- الطابق المثمّن -->
    <path d="M146 74 152 42h56l6 32z"/>
    <!-- كورنيش تاني -->
    <path d="M148 42h64v-6h-64z"/>
    <!-- الطابق الأسطواني -->
    <path d="M162 36 165 22h30l3 14z"/>
    <!-- غرفة النار -->
    <path d="M160 22h40v-8h-40z"/>
    <circle cx="180" cy="9" r="5" fill="#E1A736"/>
    <!-- أحزمة أفقية بتوضّح ارتفاع كل طابق -->
    <g stroke="#000" stroke-opacity=".2" stroke-width="2.5" fill="none">
      <path d="M132 132h96M136 106h88M150 60h60"/>
    </g>
    <!-- المنحدر الحلزوني اللي كانت الدواب بتطلع عليه -->
    <g stroke="#000" stroke-opacity=".15" stroke-width="2" fill="none">
      <path d="M129 150 231 144M133 120 227 114"/>
    </g>
    ${archWindow(148, 108, 12, 22)}${archWindow(200, 108, 12, 22)}
    ${archWindow(174, 50, 12, 18)}
    ${palm(52, 170, 40)}${palm(320, 170, 34, -1)}
    <path d="M14 170c0-11 18-17 34-17v17z" opacity=".5"/>
    <path d="M292 170c0-8 14-13 26-13v13z" opacity=".4"/>`),

  /** كوبري ستانلي — الأبراج الأربعة فوق السطح والأقواس تحته */
  stanley: (`
    <!-- الأبراج الأربعة بقبابها البصلية، واقفة فوق السطح -->
    <g>
      <path d="M46 118V58h18v60z"/><ellipse cx="55" cy="58" rx="13" ry="11"/><path d="M55 40l4 8h-8z"/>
      <path d="M116 118V58h18v60z"/><ellipse cx="125" cy="58" rx="13" ry="11"/><path d="M125 40l4 8h-8z"/>
      <path d="M226 118V58h18v60z"/><ellipse cx="235" cy="58" rx="13" ry="11"/><path d="M235 40l4 8h-8z"/>
      <path d="M296 118V58h18v60z"/><ellipse cx="305" cy="58" rx="13" ry="11"/><path d="M305 40l4 8h-8z"/>
    </g>
    <g fill="#000" opacity=".2">
      ${archWindow(50, 78, 10, 20)}${archWindow(120, 78, 10, 20)}
      ${archWindow(230, 78, 10, 20)}${archWindow(300, 78, 10, 20)}
    </g>

    <!-- السطح -->
    <path d="M0 118h360v13H0z"/>

    <!-- الأرجل النازلة للميّة -->
    <path d="M0 131h24v25H0zM44 131h22v25H44zM114 131h22v25h-22z
             M224 131h22v25h-22zM294 131h22v25h-22zM336 131h24v25h-24z"/>

    <!-- الحشوات فوق الأقواس: الجزء المصمت بين السطح وبطن القوس -->
    <path d="M66 131h48v11a24 10 0 0 1-48 0z"/>
    <path d="M136 131h88v16a44 13 0 0 1-88 0z"/>
    <path d="M246 131h48v11a24 10 0 0 1-48 0z"/>
    <path d="M24 131h20v8a10 6 0 0 1-20 0z"/>
    <path d="M316 131h20v8a10 6 0 0 1-20 0z"/>

    <!-- الميّة -->
    <g opacity=".5">
      <path d="M0 156c18 0 18 5 36 5s18-5 36-5 18 5 36 5 18-5 36-5 18 5 36 5 18-5 36-5
               18 5 36 5 18-5 36-5 18 5 36 5 18-5 36-5v14H0z"/>
    </g>`),

  /** قصر المنتزه — برج الساعة على الطراز الفلورنسي */
  montaza: (`
    <path d="M60 170V96h240v74z"/>
    <path d="M148 96V34h58v62z"/>
    <path d="M142 34h70v-9h-70z"/>
    <path d="M177 2l22 23h-44z"/>
    <circle cx="177" cy="60" r="12" fill="#000" opacity=".24"/>
    <g>${[86, 116, 232, 262].map((x) => archWindow(x, 118, 16, 34)).join('')}</g>
    <g>${[158, 186].map((x) => archWindow(x, 118, 12, 30)).join('')}</g>
    <path d="M60 96h240v-8H60z"/>
    <path d="M40 170v-46h20v46zM300 170v-46h20v46z"/>
    ${palm(24, 170, 44)}${palm(340, 170, 40, -1)}
    <path d="M0 164h360v6H0z" opacity=".35"/>`),

  /** عمود السواري — أطول عمود جرانيتي منفرد في العالم */
  pompey: (`
    <path d="M158 170v-16h44v16z"/>
    <path d="M150 154v-10h60v10z"/>
    <path d="M164 144V38h32v106z"/>
    <path d="M156 38h48v11h-48z"/>
    <path d="M150 27h60v11h-60z"/>
    <path d="M164 27c0-8 5-14 16-14s16 6 16 14z" opacity=".7"/>
    <g opacity=".8">
      <path d="M62 170v-20c0-9 7-16 16-16s16 7 16 16v20z"/>
      <path d="M78 134c-6-6-4-14 2-16 5-2 10 2 10 8z"/>
      <path d="M266 170v-20c0-9 7-16 16-16s16 7 16 16v20z"/>
      <path d="M282 134c-6-6-4-14 2-16 5-2 10 2 10 8z"/>
    </g>
    <path d="M0 170h360v0z"/>
    <g opacity=".45">
      <path d="M20 170v-32h14v32zM326 170v-28h14v28z"/>
    </g>`),

  /** المسرح الروماني بكوم الدكة — المدرجات الرخامية نصف الدائرية */
  amphitheatre: (`
    <!-- رواق الأعمدة الرومانية على الجدار الخلفي -->
    <g>
      <path d="M54 108V44h13v64zM94 108V44h13v64zM134 108V44h13v64z
               M213 108V44h13v64zM253 108V44h13v64zM293 108V44h13v64z"/>
      <path d="M48 44h25v-9H48zM88 44h25v-9H88zM128 44h25v-9h-25z
               M207 44h25v-9h-25zM247 44h25v-9h-25zM287 44h25v-9h-25z"/>
      <path d="M44 35h116v-7H44zM203 35h116v-7H203z" opacity=".8"/>
      <!-- تخانة العمود بخط داخلي -->
      <g stroke="#000" stroke-opacity=".18" stroke-width="2" fill="none">
        <path d="M60 108V44M100 108V44M140 108V44M219 108V44M259 108V44M299 108V44"/>
      </g>
      <!-- قاعدة الرواق -->
      <path d="M40 108h124v9H40zM199 108h124v9H199z"/>
    </g>

    <!-- المدرجات: حلقات مصمتة بينها فراغ ظاهر عشان الدرجات تبان درجات -->
    <g>
      <path d="M28 168a152 62 0 0 1 304 0h-20a132 54 0 0 0-264 0z"/>
      <path d="M54 168a126 51 0 0 1 252 0h-20a106 43 0 0 0-212 0z" opacity=".9"/>
      <path d="M80 168a100 40 0 0 1 200 0h-20a80 32 0 0 0-160 0z" opacity=".8"/>
      <path d="M106 168a74 29 0 0 1 148 0h-20a54 21 0 0 0-108 0z" opacity=".7"/>
    </g>
    <!-- السلالم الشعاعية اللي بتقسم المدرجات (scalaria) — هي اللي بتخلّيه
         يتقري كمسرح مش كدواير متداخلة -->
    <g stroke="#000" stroke-opacity=".28" stroke-width="4" stroke-linecap="round" fill="none">
      <path d="M180 148V106"/>
      <path d="M143 152 112 116M217 152 248 116"/>
      <path d="M116 160 62 132M244 160 298 132"/>
    </g>
    <!-- الأوركسترا (دايرة الأداء الرخامية) -->
    <path d="M132 168a48 19 0 0 1 96 0z" opacity=".55"/>
    <path d="M0 168h360v2H0z" opacity=".35"/>`),
};

/** كل معلم كـ SVG مستقل جاهز للاستعمال لوحده. */
export const LANDMARKS = Object.fromEntries(
  Object.entries(PARTS).map(([key, inner]) => [key, svgWrap(inner)])
);

/**
 * أفق الإسكندرية — المعالم مركّبة جنب بعض من الغرب للشرق:
 * قايتباي · عمود السواري · المكتبة · فنار فاروس · كوبري ستانلي · قصر المنتزه
 *
 * كل معلم مرسوم في صندوق ٣٦٠×١٧٠ قاعدته عند y=170، فبنحطه بـ
 * translate(x, 200 - 170·s) scale(s) عشان كل القواعد تقع على نفس خط الأرض.
 */
const GROUND = 200;
const place = (key, x, s) =>
  `<g transform="translate(${x} ${(GROUND - 170 * s).toFixed(1)}) scale(${s})">${PARTS[key]}</g>`;

export const SKYLINE = `
<svg viewBox="0 0 1440 200" fill="currentColor" aria-hidden="true" focusable="false"
     preserveAspectRatio="xMidYMax meet">
  ${place('qaitbay', 20, 0.62)}
  ${place('pompey', 250, 0.5)}
  ${place('bibliotheca', 400, 0.72)}
  ${place('pharos', 630, 1)}
  ${place('stanley', 980, 0.68)}
  ${place('montaza', 1230, 0.55)}
</svg>`;

/**
 * شعاع الفنار — طبقة منفصلة بنفس إحداثيات الأفق عشان تدور بالـ CSS.
 * فانوس فاروس في PARTS عند (180, 6)؛ مع translate(630, 30) scale(1)
 * بيبقى مركزه (810, 36) في إحداثيات الأفق.
 */
export const LIGHTHOUSE_BEAM = `
<svg viewBox="0 0 1440 200" fill="none" aria-hidden="true" focusable="false"
     preserveAspectRatio="xMidYMax meet">
  <defs>
    <linearGradient id="alxBeam" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%"   stop-color="#FFE9B0" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#FFE9B0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="lighthouse-beam" style="transform-origin: 810px 36px">
    <path d="M810 36 670 -130h280L810 36Z" fill="url(#alxBeam)"/>
  </g>
</svg>`;

/**
 * صور حقيقية لمعالم الإسكندرية — من Wikimedia Commons برخص CC-BY/CC-BY-SA،
 * محمّلة محليًا (public/img/landmarks) لأن الـ CSP بيمنع مصادر خارجية.
 * «فاروس» مالوش صورة حقيقية عن قصد — الفنار الأصلي مش موجود يتصوّر،
 * فصفحة track.html فضلت بالرسمة المرسومة بس، أصدق من صورة بديلة مش دقيقة.
 */
export const LANDMARK_PHOTOS = {
  qaitbay:      { file: 'qaitbay.jpg',      author: 'Ahmed Younis Sif Saad', license: 'CC BY-SA 4.0' },
  bibliotheca:  { file: 'bibliotheca.jpg',  author: 'Ahmed Hagrasi',  license: 'CC BY-SA 4.0' },
  stanley:      { file: 'stanley.jpg',      author: 'Ahmad Ali',      license: 'CC BY 2.0' },
  montaza:      { file: 'montaza.jpg',      author: 'Daniel Mayer',   license: 'CC BY-SA 4.0' },
  pompey:       { file: 'pompey.jpg',       author: 'Daniel Mayer',   license: 'CC BY-SA 4.0' },
  amphitheatre: { file: 'amphitheatre.jpg', author: 'ISAW (NYU)',      license: 'CC BY 2.0' },
  corniche:     { file: 'corniche.jpg',     author: 'Abdelrhman 1990', license: 'CC BY-SA 4.0' },
};

/**
 * شريط زخرفي أعلى الصفحة: بحر + معلم من معالم المدينة + موج.
 * ديكور خالص — aria-hidden وما بيحملش أي معنى للقارئ الشاشي.
 */
export function pageBanner(key = 'pharos') {
  const landmark = LANDMARKS[key] ?? LANDMARKS.pharos;
  return `
<div class="page-banner hero-sea" aria-hidden="true">
  <span class="hero-sun"></span>
  <div class="banner-landmark">${landmark}</div>
  ${HERO_WAVES}
  ${seagulls(2)}
</div>`;
}

// ═══ رسومات الحالات الفارغة ══════════════════════════════════════════════

/** كورنيش فاضي — لما مفيش بلاغات. */
export const ILLO_CORNICHE = `
<svg class="illo" viewBox="0 0 240 150" fill="none" aria-hidden="true" focusable="false">
  <path class="float-slow accent-1" d="M96 96V60l40 36H96Z" fill="currentColor" opacity=".5"/>
  <path class="float-slow" d="M78 96l8-16h64l8 16H78Z" fill="currentColor" opacity=".35"/>
  <g class="mini-wave" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".45">
    <path d="M20 112c14 0 14 8 28 8s14-8 28-8 14 8 28 8 14-8 28-8 14 8 28 8 14-8 28-8"/>
    <path d="M20 128c14 0 14 8 28 8s14-8 28-8 14 8 28 8 14-8 28-8 14 8 28 8 14-8 28-8" opacity=".6"/>
  </g>
  <g class="accent-3" fill="currentColor">
    <circle cx="196" cy="34" r="14" opacity=".7"/>
  </g>
  <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".4">
    <path d="M40 46c4 0 5-4 8-4s4 4 7 4"/>
    <path d="M62 32c3 0 4-3 6-3s3 3 5 3"/>
  </g>
</svg>`;

/** مكتبة/أرشيف فاضي — لما مفيش طلبات أو مواعيد. */
export const ILLO_LIBRARY = `
<svg class="illo" viewBox="0 0 240 150" fill="none" aria-hidden="true" focusable="false">
  <path class="accent-1" d="M40 118V96c0-30 26-52 62-52 24 0 44 10 56 26v48H40Z"
        fill="currentColor" opacity=".22"/>
  <g stroke="currentColor" stroke-width="2.5" fill="none" opacity=".5">
    <path d="M52 112c3-24 24-42 52-42 20 0 36 8 46 20"/>
    <path d="M66 118c3-16 18-30 40-30 15 0 27 6 35 14"/>
    <path d="M102 118V60M132 118V70"/>
  </g>
  <path d="M32 118h176v8H32z" fill="currentColor" opacity=".4"/>
  <g class="accent-3 float-slow" fill="currentColor">
    <path d="M186 60l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z"/>
  </g>
  <g class="mini-wave" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".3">
    <path d="M30 138c14 0 14 7 28 7s14-7 28-7 14 7 28 7 14-7 28-7 14 7 28 7 14-7 28-7"/>
  </g>
</svg>`;

/** فنار — للأخطاء وشاشة ٤٠٤. */
export const ILLO_LIGHTHOUSE = `
<svg class="illo" viewBox="0 0 240 160" fill="none" aria-hidden="true" focusable="false">
  <g class="accent-3" fill="currentColor" opacity=".28">
    <path d="M120 34 62 4h116l-58 30Z"/>
  </g>
  <path d="M104 126 112 52h16l8 74h-32Z" fill="currentColor" opacity=".5"/>
  <path d="M110 52h20v-14h-20z" fill="currentColor" opacity=".65"/>
  <circle class="accent-3" cx="120" cy="45" r="6" fill="currentColor"/>
  <path d="M120 24l4 8h-8l4-8Z" fill="currentColor" opacity=".6"/>
  <path d="M92 126h56v8H92z" fill="currentColor" opacity=".45"/>
  <g class="mini-wave" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".4">
    <path d="M24 140c14 0 14 8 28 8s14-8 28-8 14 8 28 8 14-8 28-8 14 8 28 8 14-8 28-8"/>
  </g>
</svg>`;
