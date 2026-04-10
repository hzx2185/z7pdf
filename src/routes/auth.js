const express = require('express');
const rateLimit = require('express-rate-limit');

const { stmts } = require('../db');
const { requireUser } = require('../middleware/auth');
const {
  nowIso,
  addMinutesIso,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  createAccessCode,
  sendVerificationEmail,
  isRegistrationEnabled,
  getSettingValue,
  isSmtpConfigured
} = require('../utils/common');
const { createSession, publicUser } = require('../services/session-service');
const {
  formatPlan,
  getEffectivePlanForUser,
  getGuestDailyExports,
  getEffectivePlanForGuest,
  getGuestUsageInfo,
  isOcrAvailable
} = require('../services/plan-service');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '登录尝试次数过多,请 15 分钟后再试' }
});

router.get('/api/public-config', async (req, res) => {
  const guestEntitlements = getEffectivePlanForGuest();
  const guestUsage = getGuestUsageInfo(req.guestId);

  res.json({
    appName: getSettingValue('app_name', 'Z7 PDF 工作台'),
    allowRegistration: isRegistrationEnabled(),
    defaultMemberPlan: getSettingValue('default_member_plan', 'member'),
    guestPlan: getSettingValue('guest_plan', 'member'),
    guestDailyExports: getGuestDailyExports(),
    guestEntitlements,
    guestUsage,
    workspaceQuotaMb: Number(getSettingValue('workspace_quota_mb', '512')),
    ocrAvailable: await isOcrAvailable(),
    smtpConfigured: isSmtpConfigured(),
    plans: stmts.listPlans.all().map(formatPlan).filter((plan) => plan.active)
  });
});

router.get('/api/auth/me', async (req, res) => {
  const entitlements = req.user ? getEffectivePlanForUser(req.user.id) : null;

  res.json({
    user: req.user || null,
    appName: getSettingValue('app_name', 'Z7 PDF 工作台'),
    entitlements,
    guestEntitlements: req.user ? null : getEffectivePlanForGuest(),
    guestUsage: req.user ? null : getGuestUsageInfo(req.guestId),
    smtpConfigured: isSmtpConfigured()
  });
});

router.post('/api/auth/send-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }

    const existingUser = stmts.findUserByEmail.get(email);
    if (!existingUser && !isRegistrationEnabled()) {
      return res
        .status(403)
        .json({ error: '当前站点暂未开放新用户注册，请使用已存在账号登录。' });
    }

    const latest = stmts.getLatestVerificationForEmail.get(email, 'access');
    if (latest && new Date(latest.created_at).getTime() > Date.now() - 60 * 1000) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 60 秒后再试。' });
    }

    const code = createAccessCode();
    const now = nowIso();
    await sendVerificationEmail(email, code);
    stmts.consumeAllOpenVerifications.run(now, email, 'access');
    stmts.createEmailVerification.run(
      email,
      await hashPassword(code),
      'access',
      addMinutesIso(10),
      now,
      String(req.ip || req.headers['x-forwarded-for'] || '')
    );

    return res.json({
      ok: true,
      expiresInSeconds: 600,
      existingUser: Boolean(existingUser)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '验证码发送失败。' });
  }
});

router.post('/api/auth/email-status', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }

    const existingUser = stmts.findUserByEmail.get(email);
    return res.json({
      ok: true,
      existingUser: Boolean(existingUser),
      allowRegistration: isRegistrationEnabled(),
      smtpConfigured: isSmtpConfigured()
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '获取邮箱状态失败。' });
  }
});

router.post('/api/auth/email-access', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: '请输入 6 位邮箱验证码。' });
    }

    const verification = stmts.getLatestActiveVerificationForEmail.get(email, 'access');
    if (!verification) {
      return res.status(401).json({ error: '验证码不存在或已失效，请重新获取。' });
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      stmts.consumeVerification.run(nowIso(), verification.id);
      return res.status(401).json({ error: '验证码已过期，请重新获取。' });
    }
    if (!(await verifyPassword(code, verification.code_hash))) {
      return res.status(401).json({ error: '验证码不正确。' });
    }

    const consumedAt = nowIso();
    stmts.consumeVerification.run(consumedAt, verification.id);

    let user = stmts.findUserByEmail.get(email);
    let created = false;
    if (!user) {
      if (!isRegistrationEnabled()) {
        return res.status(403).json({ error: '当前站点暂未开放新用户注册，请联系管理员。' });
      }
      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: '该邮箱尚未注册，请填写至少 6 位注册密码后再完成验证。' });
      }

      stmts.createUser.run(
        email,
        await hashPassword(password),
        'member',
        getSettingValue('default_member_plan', 'member'),
        nowIso()
      );
      user = stmts.findUserByEmail.get(email);
      created = true;
    }

    const token = createSession(user.id);
    setSessionCookie(res, token);
    return res.json({ user: publicUser(user), created });
  } catch (error) {
    return res.status(400).json({ error: error.message || '登录失败。' });
  }
});

