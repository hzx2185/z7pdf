const { stmts } = require('../db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const SESSION_COOKIE = "z7pdf_session";

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function currentUsageDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function ensureDefaultSettings() {
  const now = nowIso();
  const defaults = {
    app_name: "Z7 PDF 工作台",
    allow_registration: "true",
    default_member_plan: "member",
    guest_plan: "member",
    guest_daily_exports: "1",
    workspace_quota_mb: "512",
    smtp_host: "",
    smtp_port: "465",
    smtp_secure: "true",
    smtp_user: "",
    smtp_pass: "",
    smtp_from_email: "",
    smtp_from_name: "Z7 PDF 工作台"
  };

  Object.entries(defaults).forEach(([key, value]) => {
    const existing = stmts.getSetting.get(key);
    if (!existing) {
      stmts.insertSetting.run(key, value, now);
    }
  });
}

function getSettingsObject() {
  const settings = {};
  stmts.listSettings.all().forEach((row) => {
    settings[row.key] = row.value;
  });
  return settings;
}

function getSettingValue(key, fallback = "") {
  return stmts.getSetting.get(key)?.value ?? fallback;
}

function isRegistrationEnabled() {
  return String(getSettingValue("allow_registration", "true")).toLowerCase() === "true";
}

function getWorkspaceQuotaBytes() {
  const quotaMb = Number(getSettingValue("workspace_quota_mb", "512"));
  return Math.max(1, quotaMb) * 1024 * 1024;
}

function getSmtpConfig() {
  const port = Number(getSettingValue("smtp_port", "465") || 465);
  return {
    host: String(getSettingValue("smtp_host", "") || "").trim(),
    port: Number.isFinite(port) ? port : 465,
    secure: String(getSettingValue("smtp_secure", "true")).toLowerCase() === "true",
    user: String(getSettingValue("smtp_user", "") || "").trim(),
    pass: String(getSettingValue("smtp_pass", "") || ""),
    fromEmail: String(getSettingValue("smtp_from_email", "") || "").trim(),
    fromName: String(getSettingValue("smtp_from_name", "Z7 PDF 工作台") || "").trim() || "Z7 PDF 工作台"
  };
}

function isSmtpConfigured() {
  const config = getSmtpConfig();
  return Boolean(config.host && config.user && config.pass && config.fromEmail);
}

function createAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function sendVerificationEmail(email, code) {
  if (!isSmtpConfigured()) {
    throw new Error("后台尚未配置 SMTP 发信参数，请稍后再试或联系管理员。");
  }

  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to: email,
    subject: "Z7 PDF 登录验证码",
    text: [
      `你的验证码是：${code}`,
      "验证码 10 分钟内有效。",
      "如果该邮箱还没有注册，请在页面填写注册密码并完成验证后创建账号。",
      "如果不是你本人操作，请忽略本邮件。"
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #1f2a37;">
        <p>你的验证码是：</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
        <p>验证码 10 分钟内有效。</p>
        <p>如果该邮箱还没有注册，请在页面填写注册密码并完成验证后创建账号。</p>
        <p>如果不是你本人操作，请忽略本邮件。</p>
      </div>
    `
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || "").split(":");
  if (!salt || !expected) return false;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else {
        const digest = derivedKey.toString("hex");
        resolve(crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected)));
      }
    });
  });
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((accumulator, segment) => {
      const [key, ...rest] = segment.split("=");
      accumulator[key] = decodeURIComponent(rest.join("=") || "");
      return accumulator;
    }, {});
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Path=/`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
}

module.exports = {
  nowIso,
  addDaysIso,
  addMinutesIso,
  currentUsageDate,
  ensureDefaultSettings,
  getSettingsObject,
  getSettingValue,
  isRegistrationEnabled,
  getWorkspaceQuotaBytes,
  getSmtpConfig,
  isSmtpConfigured,
  createAccessCode,
  generateRedeemCode,
  sendVerificationEmail,
  hashPassword,
  verifyPassword,
  parseCookies,
  setSessionCookie,
  clearSessionCookie
};
