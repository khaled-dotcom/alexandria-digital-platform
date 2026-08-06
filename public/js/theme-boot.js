/* بيتحمّل blocking في الـ <head> عشان الثيم يتطبّق قبل أول رسم — من غير وميض.
   لازم يفضل سكربت عادي (مش module) عشان الـ modules بتتأجّل تلقائيًا. */
(function () {
  try {
    var t = localStorage.getItem('alx-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* التخزين مقفول (وضع التصفح الخاص) — نكمّل بالثيم الافتراضي */
  }
})();
