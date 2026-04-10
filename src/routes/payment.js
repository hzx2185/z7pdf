const express = require('express');

const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.post('/api/workspace/checkout', requireUser, express.json({ limit: '512kb' }), async (_req, res) => {
  return res.status(403).json({
    error: '当前站点已关闭在线购买，请使用兑换码兑换会员。'
  });
});

router.post('/api/payments/mock-webhook', requireUser, express.json({ limit: '512kb' }), async (_req, res) => {
  return res.status(403).json({
    error: '模拟支付已禁用，请使用兑换码兑换会员。'
  });
});

module.exports = router;
