# 会话系统重构 - 部署和测试指南

## 重构完成概要

### 已完成的更改

#### 后端更改
1. **数据库模型** (`apps/backend/models.py`)
   - ✅ 添加字段: `message_count`, `last_message_preview`, `last_message_at`, `is_pinned`, `is_archived`
   - ✅ `title` 改为可空（将从首条消息生成）
   - ✅ 添加索引以优化查询性能

2. **会话管理** (`apps/backend/state.py`)
   - ✅ 重写 `SessionStore` 类
   - ✅ 删除 `get_or_create_session`（语义不清）
   - ✅ 新增 `get_session`（只读，不创建）
   - ✅ 新增 `create_session`（显式创建）
   - ✅ `update_session` 自动更新元数据并生成标题

3. **Agent逻辑** (`apps/backend/agent.py`)
   - ✅ 修改 `run_agent` 使用新的会话管理逻辑
   - ✅ 要求 `user_id` 参数（安全性）

4. **API接口** (`apps/backend/main.py`)
   - ✅ `GET /conversations` - 添加user_id过滤和元数据返回
   - ✅ `DELETE /conversations/{id}` - 添加权限检查
   - ✅ `PATCH /conversations/{id}` - 新增更新元数据接口

5. **标题生成** (`apps/backend/title_generator.py`)
   - ✅ 使用 kimi-k2-turbo-preview 生成标题
   - ✅ 首条消息触发，每10条消息重新生成
   - ✅ 超时保护（5秒）

#### 前端更改
1. **状态管理** (`apps/web/src/App.jsx`)
   - ✅ 删除 `customSessionId` 和 `appleSessionId` 混乱逻辑
   - ✅ 统一使用 `activeConversationId`
   - ✅ `fetchConversations` 添加user_id参数
   - ✅ 删除操作支持回滚

2. **UI增强** (`apps/web/src/components/AppLayout.jsx`)
   - ✅ 显示会话标题（动态生成）
   - ✅ 显示消息数量
   - ✅ 显示最后消息预览

---

## 部署步骤

### 1. 应用数据库Migration

**方法A: 使用psql命令行**
```bash
# 连接到你的Supabase数据库
psql "<YOUR_DATABASE_URL>" -f apps/backend/migrations/001_enhance_conversations.sql
```

**方法B: 使用Supabase Dashboard**
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 复制 `apps/backend/migrations/001_enhance_conversations.sql` 内容
4. 粘贴并执行

**方法C: 使用Python脚本**
```bash
# 在 apps/backend 目录下
python -c "
from database import engine
import asyncio

async def migrate():
    async with engine.begin() as conn:
        with open('migrations/001_enhance_conversations.sql') as f:
            await conn.execute(f.read())
    print('Migration applied successfully')

asyncio.run(migrate())
"
```

### 2. 重启后端服务

```bash
# 在项目根目录
# 如果后端在运行，先停止（Ctrl+C）

# 重新启动后端
cd apps/backend
uvicorn main:app --reload --port 8000
```

### 3. 重启前端服务（如果需要）

```bash
# 在项目根目录
cd apps/web
npm run dev
```

---

## 测试清单

### 功能测试

#### ✅ 1. 新会话创建
**步骤:**
1. 登录应用
2. 点击"New Chat"按钮
3. 发送第一条消息："推荐一些Chill Jazz"

**预期结果:**
- ✓ 新会话立即出现在左侧列表（标题初始为"New Conversation"）
- ✓ 5-10秒内标题自动更新为类似"Chill Jazz Recommendations"
- ✓ 消息数量显示为"2"（用户消息 + agent回复）
- ✓ 最后消息预览显示agent的回复前100字符

#### ✅ 2. 会话切换
**步骤:**
1. 创建至少2个会话
2. 在会话之间来回切换

**预期结果:**
- ✓ 切换时正确加载历史消息
- ✓ 活跃会话高亮显示（白色背景）
- ✓ 切换流畅无错误

