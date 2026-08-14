# 🎨 Chuangkit Skill

> 让 AI Agent 直接接入创客贴的图片、设计和视频创作能力。

`chuangkit-skill` 面向“生成一张图”“基于这版继续改”“做一段视频”“上传参考图再出几版”这类真实创作任务。它不是一个通用 SDK，而是一个围绕创作会话、设计画布和结果交付打磨过的 Agent Skill。

License: MIT  Python 3.6+

## ✨ 简介

这个 skill 主要解决三类问题：
- 把自然语言创作需求直接发送给创客贴 Agent
- 把参考图、视频等本地素材接入同一条创作链路
- 把异步生成过程整理成 Agent 可稳定调用的轮询和下载流程

## 📦 技能内容

| Skill | Focus | Scripts |
| --- | --- | --- |
| `chuangkit-skill` | 面向创客贴 Agent 的创作会话技能，覆盖素材上传、设计切换、消息发送、状态轮询、结果下载 | `upload_file.py` `switch_design.py` `send_message.py` `query_request_status.py` `download_results.py` |

技能定义文件： [SKILL.md](/Users/wangxt/workspace/project/aigc/chuangkit-skill/SKILL.md:1)

## 📥 快速安装

1、安装SKILL：

```bash
npx skills add chuangkit-labs/chuangkit-skill
```

2、获取 API KEY:

