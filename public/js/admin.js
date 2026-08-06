// لوحة إدارة النظام — حسابات الموظفين وسجل التدقيق.
import {
  api, el, fillSelect, formatDate, showAlert, hideAlert,
} from './common.js';
import { toastSuccess, toastError } from './ui.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

let meta = null;
let users = [];
let editingId = null; // null = وضع الإنشاء، رقم = بيعدّل حساب موجود

// ── بوابة الدخول ──────────────────────────────────────────────────────────

async function boot() {
  const [metaRes, me] = await Promise.all([
    api('/api/stats/meta'),
    api('/api/auth/me'),
  ]);
  meta = metaRes;

  // أدمن حصرًا — مش «أدمن فأعلى». راجع requireSystemAdmin في src/auth.js
  const user = me.user;
  if (!user || user.role !== 'admin') {
    $('deniedBox').classList.remove('hidden');
    return;
  }

  $('adminBox').classList.remove('hidden');

  const chip = $('userChip');
  chip.textContent = `👤 ${user.name} — ${user.roleLabel}`;
  chip.classList.remove('hidden');

  $('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  fillSelect($('nuRole'), meta.roles.map((r) => ({ code: r.code, name: r.name })));
  fillSelect($('nuDistrict'), meta.districts, { placeholder: '— بدون —' });
  fillSelect($('nuDept'), meta.departments.map((d) => ({ code: d.code, name: d.name })), { placeholder: '— بدون —' });

  await Promise.all([loadOverview(), loadUsers()]);
}

// ── اللقطة السريعة وسجل التدقيق ──────────────────────────────────────────

const AUDIT_ACTION_LABELS = {
  login: 'دخل النظام', login_failed: 'محاولة دخول فشلت', logout: 'خرج',
  create: 'أنشأ حساب', update: 'عدّل حساب', reset_password: 'أعاد تعيين باسورد',
};

async function loadOverview() {
  const o = await api('/api/admin/overview');

  $('statUsers').textContent = o.users.total;
  $('statActive').textContent = o.users.active;
  $('statInactive').textContent = o.users.total - o.users.active;
  $('statComplaints').textContent = o.kpi.total ?? '—';

  const list = $('auditList');
  list.replaceChildren();

  if (!o.recentAudit.length) {
    list.append(el('li', { text: 'مفيش نشاط مسجّل لسه.', class: 'muted' }));
    return;
  }

  for (const row of o.recentAudit) {
    const label = AUDIT_ACTION_LABELS[row.action] ?? row.action;
    list.append(
      el('li', {}, [
        el('strong', { text: row.username ?? 'مجهول' }),
        el('span', { text: ` — ${label} ` }),
        el('span', { class: 'muted', text: formatDate(row.created_at) }),
      ])
    );
  }
}

// ── جدول الحسابات ─────────────────────────────────────────────────────────

function scopeText(u) {
  if (u.district) return `📍 ${u.district}`;
  if (u.departmentName) return `🏢 ${u.departmentName}`;
  return 'المحافظة كلها';
}

async function loadUsers() {
  users = await api('/api/admin/users');
  const body = $('usersBody');
  body.replaceChildren();

  for (const u of users) {
    const row = el('tr', {}, [
      el('td', {}, [el('strong', { text: u.name })]),
      el('td', {}, [
        el('div', { text: u.username, class: 'mono' }),
        el('div', { text: u.email ?? '—', class: 'muted', style: 'font-size:var(--t-xs)' }),
      ]),
      el('td', {}, [el('span', { class: 'badge badge-blue', text: u.roleLabel })]),
      el('td', { text: scopeText(u), class: 'muted' }),
      el('td', {}, [
        el('span', {
          class: `badge ${u.isActive ? 'badge-green' : 'badge-gray'}`,
          text: u.isActive ? 'نشط' : 'موقوف',
        }),
      ]),
      el('td', { text: u.lastLoginAt ? formatDate(u.lastLoginAt) : 'ما دخلش لسه', class: 'muted' }),
    ]);

    const actions = el('td', { class: 'row wrap', style: 'gap:6px' });

    const editBtn = el('button', { class: 'btn btn-sm btn-secondary', text: 'تعديل', type: 'button' });
    editBtn.addEventListener('click', () => openForm('edit', u));

    const resetBtn = el('button', { class: 'btn btn-sm btn-secondary', text: 'باسورد جديد', type: 'button' });
    resetBtn.addEventListener('click', () => resetPassword(u));

    const toggleBtn = el('button', {
      class: `btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}`,
      text: u.isActive ? 'إيقاف' : 'تفعيل',
      type: 'button',
    });
    toggleBtn.addEventListener('click', () => toggleActive(u));

    actions.append(editBtn, resetBtn, toggleBtn);
    row.append(actions);
    body.append(row);
  }
}

// ── إنشاء/تعديل حساب ──────────────────────────────────────────────────────

const form = $('newUserForm');

function openForm(mode, user = null) {
  editingId = mode === 'edit' ? user.id : null;
  hideAlert(alertBox);
  $('tempPasswordBox').classList.add('hidden');

  const usernameField = $('nuUsername');
  const passwordField = $('nuPassword');

  if (mode === 'edit') {
    usernameField.value = user.username;
    usernameField.disabled = true;
    passwordField.closest('.field').classList.add('hidden');
    $('nuEmail').value = user.email ?? '';
    $('nuName').value = user.name;
    $('nuRole').value = user.role;
    $('nuDistrict').value = user.district ?? '';
    $('nuDept').value = user.department ?? '';
    form.querySelector('button[type=submit]').textContent = 'حفظ التعديلات';
  } else {
    form.reset();
    usernameField.disabled = false;
    passwordField.closest('.field').classList.remove('hidden');
    form.querySelector('button[type=submit]').textContent = 'إنشاء الحساب';
  }

  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (mode === 'edit' ? $('nuName') : usernameField).focus();
}

function closeForm() {
  form.classList.add('hidden');
  form.reset();
  editingId = null;
}

$('newUserBtn').addEventListener('click', () => openForm('create'));
$('cancelNewUser').addEventListener('click', closeForm);

function showTempPassword(password, forWhom) {
  const box = $('tempPasswordBox');
  box.classList.remove('hidden');
  box.replaceChildren(
    el('div', {}, [
      el('strong', { text: `الباسورد المؤقت لـ ${forWhom} — انسخه دلوقتي، مش هيتعرض تاني: ` }),
      el('span', { class: 'mono', text: password, style: 'font-size:1.05rem;user-select:all' }),
    ])
  );
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertBox);

  const payload = {
    name: $('nuName').value.trim(),
    email: $('nuEmail').value.trim(),
    role: $('nuRole').value,
    district: $('nuDistrict').value || null,
    departmentCode: $('nuDept').value || null,
  };

  try {
    if (editingId) {
      const updated = await api(`/api/admin/users/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toastSuccess(`اتحفظ تعديل حساب ${updated.name}`);
    } else {
      payload.username = $('nuUsername').value.trim().toLowerCase();
      const password = $('nuPassword').value.trim();
      if (password) payload.password = password;

      const created = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
      toastSuccess(`اتعمل حساب ${created.name}`);
      showTempPassword(created.temporaryPassword, created.name);
    }

    closeForm();
    await loadUsers();
  } catch (err) {
    showAlert(alertBox, err.message);
  }
});

// ── إيقاف/تفعيل وإعادة تعيين الباسورد ────────────────────────────────────

async function toggleActive(u) {
  const verb = u.isActive ? 'توقيف' : 'تفعيل';
  if (!confirm(`متأكد إنك عايز ${verb} حساب «${u.name}»؟`)) return;

  try {
    await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.isActive }) });
    toastSuccess(`تم ${verb} الحساب`);
    await loadUsers();
  } catch (err) {
    toastError(err.message);
  }
}

async function resetPassword(u) {
  if (!confirm(`تعيد تعيين باسورد «${u.name}»؟ الباسورد القديم هيبطل فورًا.`)) return;

  try {
    const { temporaryPassword } = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST', body: '{}' });
    showTempPassword(temporaryPassword, u.name);
    $('tempPasswordBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    toastError(err.message);
  }
}

boot().catch((err) => showAlert(alertBox, err.message));
