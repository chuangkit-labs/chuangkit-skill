const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('server auth flow opens a URL, binds through status and exchanges once', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chuangkit-cli-server-auth-'));
  const previousConfigDir = process.env.CHUANGKIT_CLI_CONFIG_DIR;
  const previousAuthMode = process.env.CHUANGKIT_CLI_AUTH_MODE;
  const previousApiKey = process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
  const api = require('../src/api');
  const originalPublicRequest = api.requestJsonPublic;
  const originalAuthenticatedRequest = api.requestJson;
  const calls = [];
  let statusCall = 0;

  process.env.CHUANGKIT_CLI_CONFIG_DIR = directory;
  process.env.CHUANGKIT_CLI_AUTH_MODE = 'server';
  delete process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
  api.requestJsonPublic = async (requestPath, payload) => {
    calls.push({ requestPath, payload });
    if (requestPath.endsWith('/oauth2/device_authorization')) {
      return {
        sessionId: 'session-1234567890123456',
        authUrl: 'https://www.ckt.cn/agent/skills/cli-auth?session_id=session-1234567890123456',
        expiresAt: Date.now() + 600000,
      };
    }
    if (requestPath.endsWith('/oauth2/device/status')) {
      statusCall += 1;
      return { status: statusCall === 1 ? 'pending' : 'authorized' };
    }
    if (requestPath.endsWith('/oauth2/token')) {
      return { accessKey: 'selected-access-key', credentialId: 12, userId: 34 };
    }
    return {};
  };
  api.requestJson = async (requestPath) => {
    calls.push({ requestPath });
    return { valid: true, credentialId: 12, userId: 34 };
  };

  delete require.cache[require.resolve('../src/cli')];
  const { dispatch } = require('../src/cli');

  try {
    const login = await dispatch(['auth', 'login']);
    assert.equal(login.status, 'pending');
    assert.match(login.authUrl, /^https:\/\//);
    assert.equal(login.authUrl.includes('selected-access-key'), false);

    const pending = await dispatch(['auth', 'status']);
    assert.equal(pending.data.status, 'pending');
    assert.equal(pending.exitCode, 1);

    const authenticated = await dispatch(['auth', 'status']);
    assert.equal(authenticated.authenticated, true);
    assert.equal(authenticated.credentialId, 12);

    const validated = await dispatch(['auth', 'status']);
    assert.equal(validated.authenticated, true);
    assert.equal(validated.source, 'local');

    const createCall = calls.find((call) => call.requestPath.endsWith('/oauth2/device_authorization'));
    assert.equal(createCall.payload.client, 'ckt-agent-cli');
    assert.equal(typeof createCall.payload.verifierHash, 'string');
    assert.equal(Object.prototype.hasOwnProperty.call(createCall.payload, 'verifier'), false);
    const statusCallPayload = calls.find((call) => call.requestPath.endsWith('/oauth2/device/status')).payload;
    assert.equal(statusCallPayload.sessionId, 'session-1234567890123456');
    assert.equal(typeof statusCallPayload.verifier, 'string');
  } finally {
    api.requestJsonPublic = originalPublicRequest;
    api.requestJson = originalAuthenticatedRequest;
    delete require.cache[require.resolve('../src/cli')];
    if (previousConfigDir === undefined) delete process.env.CHUANGKIT_CLI_CONFIG_DIR;
    else process.env.CHUANGKIT_CLI_CONFIG_DIR = previousConfigDir;
    if (previousAuthMode === undefined) delete process.env.CHUANGKIT_CLI_AUTH_MODE;
    else process.env.CHUANGKIT_CLI_AUTH_MODE = previousAuthMode;
    if (previousApiKey === undefined) delete process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
    else process.env.CHUANGKIT_AGENT_SKILL_API_KEY = previousApiKey;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
