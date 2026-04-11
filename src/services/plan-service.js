const { execFile } = require('child_process');
const { promisify } = require('util');

const { stmts } = require('../db');
const { currentUsageDate, getSettingValue } = require('../utils/common');

const execFileAsync = promisify(execFile);
const binaryAvailabilityCache = new Map();

function formatPlan(plan) {
  if (!plan) {
    return null;
  }

  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: Number(plan.price_cents || 0),
    billingInterval: plan.billing_interval,
    storageQuotaMb: Number(plan.storage_quota_mb || 0),
    maxFiles: Number(plan.max_files || 0),
    maxShareLinks: Number(plan.max_share_links || 0),
    allowCompression: Boolean(plan.allow_compression),
    allowSplit: Boolean(plan.allow_split),
    allowSecurity: Boolean(plan.allow_security),
    active: Boolean(plan.active),
    sortOrder: Number(plan.sort_order || 0),
    createdAt: plan.created_at,
    updatedAt: plan.updated_at
  };
}

function formatSubscription(row) {
  if (!row) {
    return null;
  }

  const effectiveStatus =
    row.status === 'active' && new Date(row.period_end || 0).getTime() < Date.now()
      ? 'expired'
      : row.status;

  return {
    id: row.id,
    userId: row.user_id,
    planCode: row.plan_code,
    status: effectiveStatus,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paymentProvider: row.payment_provider,
    externalRef: row.external_ref,
    amountCents: Number(row.amount_cents || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getPlanByCode(code) {
  return formatPlan(stmts.getPlan.get(code));
}

function getUserPlanCode(userId) {
  const user = stmts.findUserById.get(userId);
  return user?.plan || getSettingValue('default_member_plan', 'member');
}

function getEffectivePlanForUser(userId) {
  const activeSubscription = stmts.getActiveSubscriptionForUser.get(userId);
  if (activeSubscription) {
    const plan = getPlanByCode(activeSubscription.plan_code);
    if (plan) {
      return {
        ...plan,
        source: 'subscription',
        subscription: formatSubscription(activeSubscription)
      };
    }
  }

  const fallbackPlan = getPlanByCode(getUserPlanCode(userId)) || getPlanByCode('member');
  return {
    ...fallbackPlan,
    source: 'user'
  };
}

function getGuestDailyExports() {
  return Math.max(0, Number(getSettingValue('guest_daily_exports', '1')) || 0);
}

function getEffectivePlanForGuest() {
  const configured = getPlanByCode(getSettingValue('guest_plan', 'member'));
  const fallback =
    getPlanByCode('member') || getPlanByCode(getSettingValue('default_member_plan', 'member'));
  return {
    ...(configured || fallback),
    source: 'guest'
  };
}

function getGuestUsageInfo(guestId) {
  const usageDate = currentUsageDate();
  const limit = getGuestDailyExports();
  const used = Number(stmts.getGuestUsage.get(guestId, usageDate)?.use_count || 0);

  return {
    guestId,
    usageDate,
    limit,
    used,
    remaining: Math.max(0, limit - used)
  };
}

function assertGuestQuotaForExport(guestId) {
  const usage = getGuestUsageInfo(guestId);
  if (usage.limit < 1) {
    throw new Error('当前站点未开放游客免费导出，请登录会员空间后继续使用。');
  }
  if (usage.used >= usage.limit) {
    throw new Error('未注册用户今日免费次数已用完，请登录后继续使用或于明天再试。');
  }
  return usage;
}

function enforceFileCountLimit(userId, incomingCount) {
  const plan = getEffectivePlanForUser(userId);
  const currentCount = Number(stmts.fileCountByUser.get(userId)?.total || 0);
  if (currentCount + incomingCount > Number(plan.maxFiles || 0)) {
    throw new Error(`当前套餐最多允许保留 ${plan.maxFiles} 个文件，请升级套餐或先清理文件。`);
  }
  return plan;
}

function assertRecipeAllowed(recipe, plan) {
  if (recipe?.compression?.enabled && !plan.allowCompression) {
    throw new Error(`当前 ${plan.name} 不支持导出时压缩，请升级套餐。`);
  }
  if (recipe?.split?.enabled && !plan.allowSplit) {
    throw new Error(`当前 ${plan.name} 不支持拆分导出，请升级套餐。`);
  }
  if (recipe?.security?.enabled && !plan.allowSecurity) {
    throw new Error(`当前 ${plan.name} 不支持 PDF 加密，请升级套餐。`);
  }
}

async function hasBinary(command) {
  if (binaryAvailabilityCache.has(command)) {
    return binaryAvailabilityCache.get(command);
  }

  try {
    await execFileAsync('which', [command]);
    binaryAvailabilityCache.set(command, true);
    return true;
  } catch (_error) {
    binaryAvailabilityCache.set(command, false);
    return false;
  }
}

async function isOcrAvailable() {
  const [ocrmypdfReady, tesseractReady] = await Promise.all([
    hasBinary('ocrmypdf'),
    hasBinary('tesseract')
  ]);
  return ocrmypdfReady && tesseractReady;
}

module.exports = {
  formatPlan,
  formatSubscription,
  getPlanByCode,
  getEffectivePlanForUser,
  getGuestDailyExports,
  getEffectivePlanForGuest,
  getGuestUsageInfo,
  assertGuestQuotaForExport,
  enforceFileCountLimit,
  assertRecipeAllowed,
  isOcrAvailable
};
