# 魔芋 AI 网关 UAT 错误日志分析报告

> 数据范围：2026-07-20 ~ 2026-08-12（近 30 天）
>
> 总计：**121 条**错误 | 生成时间：2026-08-18

---

## 一、总览

| 维度 | 分布 |
|------|------|
| **HTTP 状态码** | 400 (67) · 404 (20) · 500 (15) · 403 (9) · 503 (5) · 502 (3) · 401 (2) |
| **失败阶段** | upstream_request (114) · validate (7) |
| **TOP 5 模型** | deepseek-v4-flash (19) · deepseek-v4-pro (18) · doubao-seedance-2-0-fast-260128 (16) · doubao-seed-2-0-mini-260428 (10) · wan2.6-image (7) |

---

## 二、错误分类与分析

### 类别 1：DeepSeek 腾讯云渠道 404（18 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `bad response status code 404` |
| **HTTP 状态码** | 404 |
| **涉及模型** | deepseek-v4-pro |
| **涉及渠道** | 腾讯云_deepseek |
| **频率** | 18 次（占比 14.9%，**最高频**） |

**根因分析：** 腾讯云 DeepSeek 渠道返回 404，说明上游模型端点不存在或已下线。可能是腾讯云侧的 deepseek-v4-pro 模型路径变更、API 版本升级，或者渠道配置中的模型映射名称与实际可用名称不一致。

**建议：**
1. 登录腾讯云控制台确认 deepseek-v4-pro 模型是否仍可用，检查 API 端点路径是否有变更
2. 如模型已下线/更名，更新渠道中的模型映射配置
3. 考虑为该渠道添加健康检查机制，自动禁用返回 404 的渠道

---

### 类别 2：DeepSeek Thinking 模式参数缺失（13 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `The content[].thinking in the thinking mode must be passed back to the API.` |
| **HTTP 状态码** | 400 |
| **涉及模型** | deepseek-v4-flash |
| **涉及渠道** | pro质量-deepseek官网直连 |
| **频率** | 13 次（占比 10.7%） |

**根因分析：** DeepSeek V4 的 thinking mode 要求多轮对话时将上一轮的 `thinking` content block 回传。网关在转发请求时可能丢弃了 thinking block，或客户端未正确传递历史消息中的 thinking 内容。

**建议：**
1. **网关层面：** 检查请求转发逻辑，确保 `content` 数组中 `type: "thinking"` 的元素不被过滤或丢弃
2. **客户端层面：** 确认前端/SDK 在多轮对话中保留完整的 assistant 回复（含 thinking block）
3. 若网关有消息裁剪/压缩逻辑，需将 thinking block 加入白名单

---

### 类别 3：上游请求失败 - 网络/连接错误（10 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `upstream error: do request failed` |
| **HTTP 状态码** | 500 |
| **涉及模型** | gemini-3-pro-image-preview (3)、gemini-3-flash-preview (3)、gemini-3.1-pro-preview (1)、gpt-5.5 (1)、gpt-5.4 (2) |
| **涉及渠道** | 多个 YW 系列渠道 |
| **频率** | 10 次（占比 8.3%） |

**根因分析：** 上游供应商的 API 端点连接失败，可能原因包括：网络抖动、上游服务临时不可用、DNS 解析超时、或代理/VPN 链路中断。

**建议：**
1. 检查 YW 系列渠道的网络连通性，确认代理配置是否正确
2. 添加自动重试机制（已有 retry_number 字段，确认重试策略是否生效）
3. 配置多渠道 fallback，当主渠道连接失败时自动切换至备用渠道
4. 增加上游连接超时和健康检查探针

---

### 类别 4：豆包视频生成敏感内容拦截（9 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `InputTextSensitiveContentDetected` - The request was rejected... |
| **HTTP 状态码** | 400 |
| **涉及模型** | doubao-seedance-2-0-fast-260128 |
| **涉及渠道** | pro分组-JW-sd2 |
| **频率** | 9 次（占比 7.4%） |

