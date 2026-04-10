const crypto = require('crypto');

const { stmts } = require('../db');
const { addDaysIso, nowIso } = require('../utils/common');

const SESSION_COOKIE = 'z7pdf_session';
const GUEST_COOKIE = 'z7pdf_guest';
const SESSION_TTL_DAYS = 30;
const GUEST_TTL_DAYS = 30;

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    createdAt: user.created_at
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  stmts.createSession.run(userId, token, addDaysIso(SESSION_TTL_DAYS), nowIso());
  return token;
}

function setGuestCookie(res, guestId) {
  res.append(
    'Set-Cookie',
    `${GUEST_COOKIE}=${encodeURIComponent(guestId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      GUEST_TTL_DAYS * 24 * 60 * 60
    }`
  );
}

module.exports = {
  SESSION_COOKIE,
  GUEST_COOKIE,
  publicUser,
  createSession,
  setGuestCookie
};
