const express = require('express');

const { stmts } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { nowIso, getSettingsObject } = require('../utils/common');
const { publicUser } = require('../services/session-service');
const {
  formatPlan,
  formatSubscription,
  getPlanByCode
} = require('../services/plan-service');
const { createRedemptionCodes } = require('../services/billing-service');

const router = express.Router();

function getSafeSettingsObject() {
  const settings = getSettingsObject();
  if (settings.smtp_pass) {
    settings.smtp_pass_configured = 'true';
  }
  delete settings.smtp_pass;
  return settings;
}

router.get('/api/admin/overview', requireAdmin, (_req, res) => {
  res.json({
    stats: {
      users: Number(stmts.stats.users.get().total || 0),
      files: Number(stmts.stats.files.get().total || 0),
      storageBytes: Number(stmts.stats.storage.get().total || 0),
      shares: Number(stmts.stats.shares.get().total || 0),
      activeMemberships: Number(stmts.stats.activeMemberships.get().total || 0)
    },
    settings: getSafeSettingsObject()
  });
});

router.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const users = stmts.listUsers.all().map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    createdAt: user.created_at,
    usedBytes: Number(stmts.storageByUser.get(user.id)?.total || 0)
  }));

  res.json({ users });
});

router.get('/api/admin/plans', requireAdmin, (_req, res) => {
  res.json({ plans: stmts.listPlans.all().map(formatPlan) });
});

router.post('/api/admin/plans/:code', requireAdmin, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toLowerCase();
    if (!code) {
      return res.status(400).json({ error: '套餐编码不能为空。' });
    }

    const now = nowIso();
    const existing = stmts.getPlan.get(code);
    stmts.upsertPlan.run(
      code,
      String(req.body.name || existing?.name || code).trim() || code,
      String(req.body.description || existing?.description || '').trim(),
      Math.max(0, Number(req.body.priceCents ?? existing?.price_cents ?? 0)),
      String(req.body.billingInterval || existing?.billing_interval || 'monthly').trim() || 'monthly',
      Math.max(1, Number(req.body.storageQuotaMb ?? existing?.storage_quota_mb ?? 512)),
      Math.max(1, Number(req.body.maxFiles ?? existing?.max_files ?? 200)),
      Math.max(0, Number(req.body.maxShareLinks ?? existing?.max_share_links ?? 0)),
      req.body.allowCompression === undefined ? Number(existing?.allow_compression ?? 1) : req.body.allowCompression ? 1 : 0,
      req.body.allowSplit === undefined ? Number(existing?.allow_split ?? 1) : req.body.allowSplit ? 1 : 0,
      req.body.allowSecurity === undefined ? Number(existing?.allow_security ?? 0) : req.body.allowSecurity ? 1 : 0,
      req.body.active === undefined ? Number(existing?.active ?? 1) : req.body.active ? 1 : 0,
      Math.max(0, Number(req.body.sortOrder ?? existing?.sort_order ?? 100)),
      existing?.created_at || now,
      now
    );

    return res.json({ plan: getPlanByCode(code) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '套餐保存失败。' });
  }
});

router.get('/api/admin/subscriptions', requireAdmin, (_req, res) => {
  const subscriptions = stmts.listSubscriptions.all().map((row) => {
    const user = stmts.findUserById.get(row.user_id);
    return {
      ...formatSubscription(row),
      userEmail: user?.email || ''
    };
  });

  res.json({ subscriptions });
});

router.patch('/api/admin/subscriptions/:id', requireAdmin, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const subscriptionId = Number(req.params.id);
    const target = stmts.listSubscriptions.all().find((row) => row.id === subscriptionId);
    if (!target) {
      return res.status(404).json({ error: '会员有效期记录不存在。' });
    }

    const status = String(req.body.status || target.status).trim();
    const periodEnd = String(req.body.periodEnd || target.period_end).trim() || target.period_end;
    stmts.updateSubscriptionStatus.run(status, periodEnd, nowIso(), subscriptionId);

    return res.json({
      subscription: formatSubscription(
        stmts.listSubscriptions.all().find((row) => row.id === subscriptionId)
      )
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '会员有效期更新失败。' });
  }
});

