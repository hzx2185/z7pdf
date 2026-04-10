const crypto = require('crypto');

const { stmts } = require('../db');
const { nowIso, hashPassword } = require('../utils/common');

const DEFAULT_ADMIN_EMAIL = "admin@z7pdf.local";
const DEPRECATED_SETTING_KEYS = [
  "payment_notice",
  "alipay_appid",
  "alipay_gateway",
  "alipay_private_key",
  "alipay_public_key"
];

function seedDefaultPlans() {
  const now = nowIso();
  const defaults = [
    {
      code: "member",
      name: "免费会员",
      description: "适合个人轻量编辑、下载与基础文件留存。",
      priceCents: 0,
      billingInterval: "monthly",
      storageQuotaMb: 256,
      maxFiles: 100,
      maxShareLinks: 3,
      allowCompression: 1,
      allowSplit: 0,
      allowSecurity: 0,
      active: 1,
      sortOrder: 10
    },
    {
      code: "pro",
      name: "高级会员",
      description: "适合高频 PDF 处理、分享和在线保存。",
      priceCents: 4900,
      billingInterval: "monthly",
      storageQuotaMb: 2048,
      maxFiles: 1500,
      maxShareLinks: 50,
      allowCompression: 1,
      allowSplit: 1,
      allowSecurity: 1,
      active: 1,
      sortOrder: 20
    },
    {
      code: "team",
      name: "团队会员",
      description: "适合多人协作和较大文件空间。",
      priceCents: 12900,
      billingInterval: "monthly",
      storageQuotaMb: 8192,
      maxFiles: 5000,
      maxShareLinks: 200,
      allowCompression: 1,
      allowSplit: 1,
      allowSecurity: 1,
      active: 1,
      sortOrder: 30
    }
  ];

  defaults.forEach((plan) => {
    const existingPlan = stmts.getPlan.get(plan.code);
    if (existingPlan) {
      return;
    }
    stmts.upsertPlan.run(
      plan.code,
      plan.name,
      plan.description,
      plan.priceCents,
      plan.billingInterval,
      plan.storageQuotaMb,
      plan.maxFiles,
      plan.maxShareLinks,
      plan.allowCompression,
      plan.allowSplit,
      plan.allowSecurity,
      plan.active,
      plan.sortOrder,
      now,
      now
    );
  });
}

function cleanupDeprecatedSettings() {
  return DEPRECATED_SETTING_KEYS.reduce(
    (removedCount, key) => removedCount + Number(stmts.deleteSetting.run(key).changes || 0),
    0
  );
}

function generateAdminPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

async function seedAdminUser() {
  const email = String(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  const existing = stmts.findUserByEmail.get(email);
  if (existing) {
    return {
      created: false,
      email,
      password: null,
      generated: false
    };
  }

  const generated = !configuredPassword;
  const password = generated ? generateAdminPassword() : configuredPassword;

  stmts.createUser.run(email, await hashPassword(password), "admin", "pro", nowIso());
  return {
    created: true,
    email,
    password,
    generated
  };
}

async function bootstrap() {
  seedDefaultPlans();
  const removedSettingsCount = cleanupDeprecatedSettings();
  const admin = await seedAdminUser();
  return {
    admin,
    removedSettingsCount
  };
}

module.exports = {
  bootstrap
};
