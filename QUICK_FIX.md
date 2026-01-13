# 快速修复指南

## 立即执行这些步骤：

### 1. 应用数据库Migration（必需！）

```bash
cd apps/backend
uv run python apply_migration.py
```

这会添加缺失的数据库字段：`message_count`, `last_message_preview` 等。

### 2. 重新启动服务

```bash
# 在项目根目录
make dev
```

---

## 已修复的问题：

### ✅ 问题1: PyJWT依赖
- 已经在 `pyproject.toml` 中，无需额外安装

### ✅ 问题2: 数据库字段缺失
- 创建了 `apply_migration.py` 脚本快速应用

### ✅ 问题3: 后端处理None的bug
- `main.py` 的 `get_state()` 现在正确处理session为None的情况

### ✅ 问题4: user_id未传递
- `ChatInterface.jsx` 现在在发送消息时包含 `user_id`
- 后端 `/chat` 接口要求 `user_id`（返回400错误如果缺失）

### ✅ 问题5: 前端错误提示
- 添加了用户友好的错误提示（alert）
- 控制台仍然记录详细错误

---

## 验证步骤：

### 1. 检查Migration是否成功
```bash
cd apps/backend
uv run python apply_migration.py
# 应该看到 "✅ Migration applied successfully!"
```

### 2. 启动服务
```bash
# 回到项目根目录
cd ../..
make dev
```

### 3. 测试功能
1. 登录应用
2. 创建新会话
3. 发送消息："推荐一些Chill Jazz"
4. 等待5-10秒，标题应该自动生成
5. 检查左侧列表是否显示消息数量和预览

---

## 如果还有问题：

### 检查数据库连接
```bash
cd apps/backend
uv run python -c "from database import engine; print('DB OK')"
```

### 查看完整的表结构
连接到Supabase Dashboard -> SQL Editor，运行：
```sql
\d conversations
```

应该看到新字段：
- message_count
- last_message_preview
- last_message_at
- is_pinned
- is_archived

---

现在运行 `cd apps/backend && uv run python apply_migration.py` 来应用migration！
