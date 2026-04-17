const express = require('express');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { stmts, DATA_DIR, STORAGE_DIR } = require('../db');
const { requireUser } = require('../middleware/auth');
const { nowIso } = require('../utils/common');
const {
  formatPlan,
  formatSubscription,
  getEffectivePlanForUser,
  enforceFileCountLimit
} = require('../services/plan-service');
const { redeemMembershipCode } = require('../services/billing-service');
const {
  normalizeFolderPath,
  escapeLikeValue,
  formatShare,
  buildFolderTree,
  storeWorkspaceFile,
  countPdfPages,
  fileRecordToJson,
  deleteWorkspaceFileRecord,
  getUserStorageUsageBytes,
  ensureQuotaAvailable,
  normalizeUploadedFiles,
  sanitizeFilename,
  withPdfExtension
} = require('../services/workspace-service');

const router = express.Router();

function parseEditorPresetRows(rows = []) {
  return rows
    .map((row) => {
      try {
        return {
          name: String(row.name || "").trim(),
          config: JSON.parse(row.config_json || "{}")
        };
      } catch (_error) {
        return null;
      }
    })
    .filter((item) => item && item.name && item.config && typeof item.config === 'object');
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '上传请求过于频繁,请稍后再试' }
});

const upload = multer({
  dest: path.join(DATA_DIR, 'temp'),
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.get('/api/workspace/account', requireUser, async (req, res) => {
  res.json({
    user: req.user,
    entitlements: getEffectivePlanForUser(req.user.id),
    plans: stmts.listPlans.all().map(formatPlan).filter((plan) => plan.active),
    subscriptions: stmts.listSubscriptionsByUser.all(req.user.id).map(formatSubscription),
    editorPresets: parseEditorPresetRows(stmts.listEditorPresetsByUser.all(req.user.id))
  });
});

router.get('/api/workspace/editor-presets', requireUser, async (req, res) => {
  res.json({
    presets: parseEditorPresetRows(stmts.listEditorPresetsByUser.all(req.user.id))
  });
});

router.post('/api/workspace/editor-presets', requireUser, express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const config = req.body.config;
    if (!name) {
      return res.status(400).json({ error: '预设名称不能为空。' });
    }
    if (name.length > 30) {
      return res.status(400).json({ error: '预设名称不能超过 30 个字符。' });
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: '预设配置格式不正确。' });
    }
    const now = nowIso();
    stmts.upsertEditorPreset.run(req.user.id, name, JSON.stringify(config), now, now);
    return res.json({
      ok: true,
      presets: parseEditorPresetRows(stmts.listEditorPresetsByUser.all(req.user.id))
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '保存预设失败。' });
  }
});

router.delete('/api/workspace/editor-presets/:name', requireUser, async (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: '预设名称不能为空。' });
  }
  stmts.deleteEditorPresetForUser.run(req.user.id, name);
  res.json({
    ok: true,
    presets: parseEditorPresetRows(stmts.listEditorPresetsByUser.all(req.user.id))
  });
});

router.get('/api/workspace/files', requireUser, async (req, res) => {
  const folder = normalizeFolderPath(String(req.query.folder || req.query.folderPath || ''));
  const scope = String(req.query.scope || 'direct').toLowerCase();
  const view = String(req.query.view || 'active').toLowerCase();

  let rows = [];
  if (view === 'trash') {
    rows = stmts.listDeletedFilesByUser.all(req.user.id);
  } else if (folder && scope === 'tree') {
    rows = stmts.listFilesByUserInPath.all(req.user.id, folder, `${escapeLikeValue(folder)}/%`);
  } else if (folder) {
    rows = stmts.listFilesByUserAndFolder.all(req.user.id, folder);
  } else {
    rows = stmts.listFilesByUser.all(req.user.id);
  }

  const files = rows.map(fileRecordToJson);
  const usedBytes = await getUserStorageUsageBytes(req.user.id);
  const entitlements = getEffectivePlanForUser(req.user.id);
  const folderPaths = stmts.listFoldersByUser.all(req.user.id).map((row) => row.folder_path);

  res.json({
    files,
    folders: folderPaths,
    folderTree: buildFolderTree(folderPaths),
    currentFolder: folder,
    currentView: view,
    usedBytes,
    quotaBytes: Math.max(1, Number(entitlements.storageQuotaMb || 0)) * 1024 * 1024,
    entitlements,
    shares: stmts.listSharesByUser.all(req.user.id).map((row) => formatShare(row)),
    trashCount: Number(stmts.listDeletedFilesByUser.all(req.user.id).length || 0)
  });
});

