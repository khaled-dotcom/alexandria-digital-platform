/* بيتحمّل blocking في الـ <head> عشان الثيم يتطبّق قبل أول رسم — من غير وميض.
   لازم يفضل سكربت عادي (مش module) عشان الـ modules بتتأجّل تلقائيًا. */
(function () {
  // علامة إن الجافاسكربت شغّال. الحركات اللي بتبدأ بعنصر مخفي (data-reveal)
  // متعلّقة بالكلاس ده، فلو السكربت ماشتغلش المحتوى بيظهر عادي بدل ما
  // يفضل مخفي للأبد.
  document.documentElement.classList.add('js');

  try {
    var t = localStorage.getItem('alx-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* التخزين مقفول (وضع التصفح الخاص) — نكمّل بالثيم الافتراضي */
  }
})();
