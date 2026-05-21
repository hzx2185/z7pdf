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

function getSmtpConfig(overrides = {}) {
  const hasOverride = (key) => Object.prototype.hasOwnProperty.call(overrides || {}, key);
  const readValue = (settingKey, configKey, fallback = "") => {
    if (hasOverride(settingKey)) return overrides[settingKey];
    if (hasOverride(configKey)) return overrides[configKey];
    return getSettingValue(settingKey, fallback);
  };
  const readPassword = () => {
    if (hasOverride("smtp_pass") || hasOverride("pass")) {
      const value = readValue("smtp_pass", "pass", "");
      if (String(value ?? "") !== "") {
        return String(value ?? "");
      }
    }
    return String(getSettingValue("smtp_pass", "") || "");
  };
  const port = Number(readValue("smtp_port", "port", "465") || 465);
  const secureValue = readValue("smtp_secure", "secure", "true");
  return {
    host: String(readValue("smtp_host", "host", "") || "").trim(),
    port: Number.isFinite(port) ? port : 465,
    secure:
      typeof secureValue === "boolean"
        ? secureValue
        : String(secureValue ?? "true").toLowerCase() === "true",
    user: String(readValue("smtp_user", "user", "") || "").trim(),
    pass: readPassword(),
    fromEmail: String(readValue("smtp_from_email", "fromEmail", "") || "").trim(),
    fromName:
      String(readValue("smtp_from_name", "fromName", "Z7 PDF 工作台") || "").trim() ||
      "Z7 PDF 工作台"
  };
}

function isSmtpConfigured(config = getSmtpConfig()) {
  return Boolean(config.host && config.user && config.pass && config.fromEmail);
}

function getSafeSmtpConfig(config = getSmtpConfig()) {
  return {
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    user: config.user,
    fromEmail: config.fromEmail,
    fromName: config.fromName
  };
}

function getMissingSmtpFields(config = getSmtpConfig()) {
  const fields = [];
  if (!config.host) fields.push("SMTP 服务器");
  if (!config.port) fields.push("SMTP 端口");
  if (!config.user) fields.push("SMTP 用户名");
  if (!config.pass) fields.push("SMTP 密码/授权码");
  if (!config.fromEmail) fields.push("发件邮箱");
  return fields;
}

function createSmtpDiagnostic(message, details = [], extra = {}) {
  return {
    message,
    details: details.filter(Boolean).map((detail) => String(detail)),
    ...extra
  };
}

function formatSmtpError(error, fallback = "SMTP 发信失败。") {
  const rawMessage = String(error?.message || "").trim();
  const response = String(error?.response || "").trim();
  const code = String(error?.code || "").trim();
  const command = String(error?.command || "").trim();
  const responseCode = Number(error?.responseCode || 0);
  const searchable = [rawMessage, response, code, command].join(" ");
  let message = fallback;

  if (
    responseCode === 535 ||
    code === "EAUTH" ||
    /ERR\.LOGIN\.REQCODE|Invalid login|535|authentication|authenticate|auth failed|login/i.test(searchable)
  ) {
    message =
      "SMTP 登录失败：邮箱服务商拒绝认证。请确认 SMTP 用户名是完整邮箱地址，并使用邮箱服务商生成的授权码/应用专用密码。";
  } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(searchable)) {
    message = "SMTP 连接失败：无法解析 SMTP 服务器地址，请检查服务器域名。";
  } else if (/ECONNREFUSED|ECONNECTION/i.test(searchable)) {
    message = "SMTP 连接失败：服务器或端口拒绝连接，请检查 SMTP 地址、端口和 SSL/TLS 设置。";
  } else if (/ETIMEDOUT|timeout|Greeting never received/i.test(searchable)) {
    message = "SMTP 连接超时：请检查端口、网络、防火墙或服务商是否允许 SMTP 登录。";
  } else if (/certificate|self signed|TLS|SSL/i.test(searchable)) {
    message = "SMTP TLS/SSL 握手失败：请检查端口和“使用 SSL / TLS”设置是否匹配。";
  } else if (rawMessage) {
    message = `${fallback}${rawMessage}`;
  }

  return createSmtpDiagnostic(
    message,
    [
      rawMessage ? `原始错误：${rawMessage}` : "",
      response ? `SMTP 返回：${response}` : "",
      responseCode ? `响应码：${responseCode}` : "",
      code ? `错误代码：${code}` : "",
      command ? `SMTP 阶段：${command}` : ""
    ],
    {
      code: code || undefined,
      command: command || undefined,
      response: response || undefined,
      responseCode: responseCode || undefined
    }
  );
}

