# @chuangkit-labs/agent-cli

The `ckt-agent` CLI exposes Chuangkit Agent creative workflows for WorkBuddy
and other command-line Skill hosts. It requires Node.js 18 or newer; WorkBuddy
prepares Node 20 through the Connector runtime configuration.

## Install

```bash
npm install --global @chuangkit-labs/agent-cli
```

## Authenticate

```bash
ckt-agent auth login
ckt-agent auth status
ckt-agent auth logout
```

In WorkBuddy server-auth mode, `auth login` creates a short-lived session,
prints a browser authorization URL, and exits. The browser page handles login,
lists or creates the user's AccessKeys, and submits the selected AccessKey ID.
Run `auth status` after the selection to complete the one-time exchange.

Existing Skill users can still provide `CHUANGKIT_AGENT_SKILL_API_KEY`, and the
CLI keeps the legacy interactive Access Key login when server-auth mode is not
enabled.

## Commands

```bash
ckt-agent asset upload --file /path/to/reference.png
ckt-agent design switch
ckt-agent message send --message "生成一张夏日饮品海报"
ckt-agent request status --request-id "<request_id>"
ckt-agent result download --request-id "<request_id>"
```

All command results are JSON. Credentials are stored in the user configuration
directory with restrictive file permissions.

中文说明见 [README.md](https://github.com/chuangkit-labs/chuangkit-skill/blob/main/cli/README.md)。
