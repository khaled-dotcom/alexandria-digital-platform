import { api, el, showAlert, hideAlert } from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');
const btn = $('loginBtn');

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertBox);

  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'spinner' }), 'جاري الدخول...');

  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('username').value,
        password: $('password').value,
      }),
    });

    // كل دور بيوصل لمكانه المناسب: الأدمن لإدارة النظام، المحافظ
    // للوحة التنفيذية، والباقي (عمليات يومية) للداش بورد
    const dest = user.role === 'admin' ? '/admin'
      : user.role === 'governor' ? '/governor'
      : '/dashboard';
    window.location.href = dest;
  } catch (err) {
    showAlert(alertBox, err.message);
    btn.disabled = false;
    btn.textContent = 'دخول';
  }
});