> 访问[创客贴官网](https://www.ckt.cn) → hover头像领取access key，或者[查看创客贴 Skill 使用指南](https://chuangkit.yuque.com/qltowx/oy07v3/zke9e1eqalto3p7e?singleDoc#)。

3、配置 API KEY 环境变量：

```bash
export CHUANGKIT_AGENT_SKILL_API_KEY="your-api-key"
```

然后支持 OpenClaw Skill 规范的 Agent 就可以自动发现并调用它。

🎉 安装完成后，Agent 就可以按 skill 定义自动接入创客贴创作链路，不需要手动拼接口。

## 🧩 WorkBuddy Connector

本仓库同时维护 WorkBuddy 的 CLI 接入版本：

```text
workbuddy/chuangkit-cli-connector/
├── connector-meta.json
├── cli.json
├── icon.svg
└── skills/SKILL.md
```

提交 WorkBuddy 市场时，直接提交 [chuangkit-cli-connector](/Users/wangxt/workspace/project/aigc/chuangkit-skill/workbuddy/chuangkit-cli-connector) 完整目录。

WorkBuddy 的 `auth login` 使用浏览器授权：前端负责登录、查询/创建并选择
AccessKey，CLI 通过后端一次性会话换取最终凭证。

Node CLI 源码位于 [cli](/Users/wangxt/workspace/project/aigc/chuangkit-skill/cli)，现有 Python Skill 脚本位于 [scripts](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts)。两套入口共享同一套 API 契约，但分别维护适配层；现有 Skill 不依赖 Node CLI。

本地开发 Node CLI：

```bash
node cli/bin/chuangkit.js --help
node cli/bin/chuangkit.js --version
node cli/bin/chuangkit.js auth status
```

## 🌟 这个 Skill 的特别之处

和常见的“发请求拿结果”式 skill 不同，`chuangkit-skill` 更强调创作上下文，而不只是一次接口调用。

这里有三个关键对象：

- `design_id`：设计/画布载体，适合管理“这一版作品”
- `session_id`：会话上下文，适合管理“这一轮对话和修改”
- `request_id`：一次异步任务，适合管理“这一条具体生成请求”

这让 Agent 能比较清晰地区分：

- 我是在继续改上一版，还是重新开一个方向
- 我是在同一张画布里探索，还是换一张新画布
- 我现在该轮询哪个任务，最终该把什么结果交付给用户

## ⚙️ 环境要求

当前只强依赖一个鉴权变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `CHUANGKIT_AGENT_SKILL_API_KEY` | 是 | 创客贴 Agent Skill API 的 Bearer Token |

设置方式：

```bash
export CHUANGKIT_AGENT_SKILL_API_KEY="your-api-key"
```

运行环境要求：

- `python3`

## 🧭 创作工作流

这个 skill 最适合以下工作流：

```text
用户给出创作需求
  ↓
如果有本地素材，先上传素材
  ↓
如果要新开设计方向，切换或创建 design
  ↓
发送创作/编辑消息
  ↓
记录 request_id / session_id / design_url
  ↓
轮询任务进展
  ↓
下载结果并交付给用户
```

对应到脚本调用，大致是：

1. `upload_file.py`
2. `switch_design.py`
3. `send_message.py`
4. `query_request_status.py`
5. `download_results.py`

## 🛠️ 手动调试

虽然这个仓库主要是给 Agent 自动调用的，但调试时可以直接单独跑脚本。

### 1. 上传参考图或视频

```bash
python3 scripts/upload_file.py --file /path/to/reference.png
```

输出里重点关注 `file_key`。

### 2. 新建设计或切换设计

```bash
python3 scripts/switch_design.py
python3 scripts/switch_design.py --design-id "<design_id>"
```

输出里重点关注 `design_id` 和 `design_url`。

### 3. 发起创作请求

```bash
python3 scripts/send_message.py \
  --message "根据参考图生成一张清爽夏日风饮品海报" \
  --image-file-key "<file_key>"
```

如果要在上一轮基础上继续改：

```bash
python3 scripts/send_message.py \
  --session-id "<session_id>" \
  --message "保留主体，把背景换成更干净的蓝绿色渐变"
```

### 4. 查询任务进展

```bash
python3 scripts/query_request_status.py --request-id "<request_id>"
```

增量轮询：

```bash
python3 scripts/query_request_status.py \
  --request-id "<request_id>" \
  --last-message-id "<next_last_message_id>"
```

### 5. 下载结果

```bash
python3 scripts/download_results.py --request-id "<request_id>"
```

默认会下载到：

```text
~/Downloads/chuangkit-agent-results
```

如果用户明确指定保存路径，再传 `--output-dir "<path>"`。

## 📁 项目结构

```text
chuangkit-skill/
├── cli/
│   ├── package.json
│   ├── README.md
│   ├── bin/chuangkit.js
│   ├── src/
│   └── test/
├── README.md
├── SKILL.md
├── workbuddy/
│   └── chuangkit-cli-connector/
│       ├── connector-meta.json
│       ├── cli.json
│       ├── icon.svg
│       └── skills/SKILL.md
└── scripts/
    ├── _common.py
    ├── upload_file.py
    ├── switch_design.py
    ├── send_message.py
    ├── query_request_status.py
    └── download_results.py
```

各文件职责：

- [SKILL.md](/Users/wangxt/workspace/project/aigc/chuangkit-skill/SKILL.md:1)：定义触发条件、工作流和 Agent 使用约束
- [scripts/_common.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/_common.py:1)：公共鉴权与请求封装
- [scripts/upload_file.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/upload_file.py:1)：素材上传
- [scripts/switch_design.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/switch_design.py:1)：设计切换
- [scripts/send_message.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/send_message.py:1)：消息发送
- [scripts/query_request_status.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/query_request_status.py:1)：状态轮询
- [scripts/download_results.py](/Users/wangxt/workspace/project/aigc/chuangkit-skill/scripts/download_results.py:1)：结果下载

## ✅ 最佳实践

- 有本地素材时先上传，不要把本地路径直接塞进 prompt
- 用户说“继续上一版”时优先复用 `session_id`
- 用户说“换个方向重新来”时优先切到新的 `design_id`
- 轮询时保存 `next_last_message_id`，避免重复读取消息
- 最终交付时同时返回 `design_url` 和本地下载文件路径

## 🤝 参与贡献
欢迎提交 Pull Request

## 📄 License

本项目采用 [MIT License](/Users/wangxt/workspace/project/aigc/chuangkit-skill/LICENSE) 开源。

Copyright © 2026 `chuangkit-labs`
