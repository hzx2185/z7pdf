const express = require('express');

const { stmts } = require('../db');
const { requireUser } = require('../middleware/auth');
const { formatPaymentOrder, getPlanByCode } = require('../services/plan-service');
const { createPaymentOrderForUser, updatePaymentOrderStatus } = require('../services/billing-service');

const router = express.Router();

router.post('/api/workspace/checkout', requireUser, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const planCode = String(req.body.planCode || '').trim();
    const paymentMethod = String(req.body.paymentMethod || 'manual').trim() || 'manual';
    const billingInterval = String(req.body.billingInterval || 'monthly').trim() || 'monthly';
    const plan = getPlanByCode(planCode);

    if (!plan || !plan.active) {
      return res.status(404).json({ error: '套餐不存在或已停用。' });
    }

    const order = createPaymentOrderForUser(req.user.id, {
      planCode: plan.code,
      billingInterval,
      paymentMethod,
      amountCents: plan.priceCents,
      note: String(req.body.note || '').trim()
    });

    return res.status(201).json({ order: formatPaymentOrder(order) });
  } catch (error) {
    return res.status(400).json({ error: error.message || '订阅订单创建失败。' });
  }
});

router.post('/api/payments/mock-webhook', requireUser, express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const orderId = Number(req.body.orderId);
    const order = stmts.getPaymentOrder.get(orderId);

    if (!order) {
      return res.status(404).json({ error: '订单不存在。' });
    }
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作此订单。' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: '订单状态不是待处理，无法模拟支付。' });
    }

    const updatedOrder = updatePaymentOrderStatus(order, {
      status: 'paid',
      note: '[Mock Payment Success]',
      externalRef: `mock-pay:${orderId}`
    });

    return res.json({
      ok: true,
      message: '模拟支付成功，会员权益已激活！',
      order: formatPaymentOrder(updatedOrder)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || '模拟支付处理失败。' });
  }
});

module.exports = router;