router.patch('/api/admin/users/:id', requireAdmin, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = stmts.findUserById.get(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在。' });
    }

    const role = String(req.body.role || user.role);
    const plan = String(req.body.plan || user.plan).trim() || user.plan;
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: '角色仅支持 admin 或 member。' });
    }
    if (!getPlanByCode(plan)) {
      return res.status(400).json({ error: '套餐不存在或已被删除。' });
    }
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: '不能把当前登录管理员降级为普通会员。' });
    }

    stmts.updateUserAdmin.run(role, plan, userId);
    const activeSubscription = stmts.getActiveSubscriptionForUser.get(userId);
    if (activeSubscription) {
      stmts.updateSubscriptionPlan.run(plan, nowIso(), activeSubscription.id);
    }
    return res.json({ user: publicUser(stmts.findUserById.get(userId)) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '用户更新失败。' });
  }
});

router.get('/api/admin/settings', requireAdmin, (_req, res) => {
  res.json({ settings: getSafeSettingsObject() });
});

router.post('/api/admin/settings', requireAdmin, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const allowedKeys = new Set([
      'app_name',
      'allow_registration',
      'default_member_plan',
      'guest_plan',
      'guest_daily_exports',
      'workspace_quota_mb',
      'smtp_host',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_pass',
      'smtp_from_email',
      'smtp_from_name'
    ]);
    const incoming =
      req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
    const now = nowIso();

    Object.entries(incoming).forEach(([key, value]) => {
      if (!allowedKeys.has(key)) {
        throw new Error(`不支持的配置项：${key}`);
      }
      if (key === 'smtp_pass' && String(value ?? '') === '') {
        return;
      }
      stmts.insertSetting.run(key, String(value ?? ''), now);
    });

    return res.json({ ok: true, settings: getSafeSettingsObject() });
  } catch (error) {
    return res.status(400).json({ error: error.message || '配置保存失败。' });
  }
});

router.post('/api/admin/redeem-codes', requireAdmin, express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const planCode = String(req.body.planCode || '').trim();
    const durationDays = Math.max(1, Number(req.body.durationDays || 30));
    const maxUses = Math.max(1, Number(req.body.maxUses || 1));
    const count = Math.max(1, Number(req.body.count || 1));
    const expiresAt = String(req.body.expiresAt || '').trim() || null;

    if (!planCode) {
      return res.status(400).json({ error: '请选择套餐。' });
    }

    const plan = getPlanByCode(planCode);
    if (!plan || !plan.active) {
      return res.status(400).json({ error: '套餐不存在或已停用。' });
    }

    const codes = createRedemptionCodes({
      planCode,
      durationDays,
      maxUses,
      count,
      expiresAt,
      createdBy: req.user.id
    });

    return res.json({ ok: true, codes });
  } catch (error) {
    return res.status(400).json({ error: error.message || '生成兑换码失败。' });
  }
});

router.get('/api/admin/redeem-codes', requireAdmin, (_req, res) => {
  try {
    const planNames = stmts.listPlans.all().reduce((accumulator, plan) => {
      accumulator[plan.code] = plan.name;
      return accumulator;
    }, {});

    const codes = stmts.listRedemptionCodes.all().map((code) => ({
      id: code.id,
      code: code.code,
      planName: planNames[code.plan_code] || code.plan_code,
      planCode: code.plan_code,
      durationDays: code.duration_days,
      maxUses: code.max_uses,
      usedCount: code.used_count,
      expiresAt: code.expires_at,
      createdAt: code.created_at
    }));

    return res.json({ codes });
  } catch (error) {
    return res.status(400).json({ error: error.message || '查询失败。' });
  }
});

module.exports = router;
