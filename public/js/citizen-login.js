// دخول المواطن بالرقم القومي + كود التحقق
import { api, el, loadMeta, fillSelect, showAlert, hideAlert } from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

let nationalId = '';
let phone = '';
let countdownTimer = null;

/** بيحوّل الأرقام العربية-الهندية للاتينية وبيشيل أي حاجة تانية */
function digitsOnly(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

// الحقول الرقمية بتتنضّف وانت بتكتب
for (const id of ['nationalId', 'phone', 'code']) {
  $(id).addEventListener('input', (e) => {
    const clean = digitsOnly(e.target.value);
    if (e.target.value !== clean) e.target.value = clean;
  });
}

// الأحياء للتسجيل الأول
try {
  const meta = await loadMeta();
  fillSelect($('district'), meta.districts, { placeholder: '— اختار الحي —' });
} catch { /* الصفحة تشتغل من غيرها */ }

// ── طلب الكود ────────────────────────────────────────────────────────────
async function requestCode() {
  hideAlert(alertBox);

  nationalId = digitsOnly($('nationalId').value);
  phone = digitsOnly($('phone').value);

  if (nationalId.length !== 14) {
    showAlert(alertBox, 'الرقم القومي لازم يكون ١٤ رقم.');
    return;
  }

  const btn = $('requestBtn');
  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'spinner' }), 'جاري الإرسال...');

  try {
    const result = await api('/api/citizen/otp/request', {
      method: 'POST',
      body: JSON.stringify({ nationalId, phone: phone || undefined }),
    });

    $('sentTo').textContent = result.phone;
    $('stepId').classList.add('hidden');
    $('stepCode').classList.remove('hidden');
    markStep(2);

    // أول تسجيل → بنطلب الاسم والحي
    $('nameField').classList.toggle('hidden', !result.isNewAccount);
    $('districtField').classList.toggle('hidden', !result.isNewAccount);

    // في التطوير السيرفر بيرجّع الكود عشان التجربة من غير SMS
    if (result.devCode) {
      const box = $('devCodeBox');
      box.textContent = `وضع التطوير — الكود: ${result.devCode}`;
      box.classList.remove('hidden');
      $('code').value = result.devCode;
    }

    startCountdown(result.expiresIn ?? 300);
    $('code').focus();
  } catch (err) {
    showAlert(alertBox, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ابعت كود التحقق';
  }
}

function startCountdown(seconds) {
  clearInterval(countdownTimer);
  let left = seconds;

  const tick = () => {
    if (left <= 0) {
      clearInterval(countdownTimer);
      $('countdown').textContent = 'الكود انتهت صلاحيته — ارجع واطلب كود جديد.';
      return;
    }
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, '0');
    $('countdown').textContent = `الكود صالح لمدة ${m}:${s}`;
    left--;
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ── تأكيد الكود ──────────────────────────────────────────────────────────
async function verifyCode() {
  hideAlert(alertBox);

  const code = digitsOnly($('code').value);
  if (code.length !== 6) {
    showAlert(alertBox, 'الكود لازم يكون ٦ أرقام.');
    return;
  }

  const btn = $('verifyBtn');
  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'spinner' }), 'جاري التأكيد...');

  try {
    await api('/api/citizen/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        nationalId,
        code,
        phone: phone || undefined,
        name: $('name').value.trim() || undefined,
        district: $('district').value || undefined,
      }),
    });

    clearInterval(countdownTimer);
    const next = new URLSearchParams(location.search).get('next');
    window.location.href = next && next.startsWith('/') ? next : '/my';
  } catch (err) {
    showAlert(alertBox, err.message);
    btn.disabled = false;
    btn.textContent = 'تأكيد الدخول';
  }
}

/** بيلوّن مؤشر الخطوات فوق الكارت (١ الرقم القومي ← ٢ الكود) */
function markStep(n) {
  const steps = document.querySelectorAll('#authSteps .step');
  steps.forEach((step, i) => step.classList.toggle('on', i < n));
}

$('requestBtn').addEventListener('click', requestCode);
$('verifyBtn').addEventListener('click', verifyCode);

$('backBtn').addEventListener('click', () => {
  clearInterval(countdownTimer);
  $('stepCode').classList.add('hidden');
  $('stepId').classList.remove('hidden');
  markStep(1);
  hideAlert(alertBox);
});

// Enter بينقل للخطوة اللي بعدها
$('nationalId').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('phone').focus(); });
$('phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') requestCode(); });
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyCode(); });

// لو مسجّل دخول خلاص، نوديه على حسابه
try {
  const me = await api('/api/citizen/me');
  if (me.citizen) window.location.href = '/my';
} catch { /* عادي */ }
