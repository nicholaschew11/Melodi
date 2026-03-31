# ══════════════════════════════════════════
# Melodi — Development Commands
# ══════════════════════════════════════════

.PHONY: dev stop reset db migrate setup help

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start everything (backend + frontend, no ngrok needed)
	@./scripts/dev.sh start

stop: ## Stop all running services
	@./scripts/dev.sh stop

reset: ## Stop all services and wipe database
	@./scripts/dev.sh reset

db: ## Start only the local database
	@./scripts/dev.sh db

migrate: ## Run the SQL migration against Supabase (production)
	@echo "Running migration against Supabase..."
	@cat db/init.sql | docker compose exec -T db psql -U melodi -d melodi
	@echo "Migration complete."

setup: ## First-time setup: install deps, create .env files
	@echo "Installing backend dependencies..."
	@cd backend && npm install
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install
	@./scripts/dev.sh start

# ── Production deployment ──

build-backend: ## Build backend Docker image
	@docker build -t melodi-backend ./backend

build-analysis: ## Build track analysis Docker image
	@docker build -t melodi-analysis ./trackAnalysisService
