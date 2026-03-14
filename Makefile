.PHONY: dev dev-web dev-backend dev-landing install install-web install-backend \
       install-landing clean help test test-backend test-web lint lint-web \
       type-check ci build-landing deploy-landing \
       deploy deploy-preview deploy-production build-web \
       deploy-preview-web deploy-preview-gateway \
       deploy-preview-landing deploy-production-landing \
       deploy-preview-admin deploy-production-admin \
       deploy-production-web deploy-production-gateway \
       deploy-secrets-preview deploy-secrets-production

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

dev-landing:
	@echo "Starting landing page..."
	pnpm --filter landing dev

# =============================================================================
# Install
# =============================================================================

install: install-web install-landing install-backend
	@echo "All dependencies installed!"

install-web:
	@echo "Installing web dependencies..."
	pnpm install --filter web

install-landing:
	@echo "Installing landing dependencies..."
	pnpm install --filter landing

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
# Landing
# =============================================================================

build-landing:
	pnpm --filter landing build

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
# Deploy (Cloudflare)
# =============================================================================

deploy: deploy-preview

deploy-preview: build-web build-landing deploy-preview-landing deploy-preview-admin deploy-preview-web deploy-preview-gateway

deploy-production: build-web build-landing deploy-production-landing deploy-production-admin deploy-production-web deploy-production-gateway

build-web:
	@echo "Building web frontend..."
	pnpm --filter web build

deploy-preview-landing:
	@echo "Deploying landing worker (preview)..."
	cd apps/landing && npx wrangler deploy --config wrangler.preview.toml

deploy-preview-admin:
	@echo "Deploying admin worker (preview)..."
	cd apps/admin && npx wrangler deploy

deploy-preview-web:
	@echo "Deploying web worker (preview)..."
	cd apps/web && npx wrangler deploy --config wrangler.preview.toml

deploy-preview-gateway:
	@echo "Deploying gateway worker (preview)..."
	cd apps/gateway && npx wrangler deploy --config wrangler.preview.toml

deploy-production-landing:
	@echo "Deploying landing worker (production)..."
	cd apps/landing && npx wrangler deploy --config wrangler.production.toml

deploy-production-admin:
	@echo "Deploying admin worker (production)..."
	cd apps/admin && npx wrangler deploy

deploy-production-web:
	@echo "Deploying web worker (production)..."
	cd apps/web && npx wrangler deploy --config wrangler.production.toml

deploy-production-gateway:
	@echo "Deploying gateway worker (production)..."
	cd apps/gateway && npx wrangler deploy --config wrangler.production.toml

deploy-secrets-preview:
	@echo "Setting Cloudflare secrets for preview..."
	cd apps/gateway && npx wrangler secret put DATABASE_URL --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put OPENAI_API_KEY --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put OPENAI_BASE_URL --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_TEAM_ID --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_KEY_ID --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_PRIVATE_KEY --config wrangler.preview.toml
	cd apps/gateway && npx wrangler secret put MINIMAX_API_KEY --config wrangler.preview.toml

deploy-secrets-production:
	@echo "Setting Cloudflare secrets for production..."
	cd apps/gateway && npx wrangler secret put DATABASE_URL --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put OPENAI_API_KEY --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put OPENAI_BASE_URL --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_TEAM_ID --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_KEY_ID --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put APPLE_MUSIC_PRIVATE_KEY --config wrangler.production.toml
	cd apps/gateway && npx wrangler secret put MINIMAX_API_KEY --config wrangler.production.toml

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
	@echo "    make dev-landing    - Start landing page only"
	@echo ""
	@echo "  Install:"
	@echo "    make install        - Install all dependencies"
	@echo "    make install-web    - Install frontend dependencies"
	@echo "    make install-landing - Install landing dependencies"
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
	@echo "  Landing:"
	@echo "    make build-landing            - Build landing page"
	@echo "    make deploy-preview-landing   - Deploy landing worker (preview)"
	@echo "    make deploy-production-landing - Deploy landing worker (production)"
	@echo ""
	@echo "  Deploy:"
	@echo "    make deploy              - Build + deploy to preview (default)"
	@echo "    make deploy-preview      - Build + deploy to preview"
	@echo "    make deploy-production   - Build + deploy to production"
	@echo "    make build-web           - Build frontend"
	@echo "    make deploy-secrets-preview    - Set secrets for preview"
	@echo "    make deploy-secrets-production - Set secrets for production"
	@echo ""
	@echo "  Other:"
	@echo "    make clean          - Clean caches"
	@echo "    make help           - Show this help"
