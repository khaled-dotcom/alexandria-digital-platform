import { Router } from 'express';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  requireStaff, requireSupervisor, isStaff, blockGovernor,
  districtScope, canAccessDistrict, requireDistrictAccess,
} from '../auth.js';
import { uploadPhoto, isRealImage, deletePhoto, UPLOAD_DIR } from '../upload.js';
import { validateComplaint, validateRating } from '../validate.js';
import { reverseGeocode } from '../geocode.js';
import { rateLimit } from '../rateLimit.js';
import { log } from '../logger.js';
import { slaRemaining } from '../sla.js';
import { canTransition, isValidStatus, departmentFor, DEPARTMENTS } from '../taxonomy.js';
import { classifyComplaint, enqueueClassification, isEnabled as aiEnabled } from '../ai.js';
import {
  createComplaint, addAttachment, getAttachments, listComplaints,
  getComplaintByRef, getComplaintById, getStatusHistory, changeStatus,
  assignComplaint, getAssignments, addComment, getComments,
  rateComplaint, getRating, getEscalations, findNearbyComplaints,
  markDuplicate, saveClassification, deleteComplaint, audit, queueNotification,
} from '../db.js';

export const complaintsRouter = Router();

/** بيجيب البلاغ ويتأكد إنه في نطاق حي المستخدم — بيحطه على req.complaint */
const scoped = requireDistrictAccess(getComplaintById);

const createLimiter = rateLimit({
  windowMs: Number(process.env.REPORT_RATE_WINDOW_MIN ?? 10) * 60 * 1000,
  max: Number(process.env.REPORT_RATE_MAX ?? 5),
  message: 'بلاغات كتير في وقت قصير. استنى شوية وحاول تاني.',
});

/** multer بيرمي أخطاءه بشكل خاص — نترجمها لرسائل عربية واضحة */
function handleUpload(req, res, next) {
  uploadPhoto(req, res, (err) => {
    if (!err) { next(); return; }
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'حجم الصورة أكبر من ٨ ميجا.'
      : err.message || 'حصلت مشكلة في رفع الصورة.';
    res.status(400).json({ error: msg });
  });
}

// ── إنشاء بلاغ (عام) ─────────────────────────────────────────────────────
complaintsRouter.post('/', createLimiter, handleUpload, async (req, res, next) => {
  const cleanupUpload = () => {
    if (req.file) {
      try { unlinkSync(join(UPLOAD_DIR, req.file.filename)); } catch { /* تجاهل */ }
    }
  };

  try {
    // الصورة مطلوبة من الويب، بس اختيارية من الكول سنتر
    const fromStaff = isStaff(req.user);
    if (!req.file && !fromStaff) {
      res.status(400).json({ error: 'يلزم رفع صورة توضّح المشكلة.' });
      return;
    }

    if (req.file && !isRealImage(join(UPLOAD_DIR, req.file.filename))) {
      cleanupUpload();
      res.status(400).json({ error: 'الملف المرفوع ليس صورة صالحة.' });
      return;
    }

    const check = validateComplaint(req.body);
    if (!check.ok) {
      cleanupUpload();
      res.status(400).json({ error: check.error });
      return;
    }

    const address = await reverseGeocode(check.value.lat, check.value.lng);
    const { id, ref, slaHours } = createComplaint({ ...check.value, address });

    if (req.file) addAttachment(id, req.file.filename, 'before', req.user?.id ?? null);

    audit({
      entity: 'complaint', entityId: id, action: 'create',
      userId: req.user?.id, username: req.user?.username, ip: req.ip,
      details: { ref, category: check.value.category, channel: check.value.channel },
    });

    if (check.value.reporterPhone) {
      queueNotification({
        complaintId: id,
        recipient: check.value.reporterPhone,
        channel: 'sms',
        message: `تم استلام بلاغك برقم ${ref}. تابع حالته على المنصة.`,
      });
    }

    // التصنيف الآلي في الخلفية عشان المواطن مايستناش
    if (aiEnabled()) {
      enqueueClassification(async () => {
        const result = await classifyComplaint({
          photoPath: req.file?.filename,
          description: check.value.description,
          title: check.value.title,
          category: check.value.category,
          subcategory: check.value.subcategory,
          district: check.value.district,
          address,
        });
        saveClassification(id, result);
      });
    }

    log.info('complaint.created', { id, ref, category: check.value.category, channel: check.value.channel });

    res.status(201).json({
      id, ref,
      warning: check.warning,
      sla: { responseHours: slaHours.response, resolutionHours: slaHours.resolution },
    });
  } catch (err) {
    cleanupUpload();
    next(err);
  }
});

// ── قائمة البلاغات — موظف فأعلى بس (الخريطة والاستعراض مش للمواطن) ───────
complaintsRouter.get('/', requireStaff, (req, res) => {
  const {
    status, category, subcategory, district, priority, severity,
    department, from, to, risk, breached, openOnly,
  } = req.query;

  res.json(listComplaints({
    status, category, subcategory, district, priority, severity, department,
    from, to, risk,
    breached: breached === 'true',
    openOnly: openOnly === 'true',
    isStaff: true,
    scopeDistrict: districtScope(req.user),
  }));
});

