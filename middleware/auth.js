const crypto = require('crypto');

const { stmts } = require('../db');
const { parseCookies } = require('../utils/common');
const { GUEST_COOKIE, SESSION_COOKIE, publicUser, setGuestCookie } = require('../services/session-service');

function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "请先登录会员账号。" });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "请先登录管理员账号。" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "只有管理员可以访问这个页面。" });
  }
  return next();
}

async function authenticateSession(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let guestId = cookies[GUEST_COOKIE];
  if (!guestId) {
    guestId = crypto.randomBytes(18).toString('hex');
    setGuestCookie(res, guestId);
  }

  req.guestId = guestId;

  const sessionToken = cookies[SESSION_COOKIE] || cookies.session;
  
  if (!sessionToken) {
    req.user = null;
    req.sessionToken = null;
    return next();
  }

  const session = stmts.getSession.get(sessionToken);
  if (!session) {
    req.user = null;
    req.sessionToken = null;
    return next();
  }

  const user = stmts.findUserById.get(session.user_id);
  if (!user) {
    req.user = null;
    req.sessionToken = null;
    return next();
  }

  req.user = publicUser(user);
  req.userRecord = user;
  req.sessionToken = sessionToken;
  next();
}

module.exports = {
  requireUser,
  requireAdmin,
  authenticateSession
};