**根因分析：** 用户提交的视频生成 prompt 触发了火山引擎的内容安全审核，被判定为敏感内容。这属于正常的安全拦截行为。

**建议：**
1. **用户侧：** 在前端展示更友好的错误提示，引导用户修改 prompt 内容
2. **网关侧：** 考虑在请求转发前增加预审核层（prompt 预检），减少无效请求
3. 将此类 400 错误标记为"用户输入问题"，与系统故障区分开来，避免干扰运维告警

---

### 类别 5：多模态参数格式不兼容（13 次）

包含以下子类型：

#### 5a. `image_url` 类型不支持（3 次）
- **错误消息：** `unknown variant 'image_url', expected 'text'`
- **模型：** deepseek-v4-flash
- **渠道：** pro质量-deepseek官网直连

#### 5b. `input_file` 类型不支持（6 次）
- **错误消息：** `unknown variant 'input_file'` / `invalid value: 'input_file'`
- **模型：** deepseek-v4-flash、deepseek-reasoner、doubao-1-5-pro-32k、doubao-seed-1-6-flash
- **渠道：** pro质量-deepseek官网直连、pro质量-火山-Doubao 系列、pro质量-阿里-通义千问

#### 5c. `input_audio` 字段不支持（4 次）
- **错误消息：** `unknown field "input_audio"`
- **模型：** doubao-seed-2-0-mini-260428
- **渠道：** pro质量-火山-Doubao 系列

**根因分析：** 网关在转发请求时，未根据目标模型的能力对消息格式进行适配。例如将包含 `image_url`（OpenAI 格式）的请求直接转发给不支持图片输入的 DeepSeek 纯文本模型，或将 `input_file`/`input_audio` 字段传给不支持这些类型的模型。

**建议：**
1. **网关层面：** 在路由层增加模型能力矩阵，根据目标模型支持的 content type 进行参数过滤或格式转换
2. 对不支持多模态的模型，在转发前自动剥离非文本 content block，或返回明确的用户友好错误
3. 建立模型能力注册表：标记每个模型支持的输入类型（text/image/audio/file/video），在请求校验阶段拦截不兼容的调用

---

### 类别 6：wan2.6 图片生成参数错误（7 次）

#### 6a. 缺少图片输入（6 次）
| 项目 | 详情 |
|------|------|
| **错误消息** | `When 'enable_interleave' is False, the last message must contain 1 to 4 images. Got 0 images.` |
| **涉及模型** | wan2.6-image |
| **涉及渠道** | PRO-阿里PolarDB-X-image-20260806 |

#### 6b. 不支持非流式（1 次）
| **错误消息** | `currently stream=False is not supported` |

**根因分析：** wan2.6-image 模型在非交错模式下要求最后一条消息必须包含 1-4 张图片，但请求中未附带图片。另外该模型不支持非流式调用。

**建议：**
1. 在网关对 wan2.6-image 的请求做前置校验：检查 `enable_interleave=False` 时是否携带图片
2. 对 wan2.6-image 强制设置 `stream=True`，避免非流式调用报错
3. 在 API 文档中明确标注 wan2.6-image 的调用约束

---

### 类别 7：视频生成余额/并发限制（7 次）

#### 7a. 余额低于预警阈值（6 次）
| 项目 | 详情 |
|------|------|
| **错误消息** | `余额低于预警阈值（200元），视频并发任务数已达上限（最多1个）` |
| **HTTP 状态码** | 403 |
| **涉及模型** | wan2.7 系列、happyhorse-1.1 系列 |
| **失败阶段** | validate（网关内部校验） |

#### 7b. 套餐额度不足（1 次）
| **错误消息** | `套餐剩余额度不足以覆盖本次预扣（需 300000 Tokens，剩余 266147 Tokens）` |
| **涉及模型** | doubao-seedance-2-0-fast-260128 |

**根因分析：** 阿里云视频生成账户余额低于 200 元阈值导致并发限制为 1，且当前已有任务在执行。或套餐 Token 额度不足。

