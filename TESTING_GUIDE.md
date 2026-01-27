# Tool Call & Markdown 功能测试指南

## 🚀 启动服务

### 1. 启动后端
```bash
cd apps/backend
uvicorn main:app --reload
```

后端应该运行在 http://localhost:8000

### 2. 启动前端
```bash
cd apps/web
npm run dev
```

前端应该运行在 http://localhost:5173

---

## ✅ 测试场景

### 场景 1: 基础 Tool Call 展示

**发送消息**：`搜索周杰伦的歌`

**预期结果**：
- ✅ 看到 `search_music` 工具调用卡片
- ✅ 卡片显示 🔍🎵 图标
- ✅ 初始状态：蓝色边框 + "执行中..." 脉冲动画
- ✅ 完成后：绿色边框 + "✓ 完成"
- ✅ 点击卡片可以展开/折叠
- ✅ 展开后显示：
  - 参数（JSON 格式）：`{"query": "周杰伦"}`
  - 结果：搜索到的歌曲列表

---

### 场景 2: 多个工具调用序列

**发送消息**：`搜索周杰伦的歌，然后播放第一首`

**预期结果**：
- ✅ 第一个卡片：`search_music`（🔍🎵）
- ✅ 第二个卡片：`play_track`（▶️）
- ✅ 每个卡片独立展开/折叠
- ✅ 每个卡片显示各自的参数和结果

---

### 场景 3: Markdown 渲染

**发送消息**：
```
告诉我关于**摇滚音乐**的信息：

1. 起源时间
2. 代表人物
3. 经典歌曲

使用 `code` 标记专业术语。
```

**预期结果**：
- ✅ "摇滚音乐" 显示为粗体
- ✅ 列表正确显示为有序列表
- ✅ `code` 显示为灰色背景的行内代码
- ✅ 文本保持大字体（2xl/3xl）

---

### 场景 4: Tool 执行错误

**发送消息**：`播放第 999 首歌`（不存在的索引）

**预期结果**：
- ✅ `play_track` 卡片显示红色边框
- ✅ 状态显示 "✗ 失败"
- ✅ 展开后结果区域显示错误信息

---

### 场景 5: 所有工具类型

测试所有工具的图标和功能：

| 消息 | 工具 | 图标 | 预期 |
|-----|------|------|------|
| "搜索周杰伦" | `search_music` | 🔍🎵 | 搜索参数和结果 |
| "播放第一首" | `play_track` | ▶️ | 播放索引 |
| "跳到下一首" | `skip_next` | ⏭️ | 无参数 |
| "添加到播放列表" | `add_to_playlist` | ➕🎵 | 歌曲 ID |
| "从播放列表移除" | `remove_from_playlist` | ❌ | 歌曲 ID |
| "现在在播什么" | `get_now_playing` | 🎧 | 当前歌曲信息 |
| "显示播放列表" | `get_playlist` | 📋 | 播放列表 |

---

### 场景 6: Thinking Process（如果支持）

**注意**：当前模型（kimi-k2）可能不支持 thinking，此功能为可选。

**如果模型返回 thinking**：
- ✅ 看到 "DJ 正在思考..." 卡片
- ✅ 紫蓝色边框 + 🎧 图标
- ✅ 默认折叠状态
- ✅ 点击展开显示思考内容
- ✅ 内容以斜体显示

---

### 场景 7: 向后兼容性

**前提**：数据库中有旧格式的消息（`{role, content}`）

**预期结果**：
- ✅ 旧消息仍然正常显示（纯文本）
- ✅ 新消息使用新格式（parts 数组）
- ✅ 两种格式混合显示无问题

---

## 🔍 浏览器开发工具验证

### Network 面板 - EventStream

1. 打开 Chrome DevTools (F12)
2. 切换到 Network 面板
3. 筛选类型：选择 "EventStream" 或 "Other"
4. 发送消息

**预期看到的 SSE 事件**：

```
event: text
data: {"content":"好的"}

event: tool_start
data: {"id":"call_xxx","tool_name":"search_music","args":{"query":"周杰伦"}}

event: text
data: {"content":"我找到了"}

event: tool_end
data: {"id":"call_xxx","tool_name":"search_music","result":"...","status":"success"}

event: done
data: {"actions":[...],"session_id":"..."}
```

---

## 🎨 样式检查清单

