const express = require('express');
const crypto = require('crypto');
const path = require('path');

const { db, stmts, STORAGE_DIR } = require('../db');
const { requireUser } = require('../middleware/auth');
const { nowIso, hashPassword, verifyPassword } = require('../utils/common');
const { formatShare, fileRecordToJson } = require('../services/workspace-service');
const {
  enforceShareLimit,
  setShareAccessCookie,
  clearShareAccessCookie,
  hasShareCookieAccess,
  shareRequiresGate,
  isShareExpired,
  isShareDownloadLimitReached,
  sendStoredDownload
} = require('../services/share-service');

const router = express.Router();

router.get('/api/workspace/shares', requireUser, async (req, res) => {
  res.json({ shares: stmts.listSharesByUser.all(req.user.id).map((row) => formatShare(row)) });
});

router.post('/api/workspace/files/:id/share', requireUser, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const file = stmts.getFileForUser.get(Number(req.params.id), req.user.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在。' });
    }

    enforceShareLimit(req.user.id);

    const accessMode = String(req.body.accessMode || 'public').trim();
    if (!['public', 'password', 'login'].includes(accessMode)) {
      return res.status(400).json({ error: '分享访问方式仅支持 public/password/login。' });
    }

    const password = String(req.body.password || '');
    if (accessMode === 'password' && password.length < 4) {
      return res.status(400).json({ error: '密码分享至少需要 4 位访问密码。' });
    }

    const expiresAt = String(req.body.expiresAt || '').trim();
    const maxDownloads = Math.max(0, Number(req.body.maxDownloads || 0));
    const destroyAfterReading = Boolean(req.body.destroyAfterReading);
    const now = nowIso();
    const token = crypto.randomBytes(18).toString('hex');

    stmts.createShare.run(
      req.user.id,
      file.id,
      token,
      accessMode,
      accessMode === 'password' ? await hashPassword(password) : '',
      accessMode === 'public' ? '' : crypto.randomBytes(18).toString('hex'),
      expiresAt,
      maxDownloads,
      destroyAfterReading ? 1 : 0,
      now,
      now
    );

    return res.status(201).json({
      share: formatShare(stmts.getShareByToken.get(token), file)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '分享链接创建失败。' });
  }
});

router.patch('/api/workspace/shares/:id', requireUser, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const shareId = Number(req.params.id);
    const share = stmts.getShareForUser.get(shareId, req.user.id);
    if (!share) {
      return res.status(404).json({ error: '分享链接不存在。' });
    }

    const accessMode = String(req.body.accessMode || share.access_mode).trim();
    const enabled =
      req.body.enabled === undefined ? Boolean(share.enabled) : Boolean(req.body.enabled);
    const password = String(req.body.password || '');
    const expiresAt = String(req.body.expiresAt ?? share.expires_at ?? '').trim();
    const maxDownloads = Math.max(0, Number(req.body.maxDownloads ?? share.max_downloads ?? 0));
    const destroyAfterReading =
      req.body.destroyAfterReading === undefined
        ? Boolean(share.destroy_after_reading)
        : Boolean(req.body.destroyAfterReading);

    const passwordHash =
      accessMode === 'password'
        ? password
          ? await hashPassword(password)
          : share.password_hash
        : '';
    const accessKey =
      accessMode === 'public'
        ? ''
        : password || share.access_mode !== accessMode
          ? crypto.randomBytes(18).toString('hex')
          : share.access_key;

    stmts.updateShare.run(
      accessMode,
      passwordHash,
      accessKey,
      expiresAt,
      maxDownloads,
      destroyAfterReading ? 1 : 0,
      enabled ? 1 : 0,
      nowIso(),
      shareId,
      req.user.id
    );

    return res.json({ share: formatShare(stmts.getShareForUser.get(shareId, req.user.id)) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '分享更新失败。' });
  }
});

router.delete('/api/workspace/shares/:id', requireUser, async (req, res) => {
  try {
    stmts.disableShare.run(nowIso(), Number(req.params.id), req.user.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || '分享删除失败。' });
  }
});

router.delete('/api/workspace/shares/:id/permanent', requireUser, async (req, res) => {
  try {
    const shareId = Number(req.params.id);
    const share = stmts.getShareForUser.get(shareId, req.user.id);
    if (!share) {
      return res.status(404).json({ error: '分享不存在。' });
    }
    if (share.enabled) {
      return res.status(400).json({ error: '请先停用分享再删除。' });
    }

    db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(shareId, req.user.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || '删除失败。' });
  }
});

