const crypto = require('node:crypto');
const readline = require('node:readline');

const { ApiError, requestJson, requestJsonPublic } = require('./api');
const {
  authMode,
  deleteApiKey,
  deletePendingAuth,
  envApiKey,
  loadApiKey,
  loadPendingAuth,
  saveApiKey,
  savePendingAuth,
} = require('./config');
const operations = require('./operations');

const VERSION = '0.1.0';
const CLI_AUTH_CREATE_PATH = '/agent/skills/accessKey/oauth2/device_authorization';
const CLI_AUTH_STATUS_PATH = '/agent/skills/accessKey/oauth2/device/status';
const CLI_AUTH_EXCHANGE_PATH = '/agent/skills/accessKey/oauth2/token';
const CLI_AUTH_VALIDATE_PATH = '/agent/skills/accessKey/oauth2/introspect';
const CLI_AUTH_CANCEL_PATH = '/agent/skills/accessKey/oauth2/device/cancel';

class CliError extends Error {}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return `Usage: ckt-agent <command> <subcommand> [options]

Commands:
  auth login|logout|status
  asset upload --file <path> [--biz-type <value>]
  design switch [--design-id <id>]
  message send --message <text> [--session-id <id>] [--image-file-key <key>] [--image-url <url>]
  request status --request-id <id> [--last-message-id <id>] [--page-size <number>]
  result download (--request-id <id> | --poll-file <path>) [--output-dir <path>]
`;
}

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new CliError(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new CliError(`Missing value for --${name}`);
    const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === 'imageFileKey' || key === 'imageUrl') {
      if (!options[key]) options[key] = [];
      options[key].push(value);
    } else {
      options[key] = value;
    }
    index += 1;
  }
  return options;
}

