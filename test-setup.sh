#!/bin/bash

# Playheads 快速测试脚本
# 用于快速验证 tool call 和 markdown 功能

echo "🎵 Playheads Tool Call & Markdown 功能测试"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -d "apps/backend" ] || [ ! -d "apps/web" ]; then
    echo "❌ 错误：请在 playheads 项目根目录运行此脚本"
    exit 1
fi

echo "📦 检查依赖..."

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

# 检查 Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

echo "✅ Python3: $(python3 --version)"
echo "✅ Node.js: $(node --version)"
echo ""

# 检查前端依赖
echo "📦 检查前端依赖..."
cd apps/web-new
if ! npm list react-markdown &> /dev/null; then
    echo "❌ react-markdown 未安装，正在安装..."
    npm install react-markdown remark-gfm
fi
echo "✅ react-markdown 已安装"
cd ../..

echo ""
echo "🔨 构建检查..."

# 检查前端构建
echo "   检查前端代码..."
cd apps/web-new
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ 前端代码构建成功"
else
    echo "❌ 前端代码构建失败，请检查错误"
    exit 1
fi
cd ../..

# 检查后端语法
echo "   检查后端代码..."
python3 -m py_compile apps/backend/agent.py apps/backend/main.py
if [ $? -eq 0 ]; then
    echo "✅ 后端代码语法正确"
else
    echo "❌ 后端代码有语法错误"
    exit 1
fi

echo ""
echo "✨ 所有检查通过！"
echo ""
echo "🚀 启动服务："
echo ""
echo "1️⃣  启动后端（在新终端）："
echo "   cd apps/backend && uvicorn main:app --reload"
echo ""
echo "2️⃣  启动前端（在新终端）："
echo "   cd apps/web-new && npm run dev"
echo ""
echo "3️⃣  打开浏览器："
echo "   http://localhost:3001"
echo ""
echo "📚 详细测试指南："
echo "   cat TESTING_GUIDE.md"
echo ""
echo "🎯 快速测试消息："
echo "   • 搜索周杰伦的歌"
echo "   • 播放第一首"
echo "   • 告诉我关于 **摇滚音乐** 的信息"
echo ""
