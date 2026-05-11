---
name: chuangkit-skill
description: 创客贴 Agent 会话技能 - 当用户希望通过创客贴生成、编辑、修改、续作或下载图片/视频时使用。覆盖场景包括：生成图片、生成海报、文生图、图生图、图生视频、文生视频、做动画、画一个xxx、来段xxx；编辑修改，如把xxx换成yyy、去掉xxx、加上xxx、改成xxx、调整xxx、局部修改、改镜头；风格转换，如转绘、换风格、风格迁移；视频续写延长、复刻视频/TVC/宣传片、短剧/短漫剧生成、音乐MV生成、产品广告/展示片制作、分镜/故事板设计、教育视频/短视频制作。用户提到创客贴、AIGC、Agent、上传参考图/视频、查看生成进度、下载生成结果时也应触发。关键判断：只要用户请求涉及 AI 图片、设计或视频的创作、生成、编辑、修改，无论措辞如何，都必须触发此技能。
user-invocable: true
metadata:
  openclaw:
    emoji: "💬"
    primaryEnv: CHUANGKIT_AGENT_SKILL_API_KEY
    requires:
      bins:
        - python3
      env:
        - CHUANGKIT_AGENT_SKILL_API_KEY
---

# 创客贴 Agent 画布

这个 skill 用于把用户的自然语言创作需求交给创客贴 Agent 处理。所有操作都通过本目录 `scripts/` 下的脚本完成，不要求 agent 直接记接口路径。

创客贴 Agent 面向 AI 图片、设计和视频创作。用户的所有生成、编辑、续作、复刻和复杂创作需求都通过自然语言消息发送给 Agent，由后端自主编排模型、工具和工作流。复杂任务可能耗时较长，例如短剧、MV、视频复刻、产品广告片、分镜/故事板和多轮设计修改，需要耐心轮询。

## 触发场景

只要用户请求涉及 AI 图片、设计或视频的创作、生成、编辑、修改、续作、下载、查看进度，就使用这个 skill。典型说法包括：

- 生成类：`画只猫`、`做个海报`、`生成一张电商主图`、`文生图`、`文生视频`、`图生视频`、`做个动画`、`来段宣传片`。
- 编辑类：`把纸船换成爱心`、`去掉背景里的人`、`加上品牌 logo`、`改成国潮风`、`调整镜头`、`局部修改`、`这个视频帮我改一下`。
- 风格类：`转绘`、`换风格`、`风格迁移`、`做成动漫风`、`复刻这段视频的质感`。
- 视频类：`视频续写`、`延长这个片段`、`复刻 TVC`、`做产品展示片`、`用这首歌做 MV`、`一句话生成短剧`、`做短漫剧`。
- 工作流类：`上传参考图`、`上传参考视频`、`查一下进度`、`下载生成结果`、`继续刚才的设计`、`在上一版基础上改`。

## 业务模型

- `design_id` 表示一个设计/画布，是用户最终打开和继续编辑的项目载体。
- 一个 `design_id` 下可以创建多个 `session_id`。不同会话可以围绕同一个设计进行不同方向的创作、修改或探索。
- 一个 `session_id` 下可以创建多条消息。每次发送创作或修改请求都会产生一条用户消息，并可能产生多条 Agent、工具和任务结果消息。
- `request_id` 表示一次提交的异步任务，不等同于 `session_id`。查询本次请求状态可以使用 `request_id`。
- 增量查询使用 `last_message_id` 作为游标；脚本也支持 `--after-seq` 作为兼容别名。
- 没有指定 `design_id` 创建会话时，使用当前默认设计；如果没有当前默认设计，创客贴Agent会创建一个新设计。

## 能力范围

- 切换设计：切到已有 `design_id`，或创建一个全新设计作为当前默认设计。
- 发送消息：向会话发送自然语言创作/编辑请求，并返回 `request_id`。不传 `session_id` 时，创客贴Agent会自动创建新会话并返回。
- 查询进展：按 `request_id` 查询单次请求状态和增量消息。
- 上传文件：上传图片或视频参考素材，返回后续消息可引用的 `file_key`。
- 下载结果：从会话消息或请求结果中提取生成图片链接并下载到本地。
- 打开画布：通过 `design_url` 让用户进入创客贴画布继续编辑。

## 核心原则

- 保留用户原始意图。把用户需求原样或近似原样传给创客贴 Agent，不要擅自改成另一种创意方向。
- 素材先上传再引用。用户给了本地图片、截图、视频或其他参考素材时，先上传素材，再把返回的 `file_key` 作为参考素材传给消息脚本。
- 会话续作以 `session_id` 为准。用户要求“继续刚才的对话”“在上一版基础上改”时，复用上一轮返回的 `session_id`。
- 设计上下文以 `design_id` 为准。用户要求“同一个设计里换方向探索”时，先切到对应 `design_id`，再直接发消息；不传 `session_id` 时创客贴Agent会自动新建会话。
- 查询增量以 `last_message_id` 为准。每次查询后保存 `next_last_message_id`，下一次继续传回。
- 结果交付要包含可操作信息。完成后给用户返回画布链接 `design_url`、下载到本地的文件路径，以及必要的任务状态说明。
- 不要直接手写 HTTP 请求。只能使用脚本；不允许修改脚本，查看脚本内容，跳过脚本直接调用接口

## 环境配置

运行脚本前需要存在：