router.post('/api/workspace/upload', uploadLimiter, requireUser, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请先上传至少一个文件。' });
    }

    await normalizeUploadedFiles(req.files);
    const totalIncoming = req.files.reduce((sum, file) => sum + file.size, 0);
    await ensureQuotaAvailable(req.user.id, totalIncoming);
    enforceFileCountLimit(req.user.id, req.files.length);

    const savedFiles = [];
    for (const file of req.files) {
      const saved = await storeWorkspaceFile(req.user.id, file.originalname, file.buffer, {
        mimeType: file.mimetype || 'application/pdf',
        pageCount: countPdfPages(file.buffer),
        kind: String(file.mimetype || '').includes('zip') ? 'zip' : 'pdf',
        source: 'upload',
        folderPath: req.body.folderPath || req.body.folderName || ''
      });
      const row = stmts.getFileForUser.get(saved.id, req.user.id);
      savedFiles.push(fileRecordToJson(row));
    }

    return res.status(201).json({ files: savedFiles });
  } catch (error) {
    return res.status(400).json({ error: error.message || '文件上传失败。' });
  }
});

router.patch('/api/workspace/files/:id', requireUser, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const file = stmts.getAnyFileForUser.get(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在。' });
    }

    let nextName = String(req.body.originalName || file.original_name).trim();
    const nextFolder = normalizeFolderPath(
      req.body.folderPath ?? req.body.folderName ?? file.folder_path ?? file.folder_name ?? ''
    );
    if (!nextName) {
      return res.status(400).json({ error: '文件名不能为空。' });
    }

    nextName =
      file.kind === 'zip'
        ? `${sanitizeFilename(nextName, file.original_name).replace(/\.zip$/i, '')}.zip`
        : withPdfExtension(nextName, file.original_name);

    stmts.updateFileMetadata.run(nextName, nextFolder, nextFolder, fileId, req.user.id);
    return res.json({ file: fileRecordToJson(stmts.getAnyFileForUser.get(fileId, req.user.id)) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '文件更新失败。' });
  }
});

router.delete('/api/workspace/files/:id', requireUser, async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const file = stmts.getAnyFileForUser.get(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在。' });
    }

    if (String(req.query.mode || '') === 'purge') {
      await deleteWorkspaceFileRecord(file);
      return res.json({ ok: true, purged: true });
    }

    stmts.trashFileForUser.run(nowIso(), req.user.id, fileId, req.user.id);
    return res.json({ ok: true, trashed: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || '文件删除失败。' });
  }
});

router.delete('/api/workspace/trash', requireUser, async (req, res) => {
  try {
    const rows = stmts.listDeletedFilesByUser.all(req.user.id);
    for (const row of rows) {
      await deleteWorkspaceFileRecord({ ...row, user_id: req.user.id });
    }
    return res.json({ ok: true, purgedCount: rows.length });
  } catch (error) {
    return res.status(400).json({ error: error.message || '清空回收站失败。' });
  }
});

router.get('/api/workspace/files/:id/content', requireUser, async (req, res) => {
  const file = stmts.getAnyFileForUser.get(Number(req.params.id), req.user.id);
  if (!file) {
    return res.status(404).json({ error: '文件不存在。' });
  }

  const absolutePath = path.join(STORAGE_DIR, String(req.user.id), file.stored_name);
  return res.sendFile(absolutePath, {
    headers: {
      'Content-Type': file.mime_type
    }
  });
});

router.post('/api/workspace/files/:id/restore', requireUser, async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const file = stmts.getAnyFileForUser.get(fileId, req.user.id);
    if (!file || !file.deleted_at) {
      return res.status(404).json({ error: '回收站里没有这个文件。' });
    }

    stmts.restoreFileForUser.run(fileId, req.user.id);
    return res.json({
      ok: true,
      file: fileRecordToJson(stmts.getAnyFileForUser.get(fileId, req.user.id))
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '文件恢复失败。' });
  }
});

router.post('/api/workspace/redeem', requireUser, express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const result = redeemMembershipCode(req.user.id, req.body.code);
    return res.json({
      ok: true,
      message: `成功兑换 ${result.plan.name} ${result.redemption.duration_days} 天会员！`
    });
  } catch (error) {
    const message = error.message || '兑换失败。';
    const status =
      message === '兑换码不存在。'
        ? 404
        : message.includes('已过期') || message.includes('已达到使用次数上限')
          ? 400
          : 400;
    return res.status(status).json({ error: message });
  }
});

module.exports = router;
