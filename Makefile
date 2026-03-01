.PHONY: dev dev-web dev-backend install install-web install-backend clean help \
       test test-backend test-web lint lint-web type-check ci

# =============================================================================
# Development
# =============================================================================

dev:
	@echo "Starting frontend and backend..."
	@make -j2 dev-web dev-backend

dev-web:
	@echo "Starting web frontend..."
	rm -rf apps/web/node_modules/.vite && pnpm --filter web dev

dev-backend:
	@echo "Starting backend..."
	uv run --package backend uvicorn apps.backend.main:app --port 8001 --reload

# =============================================================================
# Install
# =============================================================================

install: install-web install-backend
	@echo "All dependencies installed!"

install-web:
	@echo "Installing web dependencies..."
	pnpm install --filter web

install-backend:
	@echo "Installing backend dependencies..."
	uv sync --project apps/backend --extra dev

# =============================================================================
# Test
# =============================================================================

test: test-backend test-web

test-backend:
	uv run --project apps/backend pytest apps/backend/ -v

test-web:
	pnpm --filter web test

# =============================================================================
# Lint & Type-check
# =============================================================================

lint: lint-web

lint-web:
	pnpm --filter web lint

type-check:
	pnpm --filter web type-check

# =============================================================================
# CI (mirrors GitHub Actions)
# =============================================================================

ci: lint type-check test

# =============================================================================
# Clean
# =============================================================================

clean:
	@echo "Cleaning caches..."
	rm -rf apps/web/node_modules/.vite
	rm -rf apps/web/.next
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned!"

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Available commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev            - Start both frontend and backend"
	@echo "    make dev-web        - Start frontend only"
	@echo "    make dev-backend    - Start backend only"
	@echo ""
	@echo "  Install:"
	@echo "    make install        - Install all dependencies"
	@echo "    make install-web    - Install frontend dependencies"
	@echo "    make install-backend - Install backend dependencies"
	@echo ""
	@echo "  Test:"
	@echo "    make test           - Run all tests (backend + frontend)"
	@echo "    make test-backend   - Run backend tests only"
	@echo "    make test-web       - Run frontend tests only"
	@echo ""
	@echo "  Quality:"
	@echo "    make lint           - Lint frontend"
	@echo "    make type-check     - TypeScript type checking"
	@echo "    make ci             - Full CI pipeline (lint + type-check + test)"
	@echo ""
	@echo "  Other:"
	@echo "    make clean          - Clean caches"
	@echo "    make help           - Show this help"