**建议：**
1. **运维：** 及时充值阿里云视频生成账户至 200 元以上，解除并发限制
2. **系统：** 设置余额监控告警（在余额降至 500 元时提前通知），避免频繁触发限制
3. 对 Token 套餐也设置类似的预警机制

---

### 类别 8：模型未找到/渠道不可用（5 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `获取分组 auto(auto) 下模型 doubao-seedance-2-0-mini-260615 的可用渠道失败` |
| **HTTP 状态码** | 503 |
| **涉及模型** | doubao-seedance-2-0-mini-260615 |
| **涉及渠道** | pro分组-JW-sd2 |

**根因分析：** 模型 `doubao-seedance-2-0-mini-260615` 在渠道分发器中找不到可用渠道，可能是该模型尚未配置渠道映射，或所有已配置的渠道均被禁用/下线。

**建议：**
1. 检查 `doubao-seedance-2-0-mini-260615` 是否已在渠道管理中正确映射
2. 如为新模型，确认已添加对应的上游渠道并启用
3. 如为已下线模型，在前端移除该模型的入口

---

### 类别 9：MiniMax 视频接口版本错误（3 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `该模型请使用 /v2/video_generation 接口` |
| **HTTP 状态码** | 400 |
| **涉及模型** | MiniMax-H3 |
| **涉及渠道** | PRO-Minimax |

**根因分析：** MiniMax H3 模型要求使用 v2 版本的视频生成接口，但网关仍在使用 v1 版本的端点进行请求。

**建议：**
1. 更新 PRO-Minimax 渠道配置，将 MiniMax-H3 模型的请求路径改为 `/v2/video_generation`
2. 检查网关是否支持按模型区分 API 版本路由

---

### 类别 10：WebSocket 异常关闭（3 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `websocket: close 1006 (abnormal closure): unexpected EOF` |
| **HTTP 状态码** | 502 |
| **涉及模型** | doubao-realtime-v1.2.6.1 |
| **涉及渠道** | 端到端语音大模型 |

**根因分析：** 实时语音模型的 WebSocket 连接异常关闭（1006 表示非正常断开），可能是上游服务端主动断开、网络中断或超时。

**建议：**
1. 增加 WebSocket 连接的心跳检测和自动重连机制
2. 检查上游 doubao-realtime 服务的稳定性和超时配置
3. 在网关层面增加 WebSocket 代理的 idle timeout 和 ping/pong 配置

---

### 类别 11：Gemini 生图模型不支持（3 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `not supported model for image generation, only imagen models are supported` |
| **HTTP 状态码** | 500 |
| **涉及模型** | gemini-3-pro-image-preview |
| **涉及渠道** | PRO-博特智能-genimi0.45 |

**根因分析：** 通过博特智能渠道调用 Gemini 生图时，上游仅支持 Imagen 系列模型，不支持 gemini-3-pro-image-preview 进行图片生成。

**建议：**
1. 确认博特智能渠道是否支持 Gemini 生图模型，如不支持则移除该渠道对此模型的映射
2. 将 gemini-3-pro-image-preview 的生图请求路由到支持该模型的渠道

---

### 类别 12：火山引擎 API Key 失效（2 次）

| 项目 | 详情 |
|------|------|
| **错误消息** | `The API key status is not active` |
| **HTTP 状态码** | 401 |
| **涉及模型** | doubao-seedance-2-0-fast-260128 |
| **涉及渠道** | pro-火山大模型-seedance-2.0 |

**根因分析：** 火山引擎 API Key 已失效或被停用。

**建议：**
1. 登录火山引擎控制台检查并更新该渠道的 API Key
2. 设置 API Key 过期前的自动告警提醒
3. 配置 Key 轮换机制，避免单一 Key 失效导致全部请求失败

---

### 类别 13：其他零散错误（6 次）

