.PHONY: setup start stop up down restart rebuild-backend migrate migrate-prod seed logs logs-db dev preview install-backend install-frontend install reset-db ps db-psql db-backup db-backup-prod db-restore api-test help check-env

# Default help
help:
	@echo "🎵 Musician Tools - Available Commands"
	@echo ""
	@echo "📦 Installation & Setup:"
	@echo "  setup             - ⚡ Install everything from scratch (Docker, deps, migrations)"
	@echo "  install           - Install all dependencies (frontend + backend)"
	@echo "  install-frontend  - Install frontend dependencies only"
	@echo "  install-backend   - Install backend dependencies only"
	@echo ""
	@echo "🚀 Start & Stop:"
	@echo "  start             - Start everything (Docker + frontend dev server)"
	@echo "  stop              - Stop everything (Docker + frontend)"
	@echo "  up                - Start Docker stack (db, adminer, backend)"
	@echo "  down              - Stop Docker stack"
	@echo "  restart           - Restart backend container"
	@echo ""
	@echo "🗄️  Database:"
	@echo "  migrate           - Run Sequelize migrations in backend"
	@echo "  migrate-prod      - Run Sequelize migrations against PROD DB URL"
	@echo "  seed              - Run all Sequelize seeders"
	@echo "  reset-db          - Drop volumes, recreate stack, rerun migrations"
	@echo "  db-psql           - Open psql shell in db container"
	@echo "  db-backup         - Create timestamped DB backup into backups/"
	@echo "  db-backup-prod    - Create timestamped PROD DB backup into backups/"
	@echo "  db-restore        - Restore DB from backup (make db-restore FILE=backups/<file>.dump)"
	@echo ""
	@echo "🔧 Development:"
	@echo "  dev               - Start frontend (Vite dev server)"
	@echo "  preview           - Build frontend and start preview server"
	@echo "  rebuild-backend   - Rebuild backend image and start"
	@echo "  logs              - Tail backend logs"
	@echo "  logs-db           - Tail database logs"
	@echo "  ps                - Show compose services"
	@echo "  api-test          - Hit backend status endpoint"

# ============================================
# 🚀 SETUP & START COMMANDS
# ============================================

# Pre-flight: required env must be present before booting the backend container,
# otherwise it fail-fasts (process.exit(1)) and crash-loops silently (story 7.1).
check-env:
	@test -f backend/.env || { echo "❌ backend/.env is missing — copy backend/.env.example and fill it in"; exit 1; }
	@grep -Eq '^SESSION_SECRET=.+' backend/.env || { echo "❌ SESSION_SECRET is missing or empty in backend/.env (required to boot the backend since story 7.1; in dev, mirror JWT_SECRET)"; exit 1; }

# Complete setup from scratch
setup: check-env
	@echo "🎵 Setting up Musician Tools..."
	@echo ""
	@echo "📦 Step 1/5: Installing frontend dependencies..."
	npm install
	@echo ""
	@echo "📦 Step 2/5: Installing backend dependencies..."
	cd backend && npm install
	@echo ""
	@echo "🐳 Step 3/6: Starting Docker containers (PostgreSQL + Adminer + Backend)..."
	docker compose up -d
	@echo ""
	@echo "⏳ Step 4/6: Waiting for database to be ready..."
	@sleep 5
	@echo ""
	@echo "📦 Step 5/6: Installing backend dependencies in Docker container..."
	docker compose exec backend npm install
	@echo ""
	@echo "🗄️  Step 6/6: Running database migrations..."
	docker compose exec backend npx sequelize-cli db:migrate
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "🎉 You can now start the frontend with: make dev"
	@echo "   Or start everything with: make start"
	@echo ""
	@echo "📍 Services running:"
	@echo "   - Backend API: http://localhost:3001"
	@echo "   - Adminer (DB UI): http://localhost:8080"
	@echo "   - Frontend (after 'make dev'): http://localhost:5173"

# Start everything (Docker + frontend)
start: check-env
	@echo "🚀 Starting Musician Tools..."
	@echo ""
	@echo "🐳 Starting Docker containers..."
	docker compose up -d
	@echo ""
	@echo "⏳ Waiting for services to be ready..."
	@sleep 3
	@echo ""
	@echo "✅ Backend ready at http://localhost:3001"
	@echo "✅ Adminer ready at http://localhost:8080"
	@echo ""
	@echo "🎸 Starting frontend dev server..."
	@echo "   (Press Ctrl+C to stop)"
	@echo ""
	npm run dev

# Stop everything
stop:
	@echo "🛑 Stopping Musician Tools..."
	docker compose down
	@echo "✅ All services stopped"

