const assert = require('node:assert/strict');
const { mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const PORT = 39192;
const TEST_EMAIL = 'member-security@example.com';
const TEST_PASSWORD = 'old-password';

function onceProcessEvent(child, eventName) {
  return new Promise((resolve) => {
    child.once(eventName, (...args) => resolve(args));
  });
}

async function waitForServerReady(baseUrl, child) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError || new Error('Timed out waiting for test server');
}

async function requestJson(baseUrl, pathname, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function seedDefaultPlans(stmts, nowIso) {
  const now = nowIso();
  stmts.upsertPlan.run(
    'member',
    '免费会员',
    '',
    0,
    'monthly',
    256,
    100,
    3,
    1,
    0,
    0,
    1,
    10,
    now,
    now
  );
}

async function seedTestUser(stmts, helpers) {
  seedDefaultPlans(stmts, helpers.nowIso);
  if (!stmts.findUserByEmail.get(TEST_EMAIL)) {
    stmts.createUser.run(
      TEST_EMAIL,
      await helpers.hashPassword(TEST_PASSWORD),
      'member',
      'member',
      helpers.nowIso()
    );
  }
}

async function runChildTests() {
  const { db, stmts } = require('../src/db');
  const helpers = require('../src/utils/common');

  try {
    await seedTestUser(stmts, helpers);

    await assertMalformedPasswordHashIsRejected(helpers);
    await assertResetPasswordRejectsIncorrectCode(stmts, helpers);
    await assertChangeEmailRejectsIncorrectCode(stmts, helpers);
    await assertExpiredSessionIsRejected(stmts, helpers);
    await assertMalformedCookieDoesNotBreakRequests();
    await assertShareUpdateRejectsInvalidAccessMode(stmts, helpers);
    await assertShareUpdateRequiresPasswordWhenSwitchingToPassword(stmts, helpers);
    await assertLegacyToolsConsumeGuestQuota(stmts);
    await assertLegacyToolsRespectGuestCapabilities();
  } finally {
    db.close();
  }
}

async function assertMalformedPasswordHashIsRejected(helpers) {
  assert.equal(await helpers.verifyPassword('anything', 'salt:not-hex'), false);
  assert.equal(await helpers.verifyPassword('anything', 'salt:abcd'), false);
}

async function assertResetPasswordRejectsIncorrectCode(stmts, helpers) {
  const now = helpers.nowIso();
  stmts.createEmailVerification.run(
    TEST_EMAIL,
    await helpers.hashPassword('123456'),
    'password-reset',
    helpers.addMinutesIso(10),
    now,
    '127.0.0.1'
  );

  const { response, body } = await requestJson(process.env.TEST_BASE_URL, '/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      code: '654321',
      newPassword: 'new-password'
    })
  });

  assert.equal(response.status, 401, JSON.stringify(body));
  assert.match(body.error, /验证码不正确/);
}

async function assertChangeEmailRejectsIncorrectCode(stmts, helpers) {
  const login = await requestJson(process.env.TEST_BASE_URL, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });
  assert.equal(login.response.status, 200);

  const cookie = login.response.headers.get('set-cookie');
  const newEmail = 'member-new-security@example.com';
  const now = helpers.nowIso();
  stmts.createEmailVerification.run(
    newEmail,
    await helpers.hashPassword('123456'),
    'email-change',
    helpers.addMinutesIso(10),
    now,
    '127.0.0.1'
  );

  const { response, body } = await requestJson(process.env.TEST_BASE_URL, '/api/auth/change-email', {
    method: 'POST',
    headers: {
      Cookie: cookie
    },
    body: JSON.stringify({
      newEmail,
      code: '654321'
    })
  });

  assert.equal(response.status, 401, JSON.stringify(body));
  assert.match(body.error, /验证码不正确/);
}

async function assertExpiredSessionIsRejected(stmts, helpers) {
  const user = stmts.findUserByEmail.get(TEST_EMAIL);
  const expiredToken = 'expired-session-token';
  stmts.createSession.run(user.id, expiredToken, helpers.addMinutesIso(-5), helpers.nowIso());

  const { response, body } = await requestJson(process.env.TEST_BASE_URL, '/api/auth/me', {
    headers: {
      Cookie: `z7pdf_session=${expiredToken}`
    }
  });

  assert.equal(response.status, 200);
  assert.equal(body.user, null);
  assert.equal(stmts.getSession.get(expiredToken), undefined);
  assert.match(response.headers.get('set-cookie') || '', /z7pdf_session=;/);
}