| 错误 | 次数 | 模型 | 说明 |
|------|------|------|------|
| 图片尺寸太小（min 14px） | 4 | doubao-seed-2-0-mini | 用户上传图片不满足最小尺寸要求 |
| 图片格式不支持 | 2 | doubao-seed-1-6-flash | 上传的图片格式不被 API 支持 |
| 下载图片连接失败 | 2 | doubao-seed-1-6-flash | 图片 URL 对应的服务器连接超时 |
| 资源不再可用 | 2 | glm-5.1 / deepseek-v4-flash | 华为云渠道资源下线 |
| 视频参数 duration 无效 | 4 | doubao-seedance 系列 | 视频时长参数不符合模型要求 |
| task_type 参数无效 | 1 | doubao-seedance-1-5-pro | 任务类型不被模型支持 |
| content 参数无效 | 1 | doubao-seedance-2-0-fast | content 字段格式错误 |
| LLM 收到多模态消息 | 2 | doubao-1-5-pro-32k | 纯文本模型收到图片/多模态输入 |
| bad response 400 (Claude) | 1 | claude-sonnet-4-6 | 上游返回 400，具体原因未知 |
| 并发限制 (Claude) | 1 | claude-sonnet-4-6 | Anthropic 账户并发超限 |
| invalid connection | 1 | (空) | 网关内部连接异常 |

**建议：**
- 图片尺寸/格式问题：在网关前置校验中增加图片预检（尺寸 >= 14px、格式白名单）
- 图片 URL 下载失败：增加 URL 可达性预检或提供上传替代方案
- 视频参数错误：在网关层面添加模型维度的参数校验规则
- Claude 并发限制：监控 Anthropic 账户并发配额，必要时申请提升

---

## 三、优先级排序

| 优先级 | 类别 | 次数 | 建议动作 |
|--------|------|------|----------|
| **P0 - 立即处理** | 腾讯云 DeepSeek 404 | 18 | 确认渠道配置，修复模型映射或禁用失效渠道 |
| **P0 - 立即处理** | 火山引擎 API Key 失效 | 2 | 更新 API Key |
| **P1 - 本周处理** | DeepSeek thinking 参数丢失 | 13 | 修复网关转发逻辑，保留 thinking block |
| **P1 - 本周处理** | 多模态参数不兼容 | 13 | 建立模型能力矩阵，增加参数适配层 |
| **P1 - 本周处理** | 上游连接失败 | 10 | 检查网络/代理配置，增加重试和 fallback |
| **P2 - 近期优化** | MiniMax 接口版本错误 | 3 | 更新渠道 API 路径至 v2 |
| **P2 - 近期优化** | 视频余额/并发限制 | 7 | 充值 + 设置余额监控告警 |
| **P2 - 近期优化** | 模型渠道不可用 (503) | 5 | 添加或修复 doubao-seedance-2-0-mini-260615 渠道映射 |
| **P2 - 近期优化** | Gemini 生图渠道不匹配 | 3 | 调整渠道路由 |
| **P3 - 持续改进** | 敏感内容拦截 | 9 | 优化前端提示，非系统故障 |
| **P3 - 持续改进** | wan2.6 参数校验 | 7 | 增加前置参数校验 |
| **P3 - 持续改进** | 其他零散错误 | 6 | 逐个排查修复 |

---

## 四、系统性建议

1. **模型能力注册表：** 建立每个模型支持的输入类型（text/image/audio/file/video）、API 版本、参数约束等元数据，在网关路由层做前置校验，避免无效请求到达上游
2. **渠道健康检查：** 对所有渠道添加周期性探活，自动禁用连续返回 4xx/5xx 的渠道，修复后自动恢复
3. **API Key 生命周期管理：** 记录所有渠道 API Key 的创建/过期时间，提前 7 天告警
4. **错误分级告警：** 区分系统故障（5xx、连接失败）和用户输入错误（敏感内容、参数格式），仅对系统故障触发运维告警
5. **自动重试优化：** 对网络超时类错误增加指数退避重试，对 4xx 参数错误不重试
