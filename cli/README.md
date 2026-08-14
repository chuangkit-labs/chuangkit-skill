# @chuangkit-labs/agent-cli

`ckt-agent` 是创客贴 Agent 创作 CLI，适用于 WorkBuddy 以及其他支持 CLI Skill 的 Agent 宿主。
运行环境要求 Node.js 18 及以上；WorkBuddy Connector 会准备 Node.js 20。

## 安装

```bash
npm install --global @chuangkit-labs/agent-cli
```

安装后使用的命令名是 `ckt-agent`。

## 认证

```bash
ckt-agent auth login
ckt-agent auth status
ckt-agent auth logout
```

在 WorkBuddy 的服务端认证模式下，`auth login` 创建一次性授权会话，输出浏览器授权地址后退出。浏览器页面负责：

1. 判断创客贴登录状态，未登录时先完成登录；
2. 查询当前用户的 AccessKey 列表；
3. 列表为空时创建新的 AccessKey；
4. 用户选择一个 AccessKey 并确认；
5. `ckt-agent auth status` 轮询授权状态，完成一次性凭证换取并保存到本地配置。

`auth status` 在等待授权或认证失败时返回非 0 退出码；认证成功时输出 `Authenticated` 并返回 0。
`auth logout` 清理本地凭证和未完成的授权会话，不删除创客贴账户中的 AccessKey。

已有 Skill 用户仍可通过 `CHUANGKIT_AGENT_SKILL_API_KEY` 提供 Bearer Token。未启用服务端认证模式时，CLI 也保留交互式 AccessKey 登录方式。

## 常用命令

```bash
ckt-agent asset upload --file /path/to/reference.png
ckt-agent design switch
ckt-agent message send --message "生成一张夏日饮品海报"
ckt-agent request status --request-id "<request_id>"
ckt-agent result download --request-id "<request_id>"
```

所有命令结果均为 JSON。凭证保存在用户配置目录中，文件使用受限权限。

## 配置项

| 环境变量 | 说明 |
| --- | --- |
| `CHUANGKIT_CLI_AUTH_MODE=server` | 启用 WorkBuddy 服务端认证模式 |
| `CHUANGKIT_CLI_CONFIG_DIR` | 指定 CLI 配置目录 |
| `CHUANGKIT_AGENT_SKILL_API_KEY` | 兼容已有 Skill 的 Bearer Token |
| `CHUANGKIT_AGENT_SKILL_BASE_URL` | 覆盖默认 API 地址 |

默认 API 地址为 `https://gw.chuangkit.com/aigc`。

## 本地开发

```bash
npm test
node bin/chuangkit.js --help
npm pack --dry-run
```

英文说明见 [README.en.md](https://github.com/chuangkit-labs/chuangkit-skill/blob/main/cli/README.en.md)。