### Tool Call 卡片样式
- ✅ 大图标（text-2xl）
- ✅ 工具名称大字体（text-xl）
- ✅ pending: 蓝色边框 + 蓝色背景
- ✅ success: 绿色边框 + 绿色背景
- ✅ error: 红色边框 + 红色背景
- ✅ 脉冲动画在 pending 状态
- ✅ JSON 代码块有白色背景和等宽字体

### Thinking Process 样式
- ✅ 紫蓝色边框（indigo-300）
- ✅ 淡紫背景（indigo-50）
- ✅ 🎧 图标
- ✅ 展开/折叠图标（▶/▼）
- ✅ 内容为斜体

### Markdown 样式
- ✅ 代码块：深灰色背景 + 白色文字
- ✅ 行内代码：灰色背景 + 加粗
- ✅ 列表：正确缩进和圆点
- ✅ 粗体：font-weight: 700
- ✅ 链接：蓝色 + 下划线

---

## 📱 移动端测试

### 响应式检查

1. 打开 Chrome DevTools (F12)
2. 切换到设备模拟模式 (Cmd+Shift+M / Ctrl+Shift+M)
3. 选择设备：iPhone 12 Pro, iPad, etc.

**检查项**：
- ✅ Tool call 卡片宽度适应屏幕
- ✅ JSON 代码横向滚动（不溢出）
- ✅ 文字大小在移动端可读
- ✅ 展开/折叠按钮可点击
- ✅ 不出现横向滚动条

---

## 🐛 常见问题排查

### 问题 1: 看不到 Tool Call 卡片
**可能原因**：
- SSE 事件未正确发送
- chatStore.js 解析错误
- 组件导入失败

**排查步骤**：
1. 检查 Network 面板是否收到 `event: tool_start`
2. 检查 Console 是否有错误
3. 检查 React DevTools 中的 state 是否有 `parts` 数组

### 问题 2: Markdown 不渲染
**可能原因**：
- react-markdown 未安装
- prose 样式未加载

**排查步骤**：
1. 运行 `npm list react-markdown` 确认安装
2. 检查 index.css 是否包含 `.prose` 样式
3. 检查浏览器 Elements 面板中是否有 `prose` class

### 问题 3: Tool 状态不更新
**可能原因**：
- tool_end 事件的 ID 不匹配
- toolCallsMap 未正确追踪

**排查步骤**：
1. 检查 tool_start 和 tool_end 的 ID 是否一致
2. 添加 console.log 在 chatStore.js 中查看 toolCallsMap
3. 检查 updateMessage 是否被调用

### 问题 4: 后端报错
**可能原因**：
- AIMessageChunk 结构与预期不符
- active_tool_calls 字典错误

**排查步骤**：
1. 检查后端 console 输出
2. 添加 print 语句在 agent.py 中查看 msg_obj 结构
3. 验证 LangChain/LangGraph 版本兼容性

---

## ✨ 性能检查

### 大量消息测试
1. 发送 10+ 条消息（混合文本和工具调用）
2. 检查滚动性能
3. 检查内存使用（Chrome Task Manager）

**预期**：
- ✅ 流畅滚动
- ✅ 内存稳定（不持续增长）
- ✅ 展开/折叠响应快

---

## 📝 测试记录模板

```markdown
## 测试日期：2026-01-14

### 环境
- 后端：uvicorn main:app --reload (端口 8000)
- 前端：npm run dev (端口 5173)
- 浏览器：Chrome 120+
- 设备：MacBook Pro / iPhone

### 测试结果

- [ ] 场景 1: 基础 Tool Call ✅/❌
- [ ] 场景 2: 多工具调用 ✅/❌
- [ ] 场景 3: Markdown 渲染 ✅/❌
- [ ] 场景 4: 错误处理 ✅/❌
- [ ] 场景 5: 所有工具图标 ✅/❌
- [ ] 场景 6: Thinking Process ✅/❌ (可选)
- [ ] 场景 7: 向后兼容 ✅/❌

### 发现的问题
1.
2.
3.

### 性能表现
- 首次加载时间：
- SSE 响应延迟：
- 内存使用：
```

---

## 🎯 成功标准

全部功能通过测试，应该满足：
- ✅ 所有 7 个工具正确显示图标和状态
- ✅ Markdown 渲染正确（粗体、列表、代码）
- ✅ Tool call 卡片可展开/折叠
- ✅ 状态颜色正确（蓝/绿/红）
- ✅ 移动端响应式正常
- ✅ 旧消息向后兼容
- ✅ 无控制台错误
- ✅ SSE 事件正确格式

---

完成测试后，你就可以自信地使用新的 tool call 和 markdown 功能了！🎉
