const { stmts } = require('../db');
const { nowIso, generateRedeemCode } = require('../utils/common');
const { getPlanByCode } = require('./plan-service');

const DAY_MS = 24 * 60 * 60 * 1000;

function addDaysToIso(baseIso, days) {
  const parsed = Date.parse(baseIso);
  const baseTime = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(baseTime + Number(days || 0) * DAY_MS).toISOString();
}

function createRedemptionCodes(options = {}) {
  const count = Math.max(1, Number(options.count || 1));
  const durationDays = Math.max(1, Number(options.durationDays || 30));
  const maxUses = Math.max(1, Number(options.maxUses || 1));
  const expiresAt = String(options.expiresAt || '').trim() || null;
  const createdBy = Number(options.createdBy || 0);
  const planCode = String(options.planCode || '').trim();
  const now = nowIso();
  const codes = [];

  for (let index = 0; index < count; index += 1) {
    const code = generateRedeemCode();
    stmts.createRedemptionCode.run(
      code,
      planCode,
      durationDays,
      maxUses,
      createdBy,
      expiresAt,
      now
    );
    codes.push(code);
  }

  return codes;
}

function redeemMembershipCode(userId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) {
    throw new Error('请输入兑换码。');
  }

  const redemption = stmts.getRedemptionCode.get(code);
  if (!redemption) {
    throw new Error('兑换码不存在。');
  }
  if (Number(redemption.used_count || 0) >= Number(redemption.max_uses || 0)) {
    throw new Error('该兑换码已达到使用次数上限。');
  }
  if (redemption.expires_at && new Date(redemption.expires_at).getTime() < Date.now()) {
    throw new Error('该兑换码已过期。');
  }

  const plan = getPlanByCode(redemption.plan_code);
  if (!plan || !plan.active) {
    throw new Error('兑换码对应的套餐已下架。');
  }

  const user = stmts.findUserById.get(userId);
  if (!user) {
    throw new Error('用户不存在。');
  }

  const currentIso = nowIso();
  const currentTime = Date.parse(currentIso);
  const existingSubscription = stmts.getActiveSubscriptionForUser.get(userId);
  let nextPeriodEnd = addDaysToIso(currentIso, redemption.duration_days);

  if (existingSubscription) {
    const periodEndTime = Date.parse(existingSubscription.period_end || '');
    const baseTime = Number.isFinite(periodEndTime) ? Math.max(currentTime, periodEndTime) : currentTime;
    nextPeriodEnd = new Date(
      baseTime + Math.max(1, Number(redemption.duration_days || 0)) * DAY_MS
    ).toISOString();
    stmts.expireSubscriptionsForUser.run(currentIso, userId);
  }

  stmts.createSubscription.run(
    userId,
    redemption.plan_code,
    'active',
    currentIso,
    nextPeriodEnd,
    'redemption',
    code,
    Math.max(0, Number(plan.priceCents || 0)),
    currentIso,
    currentIso
  );
  stmts.updateUserAdmin.run(user.role, redemption.plan_code, userId);
  stmts.useRedemptionCode.run(redemption.id);

  return {
    code,
    plan,
    redemption,
    subscription: stmts.getActiveSubscriptionForUser.get(userId)
  };
}

module.exports = {
  createRedemptionCodes,
  redeemMembershipCode
};
