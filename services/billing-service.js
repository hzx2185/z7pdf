const { db, stmts } = require('../db');
const { nowIso, generateRedeemCode } = require('../utils/common');
const { getPlanByCode } = require('./plan-service');

const DAY_MS = 24 * 60 * 60 * 1000;

function intervalToDays(billingInterval = 'monthly') {
  return String(billingInterval).trim().toLowerCase() === 'yearly' ? 365 : 30;
}

function addDaysToIso(baseIso, days) {
  const parsed = Date.parse(baseIso);
  const baseTime = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(baseTime + Number(days || 0) * DAY_MS).toISOString();
}

function createPaymentOrderForUser(userId, options = {}) {
  const now = nowIso();

  stmts.createPaymentOrder.run(
    userId,
    String(options.planCode || '').trim(),
    String(options.billingInterval || 'monthly').trim() || 'monthly',
    Math.max(0, Number(options.amountCents || 0)),
    String(options.paymentMethod || 'manual').trim() || 'manual',
    'pending',
    String(options.note || '').trim(),
    now,
    now,
    ''
  );

  const orderId = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  return stmts.getPaymentOrder.get(orderId);
}

function applyPlanSubscription(userId, planCode, options = {}) {
  const user = stmts.findUserById.get(userId);
  if (!user) {
    throw new Error('用户不存在。');
  }

  const activatedAt = options.activatedAt || nowIso();
  const periodEnd = addDaysToIso(activatedAt, intervalToDays(options.billingInterval));

  stmts.expireSubscriptionsForUser.run(activatedAt, userId);
  stmts.createSubscription.run(
    userId,
    planCode,
    'active',
    activatedAt,
    periodEnd,
    String(options.paymentProvider || 'manual').trim() || 'manual',
    String(options.externalRef || '').trim(),
    Math.max(0, Number(options.amountCents || 0)),
    activatedAt,
    activatedAt
  );
  stmts.updateUserAdmin.run(user.role, planCode, userId);

  return stmts.getActiveSubscriptionForUser.get(userId);
}

function updatePaymentOrderStatus(order, options = {}) {
  if (!order) {
    throw new Error('订单不存在。');
  }

  const status = String(options.status || order.status).trim();
  const note = String(options.note ?? order.note ?? '').trim();
  const updatedAt = options.updatedAt || nowIso();

  if (status === 'paid' && order.status !== 'paid') {
    const paidAt = options.paidAt || updatedAt;
    stmts.updatePaymentOrder.run('paid', note, updatedAt, paidAt, order.id);
    applyPlanSubscription(order.user_id, order.plan_code, {
      billingInterval: order.billing_interval,
      paymentProvider: order.payment_method,
      externalRef: String(options.externalRef || `order:${order.id}`),
      amountCents: Number(order.amount_cents || 0),
      activatedAt: updatedAt
    });
    return stmts.getPaymentOrder.get(order.id);
  }

  const paidAt = status === 'paid' ? order.paid_at || options.paidAt || updatedAt : '';
  stmts.updatePaymentOrder.run(status, note, updatedAt, paidAt, order.id);
  return stmts.getPaymentOrder.get(order.id);
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

  const currentIso = nowIso();
  const currentTime = Date.parse(currentIso);
  const existingSubscription = stmts.getActiveSubscriptionForUser.get(userId);

  if (existingSubscription) {
    const periodEndTime = Date.parse(existingSubscription.period_end || '');
    const baseTime = Number.isFinite(periodEndTime) ? Math.max(currentTime, periodEndTime) : currentTime;
    const nextPeriodEnd = new Date(
      baseTime + Math.max(1, Number(redemption.duration_days || 0)) * DAY_MS
    ).toISOString();
    stmts.updateSubscriptionPeriod.run(nextPeriodEnd, currentIso, existingSubscription.id);
  } else {
    stmts.createSubscription.run(
      userId,
      redemption.plan_code,
      'active',
      currentIso,
      addDaysToIso(currentIso, redemption.duration_days),
      'redemption',
      code,
      Math.max(0, Number(plan.priceCents || 0)),
      currentIso,
      currentIso
    );
  }

  stmts.useRedemptionCode.run(redemption.id);

  return {
    code,
    plan,
    redemption,
    subscription: stmts.getActiveSubscriptionForUser.get(userId)
  };
}

module.exports = {
  createPaymentOrderForUser,
  applyPlanSubscription,
  updatePaymentOrderStatus,
  createRedemptionCodes,
  redeemMembershipCode
};
