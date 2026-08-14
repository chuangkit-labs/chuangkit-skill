const fs = require('node:fs');
const path = require('node:path');

const { loadApiKey } = require('./config');

const DEFAULT_BASE_URL = 'https://gw.chuangkit.com/aigc';

class ApiError extends Error {}

function baseUrl() {
  return (process.env.CHUANGKIT_AGENT_SKILL_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function endpoint(requestPath) {
  return `${baseUrl()}${requestPath}`;
}

function requireApiKey() {
  const { value } = loadApiKey();
  if (!value) throw new ApiError('Missing authentication. Run `ckt-agent auth login` first.');
  return value;
}

function unwrapResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  if (response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
    const body = response.body;
    if (body.success === false || (body.code !== undefined && ![0, 200].includes(body.code))) {
      throw new ApiError(String(body.msg || body.message || JSON.stringify(body)));
    }
    return body.data === undefined ? body : body.data;
  }
  if (response.success === false || (response.code !== undefined && ![0, 200].includes(response.code))) {
    throw new ApiError(String(response.msg || response.message || JSON.stringify(response)));
  }
  return response.data === undefined ? response : response.data;
}

async function requestJson(requestPath, payload) {
  return requestJsonWithAuth(requestPath, payload, true);
}

async function requestJsonPublic(requestPath, payload) {
  return requestJsonWithAuth(requestPath, payload, false);
}

async function requestJsonWithAuth(requestPath, payload, authenticated) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600000);
  const headers = {
    Accept: 'application/json',
  };
  if (authenticated) headers.Authorization = `Bearer ${requireApiKey()}`;
  const options = { method: 'POST', headers, signal: controller.signal };
  if (payload !== undefined) {
    options.body = JSON.stringify(payload);
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  try {
    const response = await fetch(endpoint(requestPath), options);
    const body = await response.text();
    if (!response.ok) throw new ApiError(`HTTP ${response.status}: ${body}`);
    try {
      return unwrapResponse(body ? JSON.parse(body) : {});
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Invalid JSON response from Chuangkit');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('Request timed out');
    throw new ApiError(`Request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function uploadFile(filePath, bizType = 'agent_skill') {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new ApiError(`File not found: ${filePath}`);
  }
  const form = new FormData();
  form.append('biz_type', bizType);
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  form.append('file', new Blob([buffer]), filename);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600000);
  try {
    const response = await fetch(endpoint('/api/agent_skill/assets/upload.do'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireApiKey()}`, Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new ApiError(`HTTP ${response.status}: ${body}`);
    try {
      return unwrapResponse(body ? JSON.parse(body) : {});
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Invalid JSON response from Chuangkit');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('Request timed out');
    throw new ApiError(`Request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ApiError,
  baseUrl,
  endpoint,
  requestJson,
  requestJsonPublic,
  uploadFile,
  unwrapResponse,
};