router.post('/api/auth/register', async (req, res) => {
  try {
    if (!isRegistrationEnabled()) {
      return res.status(403).json({ error: '当前站点暂未开放注册。' });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少为 6 位。' });
    }
    if (stmts.findUserByEmail.get(email)) {
      return res.status(409).json({ error: '该邮箱已注册，请直接登录。' });
    }

    stmts.createUser.run(
      email,
      await hashPassword(password),
      'member',
      getSettingValue('default_member_plan', 'member'),
      nowIso()
    );
    const user = stmts.findUserByEmail.get(email);
    const token = createSession(user.id);
    setSessionCookie(res, token);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '注册失败。' });
  }
});

router.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = stmts.findUserByEmail.get(email);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: '邮箱或密码不正确。' });
    }

    const token = createSession(user.id);
    setSessionCookie(res, token);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '登录失败。' });
  }
});

router.post('/api/auth/logout', async (req, res) => {
  if (req.sessionToken) {
    stmts.deleteSession.run(req.sessionToken);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/api/auth/code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const type = String(req.body.type || 'access').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }

    const validTypes = ['access', 'password-reset', 'email-change'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: '无效的验证码类型。' });
    }

    if (type === 'access') {
      const existingUser = stmts.findUserByEmail.get(email);
      if (!existingUser && !isRegistrationEnabled()) {
        return res
          .status(403)
          .json({ error: '当前站点暂未开放新用户注册，请使用已存在账号登录。' });
      }
    }

    if (type === 'password-reset') {
      const existingUser = stmts.findUserByEmail.get(email);
      if (!existingUser) {
        return res.status(404).json({ error: '该邮箱未注册。' });
      }
    }

    if (type === 'email-change') {
      if (!req.user) {
        return res.status(401).json({ error: '请先登录。' });
      }
      const existingUser = stmts.findUserByEmail.get(email);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: '该邮箱已被其他账号使用。' });
      }
    }

    const latest = stmts.getLatestVerificationForEmail.get(email, type);
    if (latest && new Date(latest.created_at).getTime() > Date.now() - 60 * 1000) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 60 秒后再试。' });
    }

    const code = createAccessCode();
    const now = nowIso();
    await sendVerificationEmail(email, code);
    stmts.consumeAllOpenVerifications.run(now, email, type);
    stmts.createEmailVerification.run(
      email,
      await hashPassword(code),
      type,
      addMinutesIso(10),
      now,
      String(req.ip || req.headers['x-forwarded-for'] || '')
    );

    return res.json({
      ok: true,
      expiresInSeconds: 600
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '验证码发送失败。' });
  }
});

router.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: '请输入 6 位邮箱验证码。' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位。' });
    }

    const user = stmts.findUserByEmail.get(email);
    if (!user) {
      return res.status(404).json({ error: '该邮箱未注册。' });
    }

    const verification = stmts.getLatestActiveVerificationForEmail.get(email, 'password-reset');
    if (!verification) {
      return res.status(401).json({ error: '验证码不存在或已失效，请重新获取。' });
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      stmts.consumeVerification.run(nowIso(), verification.id);
      return res.status(401).json({ error: '验证码已过期，请重新获取。' });
    }

    const now = nowIso();
    stmts.consumeVerification.run(now, verification.id);
    stmts.updateUserPassword.run(await hashPassword(newPassword), user.id);
    stmts.deleteAllUserSessions.run(user.id);
    return res.json({ ok: true, message: '密码重置成功。' });
  } catch (error) {
    return res.status(400).json({ error: error.message || '密码重置失败。' });
  }
});

router.post('/api/auth/change-password', requireUser, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (currentPassword.length < 6 || newPassword.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位。' });
    }

    const user = stmts.findUserByEmail.get(req.user.email);
    if (!user) {
      return res.status(404).json({ error: '用户不存在。' });
    }
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: '当前密码错误。' });
    }

    stmts.updateUserPassword.run(await hashPassword(newPassword), user.id);
    if (req.sessionToken) {
      stmts.deleteAllUserSessionsExceptCurrent.run(user.id, req.sessionToken);
    }
    return res.json({ ok: true, message: '密码修改成功。' });
  } catch (error) {
    return res.status(400).json({ error: error.message || '密码修改失败。' });
  }
});

router.post('/api/auth/change-email', requireUser, async (req, res) => {
  try {
    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();

    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: '请输入有效的邮箱地址。' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: '请输入 6 位邮箱验证码。' });
    }

    const existingUser = stmts.findUserByEmail.get(newEmail);
    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(400).json({ error: '该邮箱已被其他账号使用。' });
    }

    const verification = stmts.getLatestActiveVerificationForEmail.get(newEmail, 'email-change');
    if (!verification) {
      return res.status(401).json({ error: '验证码不存在或已失效，请重新获取。' });
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      stmts.consumeVerification.run(nowIso(), verification.id);
      return res.status(401).json({ error: '验证码已过期，请重新获取。' });
    }

    const now = nowIso();
    stmts.consumeVerification.run(now, verification.id);
    stmts.updateUserEmail.run(newEmail, req.user.id);
    return res.json({ ok: true, message: '邮箱修改成功。' });
  } catch (error) {
    return res.status(400).json({ error: error.message || '邮箱修改失败。' });
  }
});

module.exports = router;