function requireOption(options, name) {
  if (!options[name]) throw new CliError(`Missing required option: --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
}

function commandResult(data, exitCode) {
  return { __commandResult: true, data, exitCode };
}

function createVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashVerifier(verifier) {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

function responseField(value, camelCaseName, snakeCaseName) {
  return value && (value[camelCaseName] ?? value[snakeCaseName]);
}

async function serverAuthLogin() {
  const verifier = createVerifier();
  const response = await requestJsonPublic(CLI_AUTH_CREATE_PATH, {
    client: 'ckt-agent-cli',
    clientVersion: VERSION,
    platform: process.platform,
    verifierHash: hashVerifier(verifier),
  });
  const sessionId = responseField(response, 'sessionId', 'session_id');
  const authUrl = responseField(response, 'authUrl', 'auth_url');
  if (!sessionId || !authUrl) throw new CliError('Authentication service returned an invalid session');
  savePendingAuth({
    sessionId,
    verifier,
    expiresAt: responseField(response, 'expiresAt', 'expires_at'),
  });
  return {
    authenticated: false,
    status: 'pending',
    authUrl,
    message: 'Open the authentication URL in a browser',
  };
}

async function serverAuthStatus() {
  const pending = loadPendingAuth();
  if (pending) {
    const status = await requestJsonPublic(CLI_AUTH_STATUS_PATH, pending);
    const state = status.status;
    if (state === 'authorized') {
      const exchanged = await requestJsonPublic(CLI_AUTH_EXCHANGE_PATH, pending);
      const accessKey = responseField(exchanged, 'accessKey', 'access_key');
      if (!accessKey) throw new CliError('Authentication service returned no AccessKey');
      saveApiKey(accessKey);
      return {
        authenticated: true,
        source: 'local',
        credentialId: responseField(exchanged, 'credentialId', 'credential_id'),
        message: 'Authenticated',
      };
    }
    if (state === 'exchanged') {
      deletePendingAuth();
      return commandResult({ authenticated: false, status: state, message: 'Authentication exchange already completed' }, 1);
    }
    if (state === 'expired' || state === 'canceled') {
      deletePendingAuth();
      return commandResult({ authenticated: false, status: state, message: 'Authentication is not complete' }, 1);
    }
    return commandResult({ authenticated: false, status: 'pending', message: 'Authentication pending' }, 1);
  }

  const { value, source } = loadApiKey();
  if (!value) return commandResult({ authenticated: false, message: 'Not authenticated' }, 1);

  const validation = await requestJson(CLI_AUTH_VALIDATE_PATH);
  if (validation && validation.valid === true) {
    return { authenticated: true, source, message: 'Authenticated' };
  }
  if (source === 'local') deleteApiKey();
  return commandResult({ authenticated: false, message: 'Not authenticated' }, 1);
}

async function serverAuthLogout() {
  const pending = loadPendingAuth();
  if (pending) {
    try {
      await requestJsonPublic(CLI_AUTH_CANCEL_PATH, pending);
    } catch (error) {
      // Local logout must remain usable when the short-lived session is already gone.
    }
  }
  const removed = deleteApiKey();
  const pendingRemoved = deletePendingAuth();
  return { authenticated: false, removed: removed || pendingRemoved, message: 'Logged out' };
}

function promptSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    const input = readline.createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => input.question(prompt, (value) => {
      input.close();
      resolve(value.trim());
    }));
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = '';
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      const character = chunk.toString('utf8');
      if (character === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        process.stderr.write('\n');
        process.exitCode = 130;
        resolve('');
      } else if (character === '\r' || character === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(value.trim());
      } else if (character === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function authCommand(subcommand) {
  if (authMode() === 'server') {
    if (subcommand === 'login') return serverAuthLogin();
    if (subcommand === 'status') return serverAuthStatus();
    if (subcommand === 'logout') return serverAuthLogout();
  }
  if (subcommand === 'login') {
    const value = envApiKey() || await promptSecret('Chuangkit Access Key: ');
    if (!value) throw new CliError('Access Key is required');
    saveApiKey(value);
    return { authenticated: true, message: 'Authenticated' };
  }
  if (subcommand === 'logout') {
    const removed = deleteApiKey();
    return { authenticated: Boolean(envApiKey()), removed, message: 'Logged out' };
  }
  if (subcommand === 'status') {
    const { value, source } = loadApiKey();
    return { authenticated: Boolean(value), source, message: value ? 'Authenticated' : 'Not authenticated' };
  }
  throw new CliError('Choose an auth command: login, logout, or status');
}

async function dispatch(argv) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(usage());
    return null;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return null;
  }

  const command = argv[0];
  const subcommand = argv[1];
  if (command === 'auth') return authCommand(subcommand);
  const options = parseOptions(argv.slice(2));
  if (command === 'asset' && subcommand === 'upload') {
    requireOption(options, 'file');
    return operations.upload({ file: options.file, bizType: options.bizType });
  }
  if (command === 'design' && subcommand === 'switch') {
    return operations.switchDesign({ designId: options.designId });
  }
  if (command === 'message' && subcommand === 'send') {
    requireOption(options, 'message');
    return operations.sendMessage({
      message: options.message,
      sessionId: options.sessionId,
      imageFileKey: options.imageFileKey || [],
      imageUrl: options.imageUrl || [],
    });
  }
  if (command === 'request' && subcommand === 'status') {
    requireOption(options, 'requestId');
    return operations.requestStatus({
      requestId: options.requestId,
      lastMessageId: options.lastMessageId,
      afterSeq: options.afterSeq,
      pageSize: options.pageSize ? Number(options.pageSize) : 20,
    });
  }
  if (command === 'result' && subcommand === 'download') {
    if (!options.requestId && !options.pollFile) throw new CliError('One of --request-id or --poll-file is required');
    if (options.requestId && options.pollFile) throw new CliError('--request-id and --poll-file cannot be used together');
    return operations.downloadResults({
      requestId: options.requestId,
      pollFile: options.pollFile,
      outputDir: options.outputDir,
      pageSize: options.pageSize ? Number(options.pageSize) : 50,
    });
  }
  throw new CliError('Unknown command. Use `ckt-agent --help` for available commands.');
}

async function main(argv = process.argv.slice(2)) {
  try {
    const result = await dispatch(argv);
    if (result && result.__commandResult) {
      printJson(result.data);
      return result.exitCode;
    }
    if (result !== null) printJson(result);
    return 0;
  } catch (error) {
    const message = error instanceof ApiError || error instanceof CliError || error instanceof Error
      ? error.message : String(error);
    process.stderr.write(`ckt-agent: ${message}\n`);
    return 1;
  }
}

module.exports = { VERSION, dispatch, main, parseOptions, promptSecret, usage };
