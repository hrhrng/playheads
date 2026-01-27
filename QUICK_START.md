# 🚀 快速启动指南

## 立即开始测试

### 方法 1：自动验证（推荐）

```bash
# 运行验证脚本
./test-setup.sh
```

这会检查：
- ✅ Python3 和 Node.js 是否安装
- ✅ 前端依赖是否完整
- ✅ 代码是否可以构建
- ✅ 是否有语法错误

### 方法 2：手动启动

#### 终端 1 - 启动后端
```bash
cd apps/backend
uvicorn main:app --reload
```

**预期输出**：
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

#### 终端 2 - 启动前端
```bash
cd apps/web
npm run dev
```

**预期输出**：
```
  VITE v5.4.21  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

#### 浏览器
打开：http://localhost:5173

---

## 🎯 快速测试清单（5 分钟）

### ✅ 测试 1：基础 Tool Call
**输入**：`搜索周杰伦`

**预期看到**：
- [ ] Agent 回复文本
- [ ] 🔍🎵 `search_music` 卡片
- [ ] 卡片从蓝色（执行中）变为绿色（完成）
- [ ] 点击卡片可展开/折叠
- [ ] 展开后显示 JSON 参数和结果

**截图位置**：apps/web/docs/screenshots/tool-call-basic.png

---

### ✅ 测试 2：Markdown 渲染
**输入**：
```
告诉我关于 **摇滚音乐** 的信息：

1. 起源
2. 代表人物
```

**预期看到**：
- [ ] "摇滚音乐" 显示为粗体
- [ ] 列表正确显示为有序列表
- [ ] 文字保持大字体

---

### ✅ 测试 3：工具错误处理
**输入**：`播放第 999 首歌`

**预期看到**：
- [ ] ▶️ `play_track` 卡片
- [ ] 红色边框
- [ ] "✗ 失败" 状态
- [ ] 展开后显示错误信息

---

### ✅ 测试 4：多工具序列
**输入**：`搜索周杰伦然后播放第一首`

**预期看到**：
- [ ] 两个工具卡片：`search_music` + `play_track`
- [ ] 每个卡片独立状态
- [ ] 按顺序执行

---

## 🔍 调试检查点

### 如果看不到 Tool Call 卡片

#### 1. 检查 Network（F12 → Network）
筛选 EventStream，应该看到：
```
event: text
data: {"content":"..."}

event: tool_start
data: {"id":"...","tool_name":"search_music","args":{...}}

event: tool_end
data: {"id":"...","tool_name":"search_music","result":"...","status":"success"}
```

#### 2. 检查 Console（F12 → Console）
不应该有红色错误。如果有：
- `MarkdownMessage is not defined` → 检查导入
- `Cannot read property 'parts'` → 检查消息结构
- `react-markdown` 相关错误 → 重新安装依赖

#### 3. 检查 React DevTools
打开 Components 面板，找到 MessageList：
```
MessageList
  └─ messages: Array(2)
       └─ [1]: {role: "agent", parts: Array(3)}
            └─ parts[1]: {type: "tool_call", ...}
```

---

## 📱 移动端测试（可选）

### Chrome 设备模拟
1. F12 → Toggle device toolbar (Cmd+Shift+M)
2. 选择设备：iPhone 12 Pro
3. 发送消息测试

**检查**：
- [ ] 卡片不溢出屏幕
- [ ] JSON 代码可横向滚动
- [ ] 按钮可点击
- [ ] 文字可读

---

## 🎨 样式验证

### Tool Call 颜色
- **Pending**: `border-blue-500 bg-blue-50`
- **Success**: `border-green-500 bg-green-50`
- **Error**: `border-red-500 bg-red-50`

### 工具图标
```
search_music       → 🔍🎵
play_track         → ▶️
skip_next          → ⏭️
add_to_playlist    → ➕🎵
remove_from_playlist → ❌
get_now_playing    → 🎧
get_playlist       → 📋
```

---

## 📊 性能测试（可选）

### 测试大量消息
1. 连续发送 10 条消息
2. 检查滚动流畅度
3. 打开 Chrome Task Manager（Shift+Esc）
4. 检查内存使用

**预期**：
- 滚动 60fps
- 内存稳定（不持续增长）
- 无卡顿

---

## ✅ 测试完成检查表

- [ ] Tool call 卡片正常显示
- [ ] 状态颜色正确（蓝/绿/红）
- [ ] 可展开/折叠
- [ ] Markdown 渲染正确
- [ ] 移动端响应式正常
- [ ] 无 Console 错误
- [ ] SSE 事件格式正确

---

## 📚 更多资源

- **详细测试指南**：`TESTING_GUIDE.md`
- **实施总结**：`IMPLEMENTATION_SUMMARY.md`
- **代码演示**：`CODE_DEMO.md`
- **故障排查**：`TESTING_GUIDE.md` 第 "常见问题排查" 节

---

## 🎉 测试通过后

如果所有测试通过：

1. **提交代码**：
```bash
git add .
git commit -m "feat: Add tool call display and markdown support

- Add structured tool call visualization with status (pending/success/error)
- Add markdown rendering for agent responses
- Add thinking process display (optional)
- Maintain backward compatibility with old message format
- Add music-themed icons for all 7 tools
- Add responsive design for mobile

Co-Authored-By: Claude <noreply@anthropic.com>"
```

2. **（可选）创建功能分支**：
```bash
git checkout -b feat/tool-call-markdown
git push -u origin feat/tool-call-markdown
```

3. **部署到生产环境**

---

**准备好了吗？运行 `./test-setup.sh` 开始测试！** 🚀
