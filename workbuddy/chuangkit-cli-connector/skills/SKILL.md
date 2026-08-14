---
name: chuangkit-cli-skill
description: 通过 ckt-agent CLI 生成、编辑和续作图片与设计，上传参考素材、查询任务进度并下载结果。
version: "0.1.0"
author: "chuangkit-labs"
---

# 创客贴 AI 创作 Skill

所有操作通过 `ckt-agent` CLI 完成。命令输出为 JSON。

## 适用场景

用户要求生成、编辑、修改、续作图片或设计，上传参考素材，查询创作进度或下载生成结果时使用。

## 标准流程

1. 有本地素材时，先上传素材。
2. 需要新建或切换画布时，执行 `design switch`。
3. 使用 `message send` 发起创作请求。
4. 保存返回的 `request_id`、`session_id`、`design_id` 和 `design_url`。
5. 使用 `request status` 轮询任务。
6. 任务完成后执行 `result download`。
7. 返回画布链接、下载文件路径和后续续作所需的 `session_id`。

## 可用命令

### 上传参考素材

```bash
ckt-agent asset upload --file /path/to/reference.png
```

参数：

- `--file`：必填，本地图片或视频文件路径。
- `--biz-type`：可选，默认 `agent_skill`。

返回 `file_key`，后续通过 `--image-file-key` 引用。

### 切换或新建设计

```bash
ckt-agent design switch
ckt-agent design switch --design-id "<design_id>"
```

不传 `--design-id` 时创建并切换到新设计。

### 发起创作请求

```bash
ckt-agent message send \
  --message "根据参考图生成一张夏日饮品海报" \
  --image-file-key "<file_key>"
```

续作已有会话：

```bash
ckt-agent message send \
  --session-id "<session_id>" \
  --message "保留主体，把背景改成蓝绿色渐变"
```

参数：

- `--message`：必填，创作或编辑需求。
- `--session-id`：可选，继续已有会话。
- `--image-file-key`：可选，可重复，用已上传素材的 `file_key`。
- `--image-url`：可选，可重复，公开参考图 URL。

### 查询任务状态

```bash
ckt-agent request status --request-id "<request_id>"
```

增量查询：

```bash
ckt-agent request status \
  --request-id "<request_id>" \
  --last-message-id "<next_last_message_id>"
```

任务未完成时，按 3 至 5 秒间隔继续查询；视频或复杂任务可适当延长间隔。

### 下载结果

```bash
ckt-agent result download --request-id "<request_id>"
```

用户指定目录时：

```bash
ckt-agent result download \
  --request-id "<request_id>" \
  --output-dir "/path/to/output"
```

也可以从已有状态 JSON 下载：

```bash
ckt-agent result download --poll-file "/path/to/status.json"
```

### 认证状态

```bash
ckt-agent auth login
ckt-agent auth status
ckt-agent auth logout
```

在 WorkBuddy 中，`auth login` 会输出浏览器授权 URL 并立即退出。打开页面后：

1. 如果用户未登录，先完成创客贴登录。
2. 页面读取当前用户的 AccessKey 列表。
3. 如果列表为空，页面创建一个新的 AccessKey。
4. 用户选择一个 AccessKey 并确认。
5. CLI 轮询授权状态，完成一次性换取并保存最终凭证。

`auth status` 未认证或仍等待用户选择时返回非 0 退出码；认证成功时输出 `Authenticated` 并返回 0。
`auth logout` 只清理 WorkBuddy 本地凭证和未完成会话，不删除创客贴账户中的 AccessKey。

根目录旧 Skill 仍支持通过环境变量
`CHUANGKIT_AGENT_SKILL_API_KEY` 提供凭证；该兼容路径不参与 WorkBuddy 的浏览器授权流程。

## 使用约束

- 本地素材必须先上传，不能直接把本地路径写入创作消息。
- 用户要求继续上一版时复用 `session_id`。
- 用户要求新方向时切换 `design_id`。
- 轮询时保存并复用 `next_last_message_id`。
- 不要把私有 `file_key` 当作公开链接返回。
- 失败时返回错误信息和相关 ID，不得伪造完成结果。
- 任务完成后优先返回 `design_url`、本地下载文件路径和 `session_id`。