function createSmtpDiagnosticError(error, fallback = "SMTP 发信失败。") {
  const diagnostic = error?.smtpDiagnostic || formatSmtpError(error, fallback);
  const wrapped = new Error(diagnostic.message);
  wrapped.smtpDiagnostic = diagnostic;
  return wrapped;
}

function createSmtpConfigError(config = getSmtpConfig()) {
  const missingFields = getMissingSmtpFields(config);
  const diagnostic = createSmtpDiagnostic(
    `SMTP 配置不完整：缺少 ${missingFields.join("、")}。`,
    [
      "请在后台配置 SMTP 服务器、端口、用户名、授权码、发件邮箱和 SSL/TLS 设置后再发送邮件。"
    ],
    {
      missingFields
    }
  );
  const error = new Error(diagnostic.message);
  error.smtpDiagnostic = diagnostic;
  return error;
}

function createSmtpTransporter(config = getSmtpConfig()) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

async function sendMailWithSmtpConfig(config, mailOptions, fallback = "SMTP 发信失败。") {
  if (!isSmtpConfigured(config)) {
    throw createSmtpConfigError(config);
  }

  const transporter = createSmtpTransporter(config);
  try {
    return await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      ...mailOptions
    });
  } catch (error) {
    throw createSmtpDiagnosticError(error, fallback);
  } finally {
    if (typeof transporter.close === "function") {
      transporter.close();
    }
  }
}

async function sendSmtpTestEmail(recipient, config = getSmtpConfig()) {
  const target = String(recipient || "").trim().toLowerCase();
  if (!target || !target.includes("@")) {
    throw new Error("请输入有效的测试收件邮箱。");
  }

  const info = await sendMailWithSmtpConfig(
    config,
    {
      to: target,
      subject: "Z7 PDF SMTP 测试邮件",
      text: [
        "这是一封 Z7 PDF 后台 SMTP 配置测试邮件。",
        `发送时间：${nowIso()}`,
        "如果你收到这封邮件，说明当前 SMTP 配置可以正常发信。"
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #1f2a37;">
          <p>这是一封 Z7 PDF 后台 SMTP 配置测试邮件。</p>
          <p>发送时间：${nowIso()}</p>
          <p>如果你收到这封邮件，说明当前 SMTP 配置可以正常发信。</p>
        </div>
      `
    },
    "SMTP 测试邮件发送失败。"
  );

  const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
  const rejected = Array.isArray(info.rejected) ? info.rejected.map(String) : [];
  if (accepted.length === 0) {
    const diagnostic = createSmtpDiagnostic(
      "SMTP 已连接，但测试收件人未被服务器接受。",
      [
        rejected.length ? `被拒绝收件人：${rejected.join("、")}` : "",
        info.response ? `SMTP 返回：${info.response}` : ""
      ],
      {
        accepted,
        rejected,
        response: info.response
      }
    );
    const error = new Error(diagnostic.message);
    error.smtpDiagnostic = diagnostic;
    throw error;
  }

  return {
    ok: true,
    message: `测试邮件已发送到 ${target}。`,
    config: getSafeSmtpConfig(config),
    result: {
      accepted,
      rejected,
      response: info.response || "",
      messageId: info.messageId || "",
      envelopeTimeMs: info.envelopeTime,
      messageTimeMs: info.messageTime,
      messageSize: info.messageSize
    }
  };
}

function createErrorResponse(error, fallback = "请求失败。") {
  const diagnostic = error?.smtpDiagnostic;
  if (diagnostic) {
    return {
      error: diagnostic.message || fallback,
      details: diagnostic.details || [],
      smtp: diagnostic
    };
  }
  return { error: error?.message || fallback };
}

function createAccessCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

async function sendVerificationEmail(email, code) {
  const smtp = getSmtpConfig();
  await sendMailWithSmtpConfig(smtp, {
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
  }, "验证码发送失败。");
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
  if (!/^[0-9a-f]+$/i.test(expected) || expected.length !== 128) {
    return false;
  }
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else {
        const digest = Buffer.from(derivedKey.toString("hex"), "hex");
        const expectedDigest = Buffer.from(expected, "hex");
        resolve(
          digest.length === expectedDigest.length &&
            crypto.timingSafeEqual(digest, expectedDigest)
        );
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
      try {
        accumulator[key] = decodeURIComponent(rest.join("=") || "");
      } catch (_error) {
        accumulator[key] = rest.join("=") || "";
      }
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
  getSmtpConfig,
  isSmtpConfigured,
  getSafeSmtpConfig,
  formatSmtpError,
  createErrorResponse,
  createAccessCode,
  generateRedeemCode,
  sendSmtpTestEmail,
  sendVerificationEmail,
  hashPassword,
  verifyPassword,
  parseCookies,
  setSessionCookie,
  clearSessionCookie
};