# Install all dependencies
install: install-frontend install-backend

install-frontend:
	@echo "📦 Installing frontend dependencies..."
	npm install
	@echo "✅ Frontend dependencies installed"

install-backend:
	@echo "📦 Installing backend dependencies..."
	cd backend && npm install
	@echo "✅ Backend dependencies installed"

# ============================================
# 🐳 DOCKER COMMANDS
# ============================================

# Docker compose commands (run from repo root)
up: check-env
	docker compose up -d

down:
	docker compose down

restart: check-env
	docker compose restart backend

rebuild-backend: check-env
	docker compose up -d --build backend

ps:
	docker compose ps

logs:
	docker compose logs -f backend

logs-db:
	docker compose logs -f db

# ============================================
# 🗄️  DATABASE MANAGEMENT
# ============================================

# Database management
migrate:
	docker compose exec backend npx sequelize-cli db:migrate

migrate-prod:
	@if [ -z "$(PROD_DB_URL)" ]; then echo "Missing PROD DB URL. Set PROD_DB_URL=... or define DATABASE_URL_PROD in backend/.env"; exit 2; fi
	@if ! echo "$(PROD_DB_URL)" | grep -Eq '^postgres(ql)?://[^:]+:[^@]+@[^:/]+(:[0-9]+)?/.+'; then \
		echo "Invalid PROD_DB_URL format. Expected: postgresql://user:password@host:5432/dbname"; \
		echo "Tip: make migrate-prod PROD_DB_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'"; \
		exit 2; \
	fi
	@cd backend && DATABASE_URL_PROD="$(PROD_DB_URL)" NODE_ENV=production npx sequelize-cli db:migrate --env production

seed:
	docker compose exec backend npx sequelize-cli db:seed:all

reset-db: check-env
	@echo "🗑️  Resetting database..."
	docker compose down -v
	docker compose up -d
	@sleep 5
	docker compose exec backend npx sequelize-cli db:migrate
	@echo "✅ Database reset complete"

# ============================================
# 🔧 UTILITIES
# ============================================

db-psql:
	docker compose exec db psql -U musician_user -d musician_tools

api-test:
	curl -s http://localhost:3001/api || true

# ============================================
# 🎨 FRONTEND
# ============================================

# Frontend
dev:
	npm install
	npm run dev

preview:
	npm run build
	npm run preview

# ============================================
# 💾 BACKUP & RESTORE
# ============================================

# Backup/Restore
BACKUP_DIR := backups
TIMESTAMP := $(shell date +%Y%m%d_%H%M%S)
PROD_DB_URL ?= $(shell grep '^DATABASE_URL_PROD=' backend/.env 2>/dev/null | cut -d= -f2-)

db-backup:
	@mkdir -p $(BACKUP_DIR)
	@echo "Creating backup to $(BACKUP_DIR)/musician_tools_$(TIMESTAMP).dump"
	@docker compose exec -T db env PGPASSWORD=musician_pass pg_dump -U musician_user -d musician_tools -F c > $(BACKUP_DIR)/musician_tools_$(TIMESTAMP).dump
	@echo "Backup complete."

db-backup-prod:
	@if [ -z "$(PROD_DB_URL)" ]; then echo "Missing PROD DB URL. Set PROD_DB_URL=... or define DATABASE_URL_PROD in backend/.env"; exit 2; fi
	@if ! echo "$(PROD_DB_URL)" | grep -Eq '^postgres(ql)?://[^:]+:[^@]+@[^:/]+(:[0-9]+)?/.+'; then \
		echo "Invalid PROD_DB_URL format. Expected: postgresql://user:password@host:5432/dbname"; \
		echo "Tip: run with explicit URL -> make db-backup-prod PROD_DB_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'"; \
		exit 2; \
	fi
	@mkdir -p $(BACKUP_DIR)
	@echo "Creating PROD backup to $(BACKUP_DIR)/musician_tools_prod_$(TIMESTAMP).dump"
	@docker run --rm -e PROD_DB_URL="$(PROD_DB_URL)" -v "$(PWD)/$(BACKUP_DIR):/backups" postgres:17 sh -c 'pg_dump "$$PROD_DB_URL" -F c -f "/backups/musician_tools_prod_$(TIMESTAMP).dump"'
	@echo "PROD backup complete."

db-restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=backups/<file>.dump"; exit 2; fi
	@if [ ! -f "$(FILE)" ]; then echo "Backup file not found: $(FILE)"; exit 2; fi
	@echo "Restoring database from $(FILE)"
	@docker compose exec -T db env PGPASSWORD=musician_pass pg_restore -c -U musician_user -d musician_tools < $(FILE)
	@echo "Restore complete."