async function assertMalformedCookieDoesNotBreakRequests() {
  const { response, body } = await requestJson(process.env.TEST_BASE_URL, '/api/auth/me', {
    headers: {
      Cookie: 'z7pdf_session=%E0%A4%A'
    }
  });

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.user, null);
}

async function loginAsTestUser() {
  const login = await requestJson(process.env.TEST_BASE_URL, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  return login.response.headers.get('set-cookie');
}

async function seedWorkspaceFile(stmts, helpers) {
  const { db } = require('../src/db');
  const user = stmts.findUserByEmail.get(TEST_EMAIL);
  const now = helpers.nowIso();
  stmts.insertFile.run(
    user.id,
    'share-security.pdf',
    '',
    '',
    'share-security.bin',
    'application/pdf',
    12,
    1,
    'pdf',
    'test',
    now
  );
  return stmts.getFileForUser.get(Number(db.prepare('SELECT last_insert_rowid() AS id').get().id), user.id);
}

async function createShareForTest(stmts, helpers) {
  const user = stmts.findUserByEmail.get(TEST_EMAIL);
  const file = await seedWorkspaceFile(stmts, helpers);
  const now = helpers.nowIso();
  const token = `share-token-${Date.now()}-${helpers.createAccessCode()}`;
  stmts.createShare.run(
    user.id,
    file.id,
    token,
    'public',
    '',
    '',
    '',
    0,
    0,
    now,
    now
  );
  return stmts.getShareByToken.get(token);
}

async function assertShareUpdateRejectsInvalidAccessMode(stmts, helpers) {
  const cookie = await loginAsTestUser();
  const share = await createShareForTest(stmts, helpers);

  const { response, body } = await requestJson(process.env.TEST_BASE_URL, `/api/workspace/shares/${share.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: JSON.stringify({
      accessMode: 'owner'
    })
  });

  assert.equal(response.status, 400, JSON.stringify(body));
  assert.match(body.error, /public\/password\/login/);
}

async function assertShareUpdateRequiresPasswordWhenSwitchingToPassword(stmts, helpers) {
  const cookie = await loginAsTestUser();
  const share = await createShareForTest(stmts, helpers);

  const { response, body } = await requestJson(process.env.TEST_BASE_URL, `/api/workspace/shares/${share.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: JSON.stringify({
      accessMode: 'password'
    })
  });

  assert.equal(response.status, 400, JSON.stringify(body));
  assert.match(body.error, /至少需要 4 位/);
}

async function assertLegacyToolsConsumeGuestQuota(stmts) {
  const { assertGuestToolAllowed, consumeGuestExport } = require('../src/services/tool-access-service');
  const req = {
    user: null,
    guestId: 'legacy-tool-guest-quota'
  };

  const firstUsage = assertGuestToolAllowed(req);
  assert.equal(firstUsage.used, 0);
  consumeGuestExport(req, firstUsage);

  const usageAfterFirstExport = stmts.getGuestUsage.get(req.guestId, firstUsage.usageDate);
  assert.equal(Number(usageAfterFirstExport.use_count), 1);
  assert.throws(() => assertGuestToolAllowed(req), /今日免费次数已用完/);
}

async function assertLegacyToolsRespectGuestCapabilities() {
  const { assertGuestToolAllowed } = require('../src/services/tool-access-service');
  assert.throws(
    () => assertGuestToolAllowed({ user: null, guestId: 'legacy-tool-guest-split' }, 'split'),
    /不支持拆分导出/
  );
  assert.throws(
    () => assertGuestToolAllowed({ user: null, guestId: 'legacy-tool-guest-security' }, 'security'),
    /不支持 PDF 加密/
  );
}

function runParentSuite() {
  const dataDir = path.join(tmpdir(), `z7pdf-security-test-${Date.now()}-${process.pid}`);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  mkdirSync(dataDir, { recursive: true });

  const commonEnv = {
    ...process.env,
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    ADMIN_EMAIL: 'admin-security@example.com',
    ADMIN_PASSWORD: 'admin-password'
  };

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: commonEnv,
    stdio: ['ignore', 'ignore', 'inherit']
  });

  test('security integration suite', async () => {
    await waitForServerReady(baseUrl, server);

    const child = spawn(process.execPath, [__filename], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...commonEnv,
        TEST_BASE_URL: baseUrl,
        TEST_SERVER_CHILD: '1'
      },
      stdio: 'inherit'
    });
    const [code] = await onceProcessEvent(child, 'exit');
    assert.equal(code, 0);
  });

  test.after(() => {
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });
}

if (process.env.TEST_SERVER_CHILD) {
  runChildTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  runParentSuite();
}