```bash
export CHUANGKIT_AGENT_SKILL_API_KEY="your-api-key"
```

缺少环境变量时，先提示需要配置哪个变量，不要伪造结果。

## 可用脚本

`scripts/upload_file.py`

上传本地参考素材，返回可传给创作任务的 `file_key`。

```bash
python3 scripts/upload_file.py --file /path/to/reference.png
```

`scripts/switch_design.py`

切换当前默认设计。传 `--design-id` 表示转入已有设计，不传表示创建一个新设计并切过去。

```bash
python3 scripts/switch_design.py
python3 scripts/switch_design.py --design-id "<design_id>"
```

`scripts/send_message.py`

向会话发送一条创作/修改消息。传 `--session-id` 表示续用已有会话；不传则自动创建新会话。传入 `--image-file-key` 或 `--image-url` 表示附带参考图。

```bash
python3 scripts/send_message.py \
  --message "根据参考图生成一张电商海报" \
  --image-file-key "aigc_user_image/..."
```

续作时再补 `--session-id "<session_id>"`。

`scripts/query_request_status.py`

按 `request_id` 查询单次异步请求状态。适合只关心刚提交任务是否完成的场景。

```bash
python3 scripts/query_request_status.py --request-id "<request_id>"
```

`scripts/download_results.py`

从请求结果中提取生成图片并下载到本地。

```bash
python3 scripts/download_results.py --request-id "<request_id>"
```

默认下载目录是 `~/Downloads/chuangkit-agent-results`。只有当用户明确要求保存到指定路径时，才额外传 `--output-dir <path>`。

## 标准工作流

1. 判断用户是否提供了本地素材。
2. 如果有本地素材，逐个运行 `upload_file.py`，记录每个 `file_key`。
3. 如果用户明确要求“新建画布”“换一个设计”“不要继续上一版”，运行 `switch_design.py`，记录返回的 `design_id` 和 `design_url`。
4. 运行 `send_message.py` 发起任务。续作必须带已有 `session_id`；新会话可不传 `session_id`；有参考素材时带一个或多个 `--image-file-key`。
5. 从返回结果中记录 `request_id`、`session_id`、`design_id` 和 `design_url`。
6. 使用 `query_request_status.py` 按 `request_id` 轮询增量消息和任务状态。
7. 如果返回 `has_more=true`，用 `next_last_message_id` 继续拉完消息。
8. 任务完成后运行 `download_results.py` 下载生成结果。
9. 回复用户：说明任务状态，给出 `design_url`，列出下载文件路径。不要输出大段原始 JSON。

## 轮询策略

- 默认每 3 到 5 秒查一次。
- 如果返回 `has_more=true`，优先用 `next_last_message_id` 继续拉完增量消息。
- 如果按 `request_id` 查询返回 `finished=false` 且没有错误，继续轮询。
- 如果返回 `error`，停止轮询并把错误信息告诉用户。
- 如果长时间无结果，说明任务仍在处理中，并保留 `request_id`、`session_id` 方便后续继续查询。
- 视频任务一般需要2-5分钟，轮询间隔可以调长一些，超过轮询次数时，提示用户视频生成较慢，你稍微等一会再看结果，可以先帮用户干别的。

## 用户意图处理

用户说“生成”“设计”“做一张图”“改一下”“继续上一版”“根据这张图”等，都可以触发这个 skill。

处理 prompt 时遵循：

- 不补充用户没要求的品牌、风格、尺寸或文案。
- 用户有明确约束时必须保留，例如平台、比例、颜色、文案、禁止项。
- 用户要求优化表达时，可以轻微整理，但不要改变创意目标。
- 用户只给素材没给明确需求时，先用简短问题确认要生成什么，不要直接发空泛任务。

## 素材规则

- 本地文件必须先上传，不能直接把本地路径写进 prompt。
- 上传返回的 `file_key` 只作为 `--image-file-key` 传给 `send_message.py`。
- 不要把私库 `file_key` 当作公开 URL 发送给用户。
- 当前主要面向参考图工作流。视频文件可以上传，但视频编辑链路需要先验证结果；不要承诺一定支持视频编辑。
- 下载结果时，默认不要自定义输出目录。仅在用户明确要求保存到某个路径时，才传 `--output-dir`。

## 结果交付

正常完成时，回复内容应包含：

- 设计画布链接：`design_url`,如果参数没有返回，则按照规则拼接返回，设计画布地址[点我查看画布](https://www.chuangkit.com/odyssey/design?d={design_id})
- 本地下载文件：`download_results.py` 返回的文件路径
- 后续续作所需信息：`session_id`

如果没有下载到图片，但任务已完成：

- 返回 `design_url`
- 简要说明轮询结果中没有可下载图片
- 保留 `request_id` 供后续排查

## 失败处理

- 环境变量缺失：告诉用户缺少 `CHUANGKIT_AGENT_SKILL_API_KEY`。
- 上传失败：说明哪个文件失败，不继续提交依赖该素材的任务。
- 发起任务失败：返回接口错误信息，保留用户原始需求。
- 轮询失败：返回 `request_id` 和错误信息，方便继续排查。
- 下载失败：不要宣称文件已下载；返回 `design_url` 和失败原因。
- 任何失败都提示用户可以访问创客贴官网联系客服处理，提供对应的request_id，session_id，design_id任意都可以，官网地址[创客贴官网](https://www.ckt.cn)