#### ✅ 3. 删除会话
**步骤:**
1. 展开左侧边栏（点击汉堡菜单）
2. 悬停在某个会话上
3. 点击出现的删除按钮
4. 确认删除

**预期结果:**
- ✓ 会话立即从列表中消失（乐观更新）
- ✓ 如果删除的是活跃会话，自动创建新会话
- ✓ 如果后端失败，列表回滚并显示错误提示

#### ✅ 4. 标题生成
**步骤:**
1. 创建新会话
2. 发送消息："Give me some 90s rock music"
3. 等待5-10秒

**预期结果:**
- ✓ 标题从"New Conversation"更新为"90s Rock Music"或类似
- ✓ 继续发送4条消息
- ✓ 第10条消息后标题可能重新生成

#### ✅ 5. 元数据显示
**步骤:**
1. 创建会话并发送几条消息
2. 观察左侧列表

**预期结果:**
- ✓ 显示消息数量（右侧小数字）
- ✓ 显示最后消息预览（灰色文本）
- ✓ 折叠边栏时元数据隐藏，只显示图标

---

## 验证数据库更改

```sql
-- 检查表结构
\d conversations

-- 应该看到新增字段:
-- message_count | integer
-- last_message_preview | text
-- last_message_at | timestamp with time zone
-- is_pinned | boolean
-- is_archived | boolean

-- 检查索引
\d+ conversations

-- 应该看到:
-- idx_conversations_user_updated
-- idx_conversations_user_pinned

-- 查看现有会话数据
SELECT id, title, message_count, last_message_preview, is_pinned, is_archived
FROM conversations
ORDER BY updated_at DESC
LIMIT 5;
```

---

## 已知问题与解决方案

### 问题1: Migration失败 - title列不能设置为NULL
**原因:** 现有数据有NOT NULL约束

**解决:** Migration脚本已包含 `ALTER COLUMN title DROP NOT NULL`

### 问题2: 标题生成超时
**原因:** LLM API响应慢

**解决:** 已设置5秒超时，失败时使用默认标题"New Conversation"

### 问题3: 前端显示"New Conversation"而不是生成的标题
**原因:** 标题异步生成，前端需刷新

**解决:** 每次消息发送后 `fetchConversations()` 会重新获取列表

---

## 回滚方案（如果需要）

如果重构出现严重问题，可以回滚：

```sql
-- 回滚数据库更改
ALTER TABLE conversations
DROP COLUMN IF EXISTS message_count,
DROP COLUMN IF EXISTS last_message_preview,
DROP COLUMN IF EXISTS last_message_at,
DROP COLUMN IF EXISTS is_pinned,
DROP COLUMN IF EXISTS is_archived;

ALTER TABLE conversations
ALTER COLUMN title SET NOT NULL,
ALTER COLUMN title SET DEFAULT 'New Conversation';

DROP INDEX IF EXISTS idx_conversations_user_updated;
DROP INDEX IF EXISTS idx_conversations_user_pinned;
```

然后使用git恢复代码：
```bash
git checkout main  # 或你的主分支
```

---

## 性能监控

监控以下指标确保重构成功：

1. **会话列表查询时间** - 应该 <100ms（有索引）
2. **标题生成时间** - 应该 <5秒（有超时）
3. **消息发送延迟** - 应该与之前一致（标题异步生成）

---

## 后续优化（未包含在本次重构）

1. 会话归档功能（is_archived已有字段）
2. 会话置顶功能（is_pinned已有字段）
3. 会话搜索功能
4. 导出会话历史
5. 多端实时同步（WebSocket）

---

## 联系支持

如有问题，请检查：
- Backend logs: 启动后端时的终端输出
- Browser console: 前端错误日志（F12 开发者工具）
- Database logs: Supabase Dashboard -> Logs

祝测试顺利！🎉
