// إضافة بريد إلكتروني للموظفين + مستويين جديدين في التسلسل الوظيفي:
// «مكتب المحافظة» (يشوف كل الأحياء) و«المحافظ» (لوحة تنفيذية استراتيجية).
// الأدوار نفسها ثوابت في taxonomy.js — الترحيل ده بيجهّز العمود بس.
export default {
  version: 5,
  name: 'roles_email',

  up(db) {
    db.exec(`
      ALTER TABLE users ADD COLUMN email TEXT;

      -- فريد لو موجود، لكن يسمح بـ NULL متعددة (حسابات قديمة من غير إيميل)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
    `);
  },
};
