.PHONY: setup start stop up down restart rebuild-backend migrate seed logs logs-db dev preview install-backend install-frontend install reset-db ps db-psql db-backup db-restore api-test help

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
	@echo "  seed              - Run all Sequelize seeders"
	@echo "  reset-db          - Drop volumes, recreate stack, rerun migrations"
	@echo "  db-psql           - Open psql shell in db container"
	@echo "  db-backup         - Create timestamped DB backup into backups/"
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

# Complete setup from scratch
setup:
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
start:
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
up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart backend

rebuild-backend:
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

seed:
	docker compose exec backend npx sequelize-cli db:seed:all

reset-db:
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

db-backup:
	@mkdir -p $(BACKUP_DIR)
	@echo "Creating backup to $(BACKUP_DIR)/musician_tools_$(TIMESTAMP).dump"
	@docker compose exec -T db env PGPASSWORD=musician_pass pg_dump -U musician_user -d musician_tools -F c > $(BACKUP_DIR)/musician_tools_$(TIMESTAMP).dump
	@echo "Backup complete."

db-restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=backups/<file>.dump"; exit 2; fi
	@if [ ! -f "$(FILE)" ]; then echo "Backup file not found: $(FILE)"; exit 2; fi
	@echo "Restoring database from $(FILE)"
	@docker compose exec -T db env PGPASSWORD=musician_pass pg_restore -c -U musician_user -d musician_tools < $(FILE)
	@echo "Restore complete."
