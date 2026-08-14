const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { requestJson, uploadFile } = require('./api');

function pick(value, ...keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) result[key] = value[key];
  }
  return result;
}

function getAny(value, ...keys) {
  for (const key of keys) {
    if (value && typeof value === 'object' && value[key] !== undefined && value[key] !== null) {
      return value[key];
    }
  }
  return undefined;
}

async function upload(args) {
  const data = await uploadFile(args.file, args.bizType || 'agent_skill');
  return pick(data, 'file_key', 'fileKey', 'media_type', 'mediaType', 'file_size', 'fileSize');
}

async function switchDesign(args) {
  const data = await requestJson('/api/agent_skill/designs/switch.do', args.designId ? { design_id: args.designId } : {});
  return pick(data, 'design_id', 'design_url', 'created');
}

async function sendMessage(args) {
  const payload = { message: args.message };
  if (args.sessionId) payload.session_id = args.sessionId;
  const images = [
    ...(args.imageFileKey || []).map((fileKey) => ({ source: 'fileKey', file_key: fileKey })),
    ...(args.imageUrl || []).map((imageUrl) => ({ source: 'url', image_url: imageUrl })),
  ];
  if (images.length) payload.user_images = images;
  const data = await requestJson('/api/agent_skill/messages/send.do', payload);
  return pick(data, 'request_id', 'session_id', 'design_id', 'design_url', 'accepted', 'created_session');
}

function simplifyTask(task) {
  return pick(
    task,
    'task_id', 'taskId', 'state', 'status', 'image_url', 'imageUrl',
    'no_water_mark_image_url', 'noWaterMarkImageUrl',
    'legal_watermark_image_url', 'legalWatermarkImageUrl', 'video_url', 'videoUrl',
  );
}

function simplifyMessage(message) {
  const item = pick(
    message,
    'message_id', 'messageId', 'role', 'content', 'content_type', 'contentType',
    'create_time', 'createTime', 'request_id', 'requestId',
  );
  const tasks = getAny(message, 'tasks') || {};
  const taskList = getAny(tasks, 'list') || [];
  if (taskList.length) item.tasks = taskList.map(simplifyTask).filter((task) => Object.keys(task).length);
  return item;
}

async function requestStatus(args) {
  const payload = { request_id: args.requestId, page_size: args.pageSize || 20 };
  const cursor = args.lastMessageId || args.afterSeq;
  if (cursor) payload.last_message_id = cursor;
  const data = await requestJson('/api/agent_skill/requests/status.do', payload);
  return {
    ...pick(
      data,
      'request_id', 'requestId', 'session_id', 'sessionId',
      'next_last_message_id', 'nextLastMessageId', 'has_more', 'hasMore', 'finished', 'error',
    ),
    messages: (data.messages || []).map(simplifyMessage),
  };
}

const RESULT_URL_KEYS = [
  'no_water_mark_image_url', 'noWaterMarkImageUrl', 'image_url', 'imageUrl',
  'legal_watermark_image_url', 'legalWatermarkImageUrl', 'video_url', 'videoUrl',
];

function collectResultUrls(payload) {
  const urls = [];
  for (const message of payload.messages || []) {
    const tasks = getAny(message, 'tasks') || {};
    for (const item of getAny(tasks, 'list') || []) {
      const url = getAny(item, ...RESULT_URL_KEYS);
      if (url) urls.push(url);
    }
  }
  return urls;
}

function defaultOutputDir() {
  return path.join(os.homedir(), 'Downloads', 'chuangkit-agent-results');
}

function dateFolderForPayload(payload) {
  for (const message of payload.messages || []) {
    const createTime = getAny(message, 'create_time', 'createTime');
    if (!createTime) continue;
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(createTime);
    if (match) return `${match[1]}${match[2]}${match[3]}`;
  }
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function extensionFor(url) {
  try {
    const pathname = new URL(url.startsWith('//') ? `https:${url}` : url).pathname;
    const extension = path.extname(path.basename(pathname));
    return extension || '.png';
  } catch {
    return '.png';
  }
}

async function downloadResults(args) {
  let payload;
  if (args.pollFile) {
    payload = JSON.parse(fs.readFileSync(args.pollFile, 'utf8'));
  } else {
    payload = await requestJson('/api/agent_skill/requests/status.do', {
      request_id: args.requestId,
      page_size: args.pageSize || 50,
    });
  }

  const requestId = getAny(payload, 'request_id', 'requestId') || 'unknown-request';
  const targetDir = path.join(args.outputDir || defaultOutputDir(), dateFolderForPayload(payload));
  fs.mkdirSync(targetDir, { recursive: true });
  const files = [];
  for (const [index, rawUrl] of collectResultUrls(payload).entries()) {
    const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const target = path.join(targetDir, `${requestId}_${String(index + 1).padStart(2, '0')}${extensionFor(url)}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, buffer);
    files.push(target);
  }
  return { count: files.length, files };
}

module.exports = {
  collectResultUrls,
  dateFolderForPayload,
  downloadResults,
  sendMessage,
  requestStatus,
  simplifyMessage,
  switchDesign,
  upload,
};
