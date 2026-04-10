const { parseCookies } = require('../utils/common');
const { stmts } = require('../db');
const { getEffectivePlanForUser } = require('./plan-service');
const { getDisplayFilename } = require('./workspace-service');

function enforceShareLimit(userId) {
  const plan = getEffectivePlanForUser(userId);
  const currentCount = Number(stmts.activeShareCountByUser.get(userId)?.total || 0);
  if (currentCount >= Number(plan.maxShareLinks || 0)) {
    throw new Error(`当前套餐最多允许 ${plan.maxShareLinks} 个有效分享链接。`);
  }
  return plan;
}

function getShareCookieName(token) {
  return `z7pdf_share_${token}`;
}

function setShareAccessCookie(res, token, accessKey) {
  res.append(
    'Set-Cookie',
    `${getShareCookieName(token)}=${encodeURIComponent(accessKey)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      7 * 24 * 60 * 60
    }`
  );
}

function clearShareAccessCookie(res, token) {
  res.append(
    'Set-Cookie',
    `${getShareCookieName(token)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function hasShareCookieAccess(req, share) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[getShareCookieName(share.token)] === share.access_key;
}

function shareRequiresGate(share) {
  return share.access_mode === 'password' || share.access_mode === 'login';
}

function isShareExpired(share) {
  return Boolean(share.expires_at) && new Date(share.expires_at).getTime() < Date.now();
}

function isShareDownloadLimitReached(share) {
  return (
    Number(share.max_downloads || 0) > 0 &&
    Number(share.download_count || 0) >= Number(share.max_downloads || 0)
  );
}

function buildAttachmentDisposition(filename, fallback = 'download.bin') {
  const safeName = String(filename || fallback).trim() || fallback;
  const fallbackName = safeName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/"/g, '')
    .replace(/[;\r\n]/g, '_');
  return `attachment; filename="${fallbackName || fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function sendStoredDownload(res, absolutePath, filename, mimeType = 'application/octet-stream') {
  return res.sendFile(absolutePath, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': buildAttachmentDisposition(
        getDisplayFilename(filename),
        'download.bin'
      )
    }
  });
}

module.exports = {
  enforceShareLimit,
  getShareCookieName,
  setShareAccessCookie,
  clearShareAccessCookie,
  hasShareCookieAccess,
  shareRequiresGate,
  isShareExpired,
  isShareDownloadLimitReached,
  sendStoredDownload
};
