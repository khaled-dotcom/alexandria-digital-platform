// رفع الصور — multer + فحص magic bytes (مش الامتداد بس)
import multer from 'multer';
import { mkdirSync, readSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UPLOAD_DIR = join(ROOT, 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, randomUUID() + (ALLOWED[file.mimetype] ?? '.bin')),
});

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      cb(new Error('نوع الملف غير مدعوم — ارفع صورة JPG أو PNG أو WebP فقط.'));
      return;
    }
    cb(null, true);
  },
}).single('photo');

/**
 * فحص أول بايتات الملف للتأكد إنه صورة حقيقية.
 * ده بيمنع رفع ملف نصي/سكربت متسمّي .jpg.
 */
export function isRealImage(filePath) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 12) return false;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    // WebP: "RIFF" .... "WEBP"
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true;

    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** حذف صورة بأمان — الاسم بيتقيّد جوّه مجلد uploads بس */
export function deletePhoto(photoPath) {
  if (!photoPath) return;
  const name = basename(photoPath);
  if (!name || name !== photoPath.replace(/^\/?uploads\//, '')) return;
  if (!['.jpg', '.png', '.webp'].includes(extname(name))) return;
  try {
    unlinkSync(join(UPLOAD_DIR, name));
  } catch {
    // الملف مش موجود أصلًا — عادي
  }
}
