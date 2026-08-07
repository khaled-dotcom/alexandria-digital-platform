// التحقق من الرقم القومي المصري واستخراج البيانات منه
//
// بنية الرقم (١٤ خانة):  C YYMMDD GG SSSS T
//   C      خانة القرن (2 = مواليد 1900s، 3 = مواليد 2000s)
//   YYMMDD تاريخ الميلاد
//   GG     كود محافظة الميلاد
//   SSSS   تسلسل (الخانة ١٣ فردية = ذكر، زوجية = أنثى)
//   T      خانة أخيرة
//
// ⚠️ مهم: التحقق هنا **بنيوي** بس — بنتأكد من الشكل وتاريخ الميلاد وكود
// المحافظة. خوارزمية الخانة الأخيرة (checksum) مش موثّقة رسميًا بشكل
// معلن، فمابنطبّقهاش عشان مانرفضش أرقام صحيحة. التحقق النهائي من صحة
// الرقم وارتباطه بصاحبه محتاج ربط بـ **مصلحة الأحوال المدنية** — وده
// (غير متاح) في النسخة الحالية.

/** أكواد محافظات مصر في الرقم القومي */
export const GOVERNORATES = {
  '01': 'القاهرة',        '02': 'الإسكندرية',   '03': 'بورسعيد',
  '04': 'السويس',         '11': 'دمياط',        '12': 'الدقهلية',
  '13': 'الشرقية',        '14': 'القليوبية',    '15': 'كفر الشيخ',
  '16': 'الغربية',        '17': 'المنوفية',     '18': 'البحيرة',
  '19': 'الإسماعيلية',    '21': 'الجيزة',       '22': 'بني سويف',
  '23': 'الفيوم',         '24': 'المنيا',       '25': 'أسيوط',
  '26': 'سوهاج',          '27': 'قنا',          '28': 'أسوان',
  '29': 'الأقصر',         '31': 'البحر الأحمر', '32': 'الوادي الجديد',
  '33': 'مطروح',          '34': 'شمال سيناء',   '35': 'جنوب سيناء',
  '88': 'خارج الجمهورية',
};

/** بيحوّل الأرقام العربية-الهندية (٠١٢) لأرقام لاتينية (012) */
export function normalizeDigits(input) {
  return String(input ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))  // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))  // ۰-۹ (فارسية)
    .replace(/\D/g, '');
}

/**
 * يتحقق من الرقم القومي ويستخرج بياناته.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function parseNationalId(raw) {
  const id = normalizeDigits(raw);

  if (!id) return { ok: false, error: 'اكتب الرقم القومي.' };
  if (id.length !== 14) {
    return { ok: false, error: `الرقم القومي لازم يكون ١٤ رقم (انت كتبت ${id.length}).` };
  }

  const century = { 2: 1900, 3: 2000 }[id[0]];
  if (!century) {
    return { ok: false, error: 'الرقم القومي غير صحيح — يجب أن يبدأ بالرقم ٢ أو ٣.' };
  }

  const year = century + Number(id.slice(1, 3));
  const month = Number(id.slice(3, 5));
  const day = Number(id.slice(5, 7));

  if (month < 1 || month > 12) {
    return { ok: false, error: 'الرقم القومي غير صحيح — شهر الميلاد غير سليم.' };
  }

  // نتحقق إن التاريخ حقيقي (مش ٣١ فبراير مثلاً)
  const date = new Date(Date.UTC(year, month - 1, day));
  const realDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!realDate) {
    return { ok: false, error: 'الرقم القومي غير صحيح — تاريخ الميلاد غير سليم.' };
  }

  if (date.getTime() > Date.now()) {
    return { ok: false, error: 'الرقم القومي غير صحيح — تاريخ الميلاد يقع في المستقبل.' };
  }

  const govCode = id.slice(7, 9);
  const governorate = GOVERNORATES[govCode];
  if (!governorate) {
    return { ok: false, error: 'الرقم القومي غير صحيح — رمز المحافظة غير سليم.' };
  }

  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 86400_000));
  if (age < 16) {
    return { ok: false, error: 'الخدمة متاحة لمن أتم ١٦ سنة.' };
  }
  if (age > 120) {
    return { ok: false, error: 'الرقم القومي غير صحيح — تاريخ الميلاد موغل في القِدَم.' };
  }

  return {
    ok: true,
    value: {
      nationalId: id,
      birthDate: date.toISOString().slice(0, 10),
      age,
      gender: Number(id[12]) % 2 === 1 ? 'male' : 'female',
      birthGovernorate: governorate,
    },
  };
}

/** إخفاء جزئي للعرض: 2985••••••1234 */
export function maskNationalId(id) {
  const n = normalizeDigits(id);
  if (n.length !== 14) return '••••';
  return `${n.slice(0, 4)}${'•'.repeat(6)}${n.slice(10)}`;
}

/** إخفاء جزئي لرقم الموبايل: 010••••567 */
export function maskPhone(phone) {
  const n = normalizeDigits(phone);
  if (n.length < 7) return '••••';
  return `${n.slice(0, 3)}${'•'.repeat(n.length - 6)}${n.slice(-3)}`;
}
