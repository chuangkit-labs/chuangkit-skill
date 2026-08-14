const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_API_KEY = 'CHUANGKIT_AGENT_SKILL_API_KEY';
const ENV_AUTH_MODE = 'CHUANGKIT_CLI_AUTH_MODE';

function configPath() {
  if (process.env.CHUANGKIT_CLI_CONFIG_DIR) {
    return path.join(process.env.CHUANGKIT_CLI_CONFIG_DIR, 'config.json');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'chuangkit', 'config.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'chuangkit', 'config.json');
}

function envApiKey() {
  const value = (process.env[ENV_API_KEY] || '').trim();
  return value || null;
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') throw error;
    return {};
  }
}

function writeConfig(payload) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (process.platform !== 'win32' || !['EEXIST', 'EPERM'].includes(error.code)) throw error;
    fs.unlinkSync(target);
    fs.renameSync(temporary, target);
  }
  if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
}

function loadStoredApiKey() {
  const payload = readConfig();
  const value = typeof payload.api_key === 'string' ? payload.api_key.trim() : '';
  return { value: value || null, source: 'local' };
}

function loadApiKey() {
  const environmentKey = envApiKey();
  if (environmentKey) return { value: environmentKey, source: 'environment' };
  return loadStoredApiKey();
}

function authMode() {
  return (process.env[ENV_AUTH_MODE] || '').trim().toLowerCase();
}

function savePendingAuth(value) {
  const payload = readConfig();
  payload.pending_auth = value;
  writeConfig(payload);
}

function loadPendingAuth() {
  const payload = readConfig();
  const value = payload.pending_auth;
  if (!value || typeof value !== 'object') return null;
  if (typeof value.sessionId !== 'string' || typeof value.verifier !== 'string') return null;
  return value;
}

function deletePendingAuth() {
  const payload = readConfig();
  if (!payload.pending_auth) return false;
  delete payload.pending_auth;
  if (Object.keys(payload).length === 0) {
    try {
      fs.unlinkSync(configPath());
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
  writeConfig(payload);
  return true;
}

function saveApiKey(value) {
  const payload = readConfig();
  payload.api_key = value;
  delete payload.pending_auth;
  writeConfig(payload);
}

function deleteApiKey() {
  const payload = readConfig();
  if (!payload.api_key) return false;
  delete payload.api_key;
  if (Object.keys(payload).length === 0) {
    try {
      fs.unlinkSync(configPath());
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
  writeConfig(payload);
  return true;
}

function clearConfig() {
  try {
    fs.unlinkSync(configPath());
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  ENV_API_KEY,
  ENV_AUTH_MODE,
  authMode,
  clearConfig,
  configPath,
  deletePendingAuth,
  deleteApiKey,
  envApiKey,
  loadApiKey,
  loadPendingAuth,
  loadStoredApiKey,
  saveApiKey,
  savePendingAuth,
};
