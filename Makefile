.PHONY: dev dev-web dev-landing install install-web install-landing \
       clean help test test-web lint lint-web \
       type-check ci build-landing deploy-landing \
       deploy deploy-preview deploy-production build-web \
       deploy-preview-web deploy-preview-gateway \
       deploy-preview-landing deploy-production-landing \
       deploy-preview-admin deploy-production-admin \
       deploy-preview-agent deploy-production-agent \
       deploy-production-web deploy-production-gateway \
       deploy-secrets-agent-preview

# =============================================================================
# Development
# =============================================================================

dev:
	@echo "Starting frontend..."
	@make dev-web

dev-web:
	@echo "Starting web frontend..."
	rm -rf apps/web/node_modules/.vite && pnpm --filter web dev

dev-landing:
	@echo "Starting landing page..."
	pnpm --filter landing dev

# =============================================================================
# Install
# =============================================================================

install: install-web install-landing
	@echo "All dependencies installed!"

install-web:
	@echo "Installing web dependencies..."
	pnpm install --filter web

install-landing:
	@echo "Installing landing dependencies..."
	pnpm install --filter landing

# =============================================================================
# Test
# =============================================================================

test: test-web test-auth

test-web:
	pnpm --filter web test

test-auth:
	pnpm --filter @playheads/auth test

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
	@echo "Cleaned!"

# =============================================================================
# Deploy (Cloudflare)
# =============================================================================

deploy: deploy-preview

deploy-preview: build-web build-landing deploy-preview-landing deploy-preview-admin deploy-preview-web deploy-preview-agent deploy-preview-gateway

deploy-production: build-web build-landing deploy-production-landing deploy-production-admin deploy-production-web deploy-production-agent deploy-production-gateway

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

deploy-preview-agent:
	@echo "Deploying agent worker (preview)..."
	cd apps/agent && npx wrangler deploy

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

deploy-production-agent:
	@echo "Deploying agent worker (production)..."
	cd apps/agent && npx wrangler deploy

deploy-production-gateway:
	@echo "Deploying gateway worker (production)..."
	cd apps/gateway && npx wrangler deploy --config wrangler.production.toml

deploy-secrets-agent-preview:
	@echo "Setting Cloudflare secrets for preview agent worker..."
	cd apps/agent && npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
	cd apps/agent && npx wrangler secret put AI_GATEWAY_ID
	cd apps/agent && npx wrangler secret put CF_AIG_TOKEN
	cd apps/agent && npx wrangler secret put APPLE_MUSIC_TEAM_ID
	cd apps/agent && npx wrangler secret put APPLE_MUSIC_KEY_ID
	cd apps/agent && npx wrangler secret put APPLE_MUSIC_PRIVATE_KEY

# LLM config secrets (shared between admin + agent workers)
# ADMIN_ENCRYPTION_KEY: generate with `openssl rand -hex 32`, must be same value in both workers
# TAVILY_API_KEY: get from https://tavily.com (free 1000/mo)
secret-llm-config:
	@echo "=== LLM Config Secrets Setup ==="
	@echo ""
	@printf "ADMIN_ENCRYPTION_KEY (tip: openssl rand -hex 32): "; \
	read KEY; \
	echo "$$KEY" | (cd apps/admin && npx wrangler secret put ADMIN_ENCRYPTION_KEY); \
	echo "$$KEY" | (cd apps/agent && npx wrangler secret put ADMIN_ENCRYPTION_KEY)
	@echo ""
	@echo "TAVILY_API_KEY (from https://tavily.com, free 1000/mo):"
	@(cd apps/agent && npx wrangler secret put TAVILY_API_KEY)
	@echo ""
	@echo "Done. Both workers share the same encryption key."

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Available commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev            - Start frontend"
	@echo "    make dev-web        - Start frontend only"
	@echo "    make dev-landing    - Start landing page only"
	@echo ""
	@echo "  Install:"
	@echo "    make install        - Install all dependencies"
	@echo "    make install-web    - Install frontend dependencies"
	@echo "    make install-landing - Install landing dependencies"
	@echo ""
	@echo "  Test:"
	@echo "    make test           - Run all tests"
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
	@echo "    make secret-llm-config   - Set ADMIN_ENCRYPTION_KEY + TAVILY_API_KEY"
	@echo ""
	@echo "  Other:"
	@echo "    make clean          - Clean caches"
	@echo "    make help           - Show this help"
