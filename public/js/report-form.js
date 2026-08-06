// صفحة البلاغ — الكاميرا + ضغط الصورة + GPS + خريطة اختيار الموقع
import { api, el, ALEX_CENTER, loadMeta, fillSelect, showAlert, hideAlert } from './common.js';

const $ = (id) => document.getElementById(id);

const form = $('reportForm');
const alertBox = $('alert');
const photoInput = $('photoInput');
const photoDrop = $('photoDrop');
const photoPreview = $('photoPreview');
const previewImg = $('previewImg');
const sizeNote = $('sizeNote');
const coordsText = $('coordsText');
const submitBtn = $('submitBtn');
const successBox = $('successBox');

/** الصورة المضغوطة الجاهزة للرفع */
let photoBlob = null;
let marker = null;

// ── الخريطة ──────────────────────────────────────────────────────────────
const map = L.map('pickerMap').setView(ALEX_CENTER, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

function setPoint(lat, lng, { fly = false } = {}) {
  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      updateCoords(p.lat, p.lng);
    });
  }

  if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
  updateCoords(lat, lng);
}

function updateCoords(lat, lng) {
  coordsText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  form.dataset.lat = lat;
  form.dataset.lng = lng;
}

map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));

// ── تحديد الموقع من GPS ──────────────────────────────────────────────────
$('locateBtn').addEventListener('click', (event) => {
  const btn = event.currentTarget;

  if (!navigator.geolocation) {
    showAlert(alertBox, 'المتصفح بتاعك مش بيدعم تحديد الموقع. حدد المكان على الخريطة بإيدك.', 'warn');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ بندوّر على موقعك...';

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setPoint(coords.latitude, coords.longitude, { fly: true });
      hideAlert(alertBox);
      btn.disabled = false;
      btn.textContent = '📍 استخدم موقعي الحالي';
    },
    (err) => {
      const messages = {
        1: 'رفضت إذن الوصول للموقع. حدد المكان على الخريطة بإيدك.',
        2: 'مش قادرين نحدد موقعك دلوقتي. حدد المكان على الخريطة بإيدك.',
        3: 'محاولة تحديد الموقع أخدت وقت طويل. حدد المكان على الخريطة بإيدك.',
      };
      showAlert(alertBox, messages[err.code] ?? messages[2], 'warn');
      btn.disabled = false;
      btn.textContent = '📍 استخدم موقعي الحالي';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// ── ضغط الصورة في المتصفح قبل الرفع ──────────────────────────────────────
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  );

  // لو الضغط طلّع حجم أكبر (صورة صغيرة أصلًا) نستخدم الأصل
  return blob && blob.size < file.size ? blob : file;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} كيلوبايت`;

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  hideAlert(alertBox);

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showAlert(alertBox, 'ارفع صورة JPG أو PNG أو WebP فقط.');
    photoInput.value = '';
    return;
  }

  try {
    photoBlob = await compressImage(file);

    previewImg.src = URL.createObjectURL(photoBlob);
    sizeNote.textContent =
      photoBlob.size < file.size
        ? `${kb(file.size)} ← ${kb(photoBlob.size)} بعد الضغط`
        : kb(photoBlob.size);

    photoDrop.classList.add('hidden');
    photoPreview.classList.remove('hidden');
  } catch {
    showAlert(alertBox, 'مش قادرين نقرا الصورة دي. جرّب صورة تانية.');
    photoInput.value = '';
  }
});

$('removePhoto').addEventListener('click', () => {
  photoBlob = null;
  photoInput.value = '';
  if (previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
  previewImg.removeAttribute('src');
  photoPreview.classList.add('hidden');
  photoDrop.classList.remove('hidden');
});

// ── الفئات والأحياء ──────────────────────────────────────────────────────
let selectedCategory = null;
let meta = null;

try {
  meta = await loadMeta();
  fillSelect($('district'), meta.districts, { placeholder: '— اختار الحي —' });
  renderCategories(meta.categories);
} catch {
  showAlert(alertBox, 'مش قادرين نحمّل بيانات المنصة. اعمل ريفريش للصفحة.');
}

/** كروت اختيار نوع المشكلة */
function renderCategories(categories) {
  const grid = $('categoryGrid');
  grid.replaceChildren();

  for (const cat of categories) {
    const card = el('button', {
      type: 'button',
      class: 'category-card',
      'data-code': cat.code,
      onclick: () => selectCategory(cat),
    }, [
      el('span', { class: 'cat-icon', text: cat.icon }),
      el('span', { class: 'cat-name', text: cat.name }),
    ]);
    grid.append(card);
  }
}

function selectCategory(cat) {
  selectedCategory = cat;

  for (const card of document.querySelectorAll('.category-card')) {
    card.classList.toggle('selected', card.dataset.code === cat.code);
  }

  const wrap = $('subcategoryWrap');
  fillSelect($('subcategory'), cat.subcategories, { placeholder: '— اختار التفاصيل —' });
  wrap.classList.remove('hidden');
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── الإرسال ──────────────────────────────────────────────────────────────
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertBox);

  if (!selectedCategory) {
    showAlert(alertBox, 'اختار نوع المشكلة الأول.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const subcategory = $('subcategory').value;
  if (!subcategory) {
    showAlert(alertBox, 'اختار تفاصيل المشكلة من القائمة.');
    $('subcategoryWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!photoBlob) {
    showAlert(alertBox, 'لازم ترفع صورة توضّح المشكلة.');
    document.querySelector('.photo-drop').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!form.dataset.lat) {
    showAlert(alertBox, 'لازم تحدد مكان المشكلة على الخريطة.');
    document.querySelector('.map-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const district = $('district').value;
  if (!district) {
    showAlert(alertBox, 'اختار الحي من القائمة.');
    return;
  }

  const subName = selectedCategory.subcategories.find((s) => s.code === subcategory)?.name ?? '';

  const data = new FormData();
  data.append('photo', photoBlob, 'complaint.jpg');
  data.append('category', selectedCategory.code);
  data.append('subcategory', subcategory);
  data.append('title', subName);
  data.append('lat', form.dataset.lat);
  data.append('lng', form.dataset.lng);
  data.append('district', district);
  data.append('severity', form.querySelector('input[name="severity"]:checked').value);
  data.append('isUrgent', $('isUrgent').checked ? 'true' : 'false');
  data.append('description', $('description').value.trim());
  data.append('reporterPhone', $('phone').value.trim());

  submitBtn.disabled = true;
  submitBtn.replaceChildren(el('span', { class: 'spinner' }), 'جاري الإرسال...');

  try {
    const result = await api('/api/complaints', { method: 'POST', body: data });

    $('successRef').textContent = result.ref;
    $('trackLink').href = `/track?ref=${encodeURIComponent(result.ref)}`;

    if (result.sla) {
      const hours = result.sla.resolutionHours;
      const when = hours < 48 ? `${hours} ساعة` : `${Math.round(hours / 24)} يوم`;
      $('successSla').textContent = `⏱ المهلة المستهدفة لحل البلاغ: ${when} — هتوصلك تحديثات على كل مرحلة.`;
    }

    if (result.warning) {
      const warn = $('successWarning');
      warn.textContent = result.warning;
      warn.classList.remove('hidden');
    }

    form.classList.add('hidden');
    successBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showAlert(alertBox, err.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'إرسال البلاغ';
  }
});

$('newReportBtn').addEventListener('click', () => window.location.reload());
