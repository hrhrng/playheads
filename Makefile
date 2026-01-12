.PHONY: dev dev-web dev-backend install install-web install-backend clean help

# 默认目标：同时启动前后端
dev:
	@echo "🚀 Starting frontend and backend..."
	@make -j2 dev-web dev-backend

# 启动前端
dev-web:
	@echo "🌐 Starting web frontend..."
	cd apps/web && rm -rf node_modules/.vite && npm run dev

# 启动后端
dev-backend:
	@echo "🔧 Starting backend..."
	uv run --package backend uvicorn apps.backend.main:app --port 8000 --reload

# 安装所有依赖
install: install-web install-backend
	@echo "✅ All dependencies installed!"

# 安装前端依赖
install-web:
	@echo "📦 Installing web dependencies..."
	npm install

# 安装后端依赖
install-backend:
	@echo "📦 Installing backend dependencies..."
	uv sync

# 清理缓存
clean:
	@echo "🧹 Cleaning caches..."
	rm -rf apps/web/node_modules/.vite
	rm -rf apps/web/.next
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Cleaned!"

# 帮助信息
help:
	@echo "Available commands:"
	@echo "  make dev          - Start both frontend and backend"
	@echo "  make dev-web      - Start frontend only"
	@echo "  make dev-backend  - Start backend only"
	@echo "  make install      - Install all dependencies"
	@echo "  make install-web  - Install frontend dependencies"
	@echo "  make install-backend - Install backend dependencies"
	@echo "  make clean        - Clean caches"
	@echo "  make help         - Show this help"
