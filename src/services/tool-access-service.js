const { stmts } = require('../db');
const { nowIso } = require('../utils/common');
const {
  assertGuestQuotaForExport,
  getEffectivePlanForGuest
} = require('./plan-service');

function assertGuestToolAllowed(req, feature = '') {
  if (req.user) {
    return null;
  }

  const plan = getEffectivePlanForGuest();
  if (feature === 'compression' && !plan.allowCompression) {
    throw new Error(`当前 ${plan.name} 不支持压缩导出，请登录或升级套餐。`);
  }
  if (feature === 'split' && !plan.allowSplit) {
    throw new Error(`当前 ${plan.name} 不支持拆分导出，请登录或升级套餐。`);
  }
  if (feature === 'security' && !plan.allowSecurity) {
    throw new Error(`当前 ${plan.name} 不支持 PDF 加密，请登录或升级套餐。`);
  }

  return assertGuestQuotaForExport(req.guestId);
}

function consumeGuestExport(req, guestUsage) {
  if (!guestUsage) {
    return;
  }
  stmts.incrementGuestUsage.run(req.guestId, guestUsage.usageDate, nowIso(), nowIso());
}

module.exports = {
  assertGuestToolAllowed,
  consumeGuestExport
};