// ── تفاصيل بلاغ بالرقم المرجعي ───────────────────────────────────────────
complaintsRouter.get('/:ref', (req, res) => {
  // نجيب النسخة العامة الأول عشان نعرف الحي، وبعدين نقرر مستوى التفاصيل
  const basic = getComplaintByRef(req.params.ref);
  if (!basic) {
    res.status(404).json({ error: 'لا يوجد بلاغ بهذا الرقم المرجعي.' });
    return;
  }

  // موظف مقيّد بحي بيشوف بلاغ برّه نطاقه → بيتعامل معاه كمواطن عادي:
  // العرض العام بس، من غير بيانات المُبلِّغ ولا التعليقات الداخلية.
  const staff = isStaff(req.user) && canAccessDistrict(req.user, basic.district);
  const complaint = staff ? getComplaintByRef(req.params.ref, { isStaff: true }) : basic;

  res.json({
    ...complaint,
    attachments: getAttachments(complaint.id),
    history: getStatusHistory(complaint.id),
    comments: getComments(complaint.id, { includeInternal: staff }),
    rating: getRating(complaint.id) ?? null,
    sla: slaRemaining(complaint),
    ...(staff && {
      assignments: getAssignments(complaint.id),
      escalations: getEscalations(complaint.id),
    }),
  });
});

// ── تغيير الحالة (موظف) ──────────────────────────────────────────────────
complaintsRouter.patch('/:id/status', requireStaff, blockGovernor, scoped, (req, res) => {
  const { status, note } = req.body ?? {};
  const complaint = req.complaint;

  if (!isValidStatus(status)) {
    res.status(400).json({ error: 'حالة غير معروفة.' });
    return;
  }

  if (!canTransition(complaint.status, status)) {
    res.status(400).json({
      error: `مش ينفع تنقل البلاغ من «${complaint.status}» لـ «${status}» مباشرة.`,
    });
    return;
  }

  // الرفض لازم سبب، والرفض نفسه صلاحية مشرف
  if (status === 'rejected') {
    if (!note?.trim()) {
      res.status(400).json({ error: 'رفض البلاغ لازم يكون معاه سبب.' });
      return;
    }
    if (!['supervisor', 'manager', 'admin'].includes(req.user.role)) {
      res.status(403).json({ error: 'رفض البلاغ صلاحية مشرف أو أعلى.' });
      return;
    }
  }

  const updated = changeStatus(complaint.id, status, note, req.user.id);

  audit({
    entity: 'complaint', entityId: complaint.id, action: 'status_change',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { from: complaint.status, to: status, note },
  });

  if (complaint.reporter_phone) {
    queueNotification({
      complaintId: complaint.id,
      recipient: complaint.reporter_phone,
      channel: 'sms',
      message: `تحديث على بلاغك ${complaint.ref}: ${status}`,
    });
  }

  const { reporter_phone, reporter_name, ...safe } = updated;
  res.json(safe);
});

// ── التحويل لإدارة/فريق (مشرف) ───────────────────────────────────────────
complaintsRouter.post('/:id/assign', requireSupervisor, blockGovernor, scoped, (req, res) => {
  const { department, teamId, note } = req.body ?? {};
  const complaint = req.complaint;

  if (department && !DEPARTMENTS.some((d) => d.code === department)) {
    res.status(400).json({ error: 'هذه الإدارة غير مسجّلة.' });
    return;
  }

  assignComplaint(complaint.id, {
    departmentCode: department,
    teamId: teamId ? Number(teamId) : null,
    assignedBy: req.user.id,
    note,
  });

  // التحويل بينقل البلاغ لحالة «محوَّل» لو كان لسه في مرحلة مبكرة
  if (['new', 'under_review', 'classified'].includes(complaint.status)) {
    changeStatus(complaint.id, 'assigned', note ?? 'تم التحويل للإدارة المختصة', req.user.id);
  }

  audit({
    entity: 'complaint', entityId: complaint.id, action: 'assign',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { department, teamId, note },
  });

  res.json({ ok: true });
});

// ── التعليقات ────────────────────────────────────────────────────────────
complaintsRouter.post('/:id/comments', requireStaff, blockGovernor, scoped, (req, res) => {
  const body = String(req.body?.body ?? '').trim();
  const isInternal = req.body?.isInternal !== false;
  const complaint = req.complaint;

  if (!body) {
    res.status(400).json({ error: 'التعليق فاضي.' });
    return;
  }
  if (body.length > 2000) {
    res.status(400).json({ error: 'التعليق طويل جدًا (الحد ٢٠٠٠ حرف).' });
    return;
  }

  const id = addComment(complaint.id, { userId: req.user.id, body, isInternal });

  audit({
    entity: 'comment', entityId: id, action: 'create',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { complaintId: complaint.id, isInternal },
  });

  res.status(201).json({ id });
});

