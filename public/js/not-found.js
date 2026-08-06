// صفحة ٤٠٤ — بتحط رسمة المنارة فوق النص.
import { ILLO_LIGHTHOUSE } from './marks.js';

const box = document.getElementById('notFound');
if (box) {
  const illo = document.createElement('div');
  illo.innerHTML = ILLO_LIGHTHOUSE;
  illo.setAttribute('aria-hidden', 'true');
  box.prepend(illo.firstElementChild);
}
