const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const operations = require('../src/operations');
const { dispatch } = require('../src/cli');

async function withTempConfig(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chuangkit-cli-test-'));
  const previous = process.env.CHUANGKIT_CLI_CONFIG_DIR;
  process.env.CHUANGKIT_CLI_CONFIG_DIR = directory;
  try {
    return await callback(directory);
  } finally {
    if (previous === undefined) delete process.env.CHUANGKIT_CLI_CONFIG_DIR;
    else process.env.CHUANGKIT_CLI_CONFIG_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('auth login, status and logout use local config without exposing key', async () => {
  await withTempConfig(async () => {
    const previousKey = process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
    delete process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
    const previousTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    const originalPrompt = require('../src/cli').promptSecret;
    // The non-interactive login path is covered by the existing env-key contract.
    process.env.CHUANGKIT_AGENT_SKILL_API_KEY = 'test-secret';
    const loggedIn = await dispatch(['auth', 'login']);
    assert.deepEqual(loggedIn, { authenticated: true, message: 'Authenticated' });
    const status = await dispatch(['auth', 'status']);
    assert.equal(status.authenticated, true);
    assert.equal(status.source, 'environment');
    delete process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
    const localStatus = await dispatch(['auth', 'status']);
    assert.equal(localStatus.authenticated, true);
    const loggedOut = await dispatch(['auth', 'logout']);
    assert.equal(loggedOut.authenticated, false);
    assert.equal(loggedOut.removed, true);
    if (previousKey === undefined) delete process.env.CHUANGKIT_AGENT_SKILL_API_KEY;
    else process.env.CHUANGKIT_AGENT_SKILL_API_KEY = previousKey;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: previousTTY });
    assert.equal(originalPrompt !== undefined, true);
  });
});

test('send message preserves the existing API request contract', async () => {
  const original = operations.sendMessage;
  let received;
  const api = require('../src/api');
  const originalRequest = api.requestJson;
  api.requestJson = async (requestPath, payload) => {
    received = { requestPath, payload };
    return { request_id: 'req-1', session_id: 'session-1', design_id: 'design-1' };
  };
  // operations.js destructures requestJson at load time, so patch its dependency via a fresh module.
  delete require.cache[require.resolve('../src/operations')];
  const freshOperations = require('../src/operations');
  const result = await freshOperations.sendMessage({
    message: '生成海报',
    sessionId: 'session-1',
    imageFileKey: ['file-1'],
    imageUrl: ['https://example.com/ref.png'],
  });
  assert.deepEqual(received, {
    requestPath: '/api/agent_skill/messages/send.do',
    payload: {
      message: '生成海报',
      session_id: 'session-1',
      user_images: [
        { source: 'fileKey', file_key: 'file-1' },
        { source: 'url', image_url: 'https://example.com/ref.png' },
      ],
    },
  });
  assert.equal(result.request_id, 'req-1');
  api.requestJson = originalRequest;
  operations.sendMessage = original;
});

test('request status preserves cursor and simplified response fields', async () => {
  const api = require('../src/api');
  const originalRequest = api.requestJson;
  let received;
  api.requestJson = async (requestPath, payload) => {
    received = { requestPath, payload };
    return {
      request_id: 'req-1',
      session_id: 'session-1',
      next_last_message_id: 'cursor-2',
      has_more: true,
      finished: false,
      messages: [{
        message_id: 'message-1',
        role: 'assistant',
        tasks: { list: [{ task_id: 'task-1', video_url: 'https://example.com/a.mp4' }] },
      }],
    };
  };
  delete require.cache[require.resolve('../src/operations')];
  const freshOperations = require('../src/operations');
  const result = await freshOperations.requestStatus({
    requestId: 'req-1',
    lastMessageId: 'cursor-1',
    pageSize: 20,
  });
  assert.deepEqual(received, {
    requestPath: '/api/agent_skill/requests/status.do',
    payload: { request_id: 'req-1', page_size: 20, last_message_id: 'cursor-1' },
  });
  assert.equal(result.messages[0].tasks[0].video_url, 'https://example.com/a.mp4');
  assert.equal(result.next_last_message_id, 'cursor-2');
  api.requestJson = originalRequest;
});

test('result URL collection includes image and video fields', () => {
  assert.deepEqual(operations.collectResultUrls({
    messages: [
      { tasks: { list: [{ image_url: 'https://example.com/a.png' }] } },
      { tasks: { list: [{ videoUrl: 'https://example.com/b.mp4' }] } },
    ],
  }), ['https://example.com/a.png', 'https://example.com/b.mp4']);
});

test('CLI parser rejects missing required request source', async () => {
  await assert.rejects(() => dispatch(['result', 'download']), /One of --request-id or --poll-file is required/);
});