// ── تقييم المواطن (عام — بالرقم المرجعي) ─────────────────────────────────
// التقييم محمي أصلاً بشرط إن البلاغ يكون محلول وبقيد UNIQUE على البلاغ،
// فالحد هنا مجرد حماية من الإغراق مش من التزوير.
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX ?? 60),
  message: 'محاولات تقييم كتير. حاول بعدين.',
});

complaintsRouter.post('/:ref/rate', rateLimiter, (req, res) => {
  const complaint = getComplaintByRef(req.params.ref);
  if (!complaint) {
    res.status(404).json({ error: 'لا يوجد بلاغ بهذا الرقم المرجعي.' });
    return;
  }

  if (!['resolved', 'closed'].includes(complaint.status)) {
    res.status(400).json({ error: 'التقييم بيبقى متاح بعد ما البلاغ يتحل.' });
    return;
  }

  const check = validateRating(req.body ?? {});
  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }

  rateComplaint(complaint.id, check.value.stars, check.value.comment);

  // التقييم بيقفل البلاغ نهائيًا
  if (complaint.status === 'resolved') {
    changeStatus(complaint.id, 'closed', `تم الإغلاق بعد تقييم المواطن (${check.value.stars}/5)`);
  }

  audit({
    entity: 'complaint', entityId: complaint.id, action: 'rate',
    ip: req.ip, details: { stars: check.value.stars },
  });

  res.json({ ok: true });
});

// ── البلاغات المشابهة (موظف) ─────────────────────────────────────────────
complaintsRouter.get('/:id/duplicates', requireStaff, scoped, (req, res) => {
  const nearby = findNearbyComplaints(req.complaint.id, {
    radiusMeters: Number(req.query.radius ?? 150),
  });

  // البلاغات المشابهة كمان لازم تتفلتر بنطاق الحي
  res.json(
    nearby
      .filter((n) => canAccessDistrict(req.user, n.district ?? req.complaint.district))
      .map((n) => ({ ...n, distance: Math.round(n.distance) }))
  );
});

complaintsRouter.post('/:id/mark-duplicate', requireStaff, blockGovernor, scoped, (req, res) => {
  const originalId = Number(req.body?.originalId);
  const id = req.complaint.id;

  if (!originalId || originalId === id) {
    res.status(400).json({ error: 'يلزم تحديد البلاغ الأصلي.' });
    return;
  }

  const original = getComplaintById(originalId);
  if (!original) {
    res.status(404).json({ error: 'البلاغ الأصلي غير موجود.' });
    return;
  }
  // مايقدرش يربط بلاغ حيّه ببلاغ في حي تاني
  if (!canAccessDistrict(req.user, original.district)) {
    res.status(404).json({ error: 'البلاغ الأصلي غير موجود.' });
    return;
  }

  markDuplicate(id, originalId, req.user.id);

  audit({
    entity: 'complaint', entityId: id, action: 'mark_duplicate',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { originalId },
  });

  res.json({ ok: true });
});

// ── إعادة التحليل بالـ AI (موظف) ─────────────────────────────────────────
complaintsRouter.post('/:id/reclassify', requireStaff, blockGovernor, scoped, async (req, res, next) => {
  if (!aiEnabled()) {
    res.status(503).json({ error: 'التصنيف الآلي غير مفعَّل. اضبط ANTHROPIC_API_KEY في ملف .env' });
    return;
  }

  const complaint = req.complaint;

  try {
    const photo = getAttachments(complaint.id).find((a) => a.kind === 'before');
    const result = await classifyComplaint({
      photoPath: photo?.file_path,
      description: complaint.description,
      title: complaint.title,
      category: complaint.category,
      subcategory: complaint.subcategory,
      district: complaint.district,
      address: complaint.address,
    });

    saveClassification(complaint.id, result);

    if (!result) {
      res.status(502).json({ error: 'التصنيف فشل. جرّب تاني بعد شوية.' });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── حذف بلاغ (مشرف) ──────────────────────────────────────────────────────
complaintsRouter.delete('/:id', requireSupervisor, blockGovernor, scoped, (req, res) => {
  const removed = deleteComplaint(req.complaint.id);
  if (!removed) {
    res.status(404).json({ error: 'البلاغ غير موجود.' });
    return;
  }

  for (const file of removed.files) deletePhoto(file);

  audit({
    entity: 'complaint', entityId: removed.id, action: 'delete',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { ref: removed.ref },
  });

  res.json({ ok: true });
});

// ── بيانات المُبلِّغ (موظف) ───────────────────────────────────────────────
complaintsRouter.get('/:id/contact', requireStaff, scoped, (req, res) => {
  const complaint = req.complaint;

  audit({
    entity: 'complaint', entityId: complaint.id, action: 'view_contact',
    userId: req.user.id, username: req.user.username, ip: req.ip,
  });

  res.json({ name: complaint.reporter_name, phone: complaint.reporter_phone });
});