router.get('/api/workspace/shares/:id/audits', requireUser, async (req, res) => {
  try {
    const shareId = Number(req.params.id);
    const share = stmts.getShareForUser.get(shareId, req.user.id);
    if (!share) {
      return res.status(404).json({ error: '分享链接不存在。' });
    }

    return res.json({ audits: stmts.listShareAudits.all(share.id) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '获取审计日志失败。' });
  }
});

router.get('/api/workspace/files/:id/download', requireUser, async (req, res) => {
  const file = stmts.getAnyFileForUser.get(Number(req.params.id), req.user.id);
  if (!file) {
    return res.status(404).json({ error: '文件不存在。' });
  }

  const absolutePath = path.join(STORAGE_DIR, String(req.user.id), file.stored_name);
  return sendStoredDownload(res, absolutePath, file.original_name, file.mime_type);
});

router.get('/api/share/:token', async (req, res) => {
  const share = stmts.getShareByToken.get(String(req.params.token || ''));
  if (!share || !share.enabled) {
    return res.status(404).json({ error: '分享链接不存在或已失效。' });
  }
  if (isShareExpired(share)) {
    clearShareAccessCookie(res, share.token);
    return res.status(410).json({ error: '分享链接已过期。' });
  }
  if (isShareDownloadLimitReached(share)) {
    return res.status(410).json({ error: '分享链接下载次数已达上限。' });
  }

  const file = stmts.getFileById.get(share.file_id);
  if (!file || file.deleted_at) {
    return res.status(404).json({ error: '源文件已不存在。' });
  }

  const allowed =
    share.access_mode === 'public' ||
    (share.access_mode === 'login' && req.user) ||
    (share.access_mode === 'password' && hasShareCookieAccess(req, share));

  stmts.logShareAudit.run(share.id, 'view', req.ip || '', req.get('User-Agent') || '', nowIso());

  return res.json({
    share: {
      ...formatShare(share, file),
      requiresAccess: shareRequiresGate(share) && !allowed,
      file: fileRecordToJson(file)
    }
  });
});

router.post('/api/share/:token/access', express.json({ limit: '512kb' }), async (req, res) => {
  const share = stmts.getShareByToken.get(String(req.params.token || ''));
  if (!share || !share.enabled) {
    return res.status(404).json({ error: '分享链接不存在或已失效。' });
  }
  if (isShareExpired(share)) {
    return res.status(410).json({ error: '分享链接已过期。' });
  }

  if (share.access_mode === 'login') {
    if (!req.user) {
      return res.status(401).json({ error: '此分享仅限登录会员访问。' });
    }
    setShareAccessCookie(res, share.token, share.access_key);
    return res.json({ ok: true });
  }

  if (share.access_mode === 'password') {
    const password = String(req.body.password || '');
    if (!(await verifyPassword(password, share.password_hash))) {
      return res.status(401).json({ error: '访问密码不正确。' });
    }
    setShareAccessCookie(res, share.token, share.access_key);
    return res.json({ ok: true });
  }

  return res.json({ ok: true });
});

router.get('/api/share/:token/download', async (req, res) => {
  const share = stmts.getShareByToken.get(String(req.params.token || ''));
  if (!share || !share.enabled) {
    return res.status(404).json({ error: '分享链接不存在或已失效。' });
  }
  if (isShareExpired(share)) {
    clearShareAccessCookie(res, share.token);
    return res.status(410).json({ error: '分享链接已过期。' });
  }
  if (isShareDownloadLimitReached(share)) {
    return res.status(410).json({ error: '分享链接下载次数已达上限。' });
  }
  if (share.access_mode === 'login' && !req.user) {
    return res.status(401).json({ error: '此分享仅限登录会员访问。' });
  }
  if (share.access_mode === 'password' && !hasShareCookieAccess(req, share)) {
    return res.status(401).json({ error: '请先输入访问密码。' });
  }

  const file = stmts.getFileById.get(share.file_id);
  if (!file || file.deleted_at) {
    return res.status(404).json({ error: '源文件已不存在。' });
  }

  const now = nowIso();
  stmts.logShareAudit.run(share.id, 'download', req.ip || '', req.get('User-Agent') || '', now);
  stmts.incrementShareDownload.run(now, share.id);
  if (share.destroy_after_reading) {
    stmts.disableShare.run(now, share.id, share.user_id);
  }

  const absolutePath = path.join(STORAGE_DIR, String(file.user_id), file.stored_name);
  return sendStoredDownload(res, absolutePath, file.original_name, file.mime_type);
});

module.exports = router;
