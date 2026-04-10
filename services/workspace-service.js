const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const { db, stmts, STORAGE_DIR } = require('../db');
const { nowIso } = require('../utils/common');
const { getEffectivePlanForUser } = require('./plan-service');

function sanitizeFolderName(name = '') {
  return String(name)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 80);
}

function normalizeFolderPath(input = '') {
  const segments = String(input || '')
    .split('/')
    .map((segment) => sanitizeFolderName(segment))
    .filter(Boolean);
  return segments.join('/');
}

function escapeLikeValue(input) {
  return String(input).replace(/[\\%_]/g, '\\$&');
}

function formatShare(row, currentFile = null) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fileId: row.file_id,
    token: row.token,
    accessMode: row.access_mode,
    expiresAt: row.expires_at,
    maxDownloads: Number(row.max_downloads || 0),
    downloadCount: Number(row.download_count || 0),
    destroyAfterReading: Boolean(row.destroy_after_reading),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    fileName: currentFile?.original_name || row.original_name || '',
    shareUrl: `/share.html?token=${encodeURIComponent(row.token)}`
  };
}

function buildFolderTree(paths = []) {
  const root = [];
  const nodeMap = new Map();

  paths.filter(Boolean).forEach((folderPath) => {
    const parts = String(folderPath).split('/').filter(Boolean);
    let parentPath = '';
    let level = root;
    parts.forEach((part) => {
      const currentPath = parentPath ? `${parentPath}/${part}` : part;
      if (!nodeMap.has(currentPath)) {
        const node = { name: part, path: currentPath, children: [] };
        nodeMap.set(currentPath, node);
        level.push(node);
      }
      const node = nodeMap.get(currentPath);
      level = node.children;
      parentPath = currentPath;
    });
  });

  return root;
}

async function ensureUserStorageDir(userId) {
  const userDir = path.join(STORAGE_DIR, String(userId));
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

async function storeWorkspaceFile(userId, originalName, bytes, options = {}) {
  const userDir = await ensureUserStorageDir(userId);
  const storedName = `${Date.now()}-${crypto.randomUUID()}.bin`;
  const absolutePath = path.join(userDir, storedName);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await fs.writeFile(absolutePath, buffer);
  const folderPath = normalizeFolderPath(options.folderPath || options.folderName || '');

  stmts.insertFile.run(
    userId,
    originalName,
    folderPath,
    folderPath,
    storedName,
    options.mimeType || 'application/pdf',
    buffer.length,
    Number(options.pageCount || 0),
    options.kind || 'pdf',
    options.source || 'upload',
    nowIso()
  );

  return {
    id: Number(db.prepare('SELECT last_insert_rowid() AS id').get().id),
    originalName,
    storedName,
    sizeBytes: buffer.length
  };
}

async function replaceWorkspaceFileContent(file, originalName, bytes, options = {}) {
  const userDir = await ensureUserStorageDir(file.user_id);
  const storedName = `${Date.now()}-${crypto.randomUUID()}.bin`;
  const absolutePath = path.join(userDir, storedName);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const folderPath = normalizeFolderPath(
    options.folderPath || options.folderName || file.folder_path || file.folder_name || ''
  );

  await fs.writeFile(absolutePath, buffer);

  stmts.updateWorkspaceFileContent.run(
    originalName,
    folderPath,
    folderPath,
    storedName,
    options.mimeType || file.mime_type || 'application/pdf',
    buffer.length,
    Number(options.pageCount || 0),
    options.kind || file.kind || 'pdf',
    options.source || 'visual-save-overwrite',
    file.id,
    file.user_id
  );

  if (file.stored_name && file.stored_name !== storedName) {
    const previousPath = path.join(userDir, file.stored_name);
    await fs.rm(previousPath, { force: true });
  }

  return {
    id: Number(file.id),
    originalName,
    storedName,
    sizeBytes: buffer.length
  };
}

function countPdfPages(buffer) {
  try {
    const text = Buffer.isBuffer(buffer)
      ? buffer.toString('latin1')
      : Buffer.from(buffer).toString('latin1');
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 0;
  } catch (_error) {
    return 0;
  }
}

function decodeUploadedFilename(name, fallback = 'document.pdf') {
  const raw = String(name || fallback).trim() || fallback;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    if (!decoded) {
      return raw;
    }

    const containsCjk = (value) => /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(value);
    if (containsCjk(decoded) && !containsCjk(raw)) {
      return decoded;
    }

    const rawReadable = (raw.match(/[\p{L}\p{N}]/gu) || []).length;
    const decodedReadable = (decoded.match(/[\p{L}\p{N}]/gu) || []).length;
    const rawReplacement = (raw.match(/�/g) || []).length;
    const decodedReplacement = (decoded.match(/�/g) || []).length;

    if (decodedReplacement > 0 && rawReplacement === 0) {
      return raw;
    }

    if (decodedReadable >= rawReadable) {
      return decoded;
    }
  } catch (_error) {
    return raw;
  }

  return raw;
}

async function normalizeUploadedFiles(files = []) {
  for (const file of files) {
    if (file && typeof file.originalname === 'string') {
      file.originalname = decodeUploadedFilename(file.originalname, 'document.pdf');
    }
    if (file && !file.buffer && file.path) {
      file.buffer = await fs.readFile(file.path);
    }
  }
  return files;
}

function getDisplayFilename(name, fallback = 'document.pdf') {
  return decodeUploadedFilename(name, fallback);
}

function fileRecordToJson(file) {
  if (!file) {
    return null;
  }

  const folderPath = file.folder_path || file.folder_name || '';
  return {
    id: file.id,
    originalName: getDisplayFilename(file.original_name),
    folderName: folderPath,
    folderPath,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    pageCount: file.page_count,
    kind: file.kind,
    source: file.source,
    createdAt: file.created_at,
    deletedAt: file.deleted_at || '',
    downloadUrl: `/api/workspace/files/${file.id}/download`,
    contentUrl: `/api/workspace/files/${file.id}/content`
  };
}

async function deleteWorkspaceFileRecord(file) {
  const absolutePath = path.join(STORAGE_DIR, String(file.user_id), file.stored_name);
  await fs.rm(absolutePath, { force: true });
  stmts.deleteFileForUser.run(file.id, file.user_id);
}

async function getUserStorageUsageBytes(userId) {
  return Number(stmts.storageByUser.get(userId)?.total || 0);
}

async function ensureQuotaAvailable(userId, incomingBytes) {
  const used = await getUserStorageUsageBytes(userId);
  const plan = getEffectivePlanForUser(userId);
  const quota = Math.max(1, Number(plan.storageQuotaMb || 0)) * 1024 * 1024;
  if (used + incomingBytes > quota) {
    throw new Error(`会员空间已达到上限，当前 ${plan.name} 配额为 ${Math.round(quota / 1024 / 1024)} MB。`);
  }
  return { used, quota, plan };
}

function sanitizeFilename(name, fallback) {
  return String(name || fallback)
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/\s+/g, ' ');
}

function withPdfExtension(filename, fallback) {
  const clean = sanitizeFilename(filename, fallback);
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

module.exports = {
  normalizeFolderPath,
  escapeLikeValue,
  formatShare,
  buildFolderTree,
  storeWorkspaceFile,
  replaceWorkspaceFileContent,
  countPdfPages,
  fileRecordToJson,
  deleteWorkspaceFileRecord,
  getUserStorageUsageBytes,
  ensureQuotaAvailable,
  sanitizeFilename,
  withPdfExtension,
  normalizeUploadedFiles,
  getDisplayFilename
};
