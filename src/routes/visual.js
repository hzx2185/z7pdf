const express = require('express');

const { stmts } = require('../db');
const { requireUser } = require('../middleware/auth');
const { upload, cleanupUploadedFiles } = require('../middleware/upload');
const {
  getEffectivePlanForUser,
  getEffectivePlanForGuest,
  getGuestUsageInfo,
  assertGuestQuotaForExport,
  assertRecipeAllowed,
  enforceFileCountLimit
} = require('../services/plan-service');
const {
  normalizeUploadedFiles,
  sanitizeFilename,
  withPdfExtension,
  countPdfPages,
  getUserStorageUsageBytes,
  ensureQuotaAvailable,
  storeWorkspaceFile,
  replaceWorkspaceFileContent,
  fileRecordToJson
} = require('../services/workspace-service');
const { buildAttachmentDisposition } = require('../services/pdf-service');
const { visualEditPdf } = require('../services/visual-service');
const { nowIso } = require('../utils/common');

const router = express.Router();

function sendPdf(res, bytes, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', buildAttachmentDisposition(filename, 'download.pdf'));
  return res.send(Buffer.from(bytes));
}

function sendZip(res, bytes, filename) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', buildAttachmentDisposition(filename, 'download.zip'));
  return res.send(Buffer.from(bytes));
}

function parseRecipe(bodyRecipe) {
  try {
    return JSON.parse(String(bodyRecipe || '{}'));
  } catch (_error) {
    throw new Error('编辑配置格式不正确。');
  }
}

router.post('/api/workspace/visual-save', requireUser, upload.array('files', 20), cleanupUploadedFiles, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请先上传至少一个 PDF 文件。' });
    }

    await normalizeUploadedFiles(req.files);
    const recipe = parseRecipe(req.body.recipe);
    const plan = getEffectivePlanForUser(req.user.id);
    assertRecipeAllowed(recipe, plan);

    const result = await visualEditPdf(req.files, recipe);
    const defaultName =
      result.kind === 'zip'
        ? 'workspace_split_result.zip'
        : req.files.length === 1
          ? withPdfExtension(req.files[0].originalname, 'workspace_saved.pdf')
          : 'workspace_result.pdf';
    const rawName = String(req.body.saveName || '').trim() || defaultName;
    const originalName =
      result.kind === 'zip'
        ? rawName.toLowerCase().endsWith('.zip')
          ? sanitizeFilename(rawName, defaultName)
          : `${sanitizeFilename(rawName, 'workspace_split_result')}.zip`
        : withPdfExtension(rawName, defaultName);
    const overwriteFileId = Number(req.body.overwriteFileId || 0);
    const resultBytes = Buffer.from(result.bytes);
    const saveOptions = {
      mimeType: result.kind === 'zip' ? 'application/zip' : 'application/pdf',
      pageCount: result.kind === 'zip' ? 0 : countPdfPages(result.bytes),
      kind: result.kind === 'zip' ? 'zip' : 'pdf',
      source: overwriteFileId > 0 ? 'visual-save-overwrite' : 'visual-save',
      folderPath: req.body.folderPath || req.body.folderName || ''
    };

    if (overwriteFileId > 0) {
      const target = stmts.getFileForUser.get(overwriteFileId, req.user.id);
      if (!target) {
        return res.status(404).json({ error: '要覆盖的原文件不存在。' });
      }
      if (target.kind !== 'pdf') {
        return res.status(400).json({ error: '只有 PDF 文件支持覆盖保存。' });
      }
      if (result.kind !== 'pdf') {
        return res.status(400).json({ error: '拆分导出或 ZIP 结果不能覆盖原文件。' });
      }

      const used = await getUserStorageUsageBytes(req.user.id);
      const planQuota = Math.max(1, Number(plan.storageQuotaMb || 0)) * 1024 * 1024;
      const projectedUsage = used - Number(target.size_bytes || 0) + resultBytes.length;
      if (projectedUsage > planQuota) {
        throw new Error(
          `会员空间已达到上限，当前 ${plan.name} 配额为 ${Math.round(planQuota / 1024 / 1024)} MB。`
        );
      }

      const saved = await replaceWorkspaceFileContent(target, originalName, resultBytes, saveOptions);
      return res.json({
        file: fileRecordToJson(stmts.getFileForUser.get(saved.id, req.user.id)),
        overwritten: true
      });
    }

    await ensureQuotaAvailable(req.user.id, resultBytes.length);
    enforceFileCountLimit(req.user.id, 1);
    const saved = await storeWorkspaceFile(req.user.id, originalName, resultBytes, saveOptions);
    return res.status(201).json({
      file: fileRecordToJson(stmts.getFileForUser.get(saved.id, req.user.id))
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '在线保存失败。' });
  }
});

router.post('/api/visual-workbench', upload.array('files', 20), cleanupUploadedFiles, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请先上传至少一个 PDF 文件。' });
    }

    await normalizeUploadedFiles(req.files);
    const recipe = parseRecipe(req.body.recipe);
    const plan = req.user ? getEffectivePlanForUser(req.user.id) : getEffectivePlanForGuest();
    assertRecipeAllowed(recipe, plan);

    const guestUsage = !req.user ? assertGuestQuotaForExport(req.guestId) : null;
    const result = await visualEditPdf(req.files, recipe);

    if (guestUsage) {
      stmts.incrementGuestUsage.run(req.guestId, guestUsage.usageDate, nowIso(), nowIso());
    }

    const defaultName =
      result.kind === 'zip'
        ? '编辑结果.zip'
        : req.files.length === 1
          ? withPdfExtension(req.files[0].originalname, '编辑结果.pdf')
          : '编辑结果.pdf';
    const rawName = String(req.body.saveName || '').trim() || defaultName;
    const filename =
      result.kind === 'zip'
        ? rawName.toLowerCase().endsWith('.zip')
          ? sanitizeFilename(rawName, defaultName)
          : `${sanitizeFilename(rawName, '编辑结果')}.zip`
        : withPdfExtension(rawName, defaultName);

    if (result.kind === 'zip') {
      return sendZip(res, result.bytes, filename);
    }

    return sendPdf(res, result.bytes, filename);
  } catch (error) {
    return res.status(400).json({ error: error.message || '可视化导出失败。' });
  }
});

module.exports = router;
