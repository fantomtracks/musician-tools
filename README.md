# Musician Tools

Full-stack project with a React (Vite + TypeScript) frontend and an Express + PostgreSQL backend managed via Docker.

This README explains how to run the stack (Docker), start the frontend, manage the database (migrations), and access the API.

## Prerequisites

- Docker Desktop (latest)
- Node.js 18+ (developed on Node 24) for local frontend dev

## Quick Start (run these from the project root)

1) Start the backend stack (PostgreSQL + Adminer + API):

```bash
make up
```

## Styling (Tailwind CSS)

Tailwind is configured for the frontend. Content paths are defined in [tailwind.config.ts](tailwind.config.ts) and Tailwind directives are enabled in [src/index.css](src/index.css).

To use Tailwind classes, just add utility classes to your components (see [src/App.tsx](src/App.tsx) for examples).

2) Create/Run database migrations:

```bash
make migrate
```

3) Start the frontend (local dev):

```bash
make dev
```

### Optional: Makefile shortcuts

You can use the provided `Makefile` to simplify commands:

```bash
# Show available targets
make

# Start stack
make up

# Run migrations
make migrate

# Tail backend logs
make logs

# Start frontend
make dev

# Reset DB volume and remigrate
make reset-db
```

4) Open the app and tools:

- Frontend: http://localhost:5173
- Backend API base: http://localhost:3001/api
- Adminer (DB UI): http://localhost:8080
  - System: PostgreSQL
  - Server: db
  - User: musician_user
  - Password: musician_pass
  - Database: musician_tools

## Project Structure

```
musician-tools/
├── backend/
│   ├── config/config.js        # DB config (env-based)
│   ├── controllers/            # Business logic
│   ├── middleware/
│   ├── migrations/             # Sequelize migrations
│   ├── models/                 # Sequelize models
│   │   ├── index.js
│   │   └── song.js             # Example model
│   ├── routes/                 # Express routers
│   │   ├── index.js
│   │   └── songs.js
│   ├── seeders/
│   ├── logs/
│   ├── db.js                   # Sequelize connection
│   ├── logger.js               # Winston logger
│   ├── server.js               # Express app
│   └── package.json
├── docker-compose.yml          # Backend stack (db/adminer/backend)
├── API.md                      # API documentation
├── package.json                # Frontend (Vite + React)
└── src/                        # Frontend source
```

## Environment Variables

Backend environment variables are defined in [backend/.env.example](backend/.env.example). Create your `.env` from the example:

```bash
cp backend/.env.example backend/.env
```

Default dev connection string (Docker, port 5433 on host):

```
DATABASE_URL_DEV=postgresql://musician_user:musician_pass@localhost:5433/musician_tools
```

Note: `docker-compose.yml` maps the database container port `5432` to host `5433` to avoid conflicts with other local Postgres.

## Backend (Docker)

Start/Stop the stack (run at repo root):

```bash
make up
make down
```

Run migrations and seeders (run at repo root):

```bash
make migrate
make seed
```

Rebuild backend image (after dependency changes, run at repo root):

```bash
make rebuild-backend
```

Tail logs (run at repo root):

```bash
make logs
make logs-db
```

Reset DB volume (warning: deletes all data; run at repo root):

```bash
make reset-db
```

### Database Backup & Restore (via Make)

Create a timestamped backup file in `backups/`:

```bash
make db-backup
```

Restore from a backup file (ensure stack is up):

```bash
make up
make db-restore FILE=backups/musician_tools_YYYYMMDD_HHMMSS.dump
```

Notes:
- Backups are stored under `backups/` in custom format (`pg_dump -F c`) and restored with `pg_restore`.
- Regular stop/start (`make down` / `make up`) preserves data via the named Docker volume.
- `make reset-db` deletes volumes and data; use `make db-backup` before resetting if you want to recover later.

## Frontend (Vite + React)

Install and run (run at repo root):

```bash
make dev
```

The frontend runs on http://localhost:5173 and calls the backend at http://localhost:3001/api.

Build and preview (run at repo root):

```bash
make preview
```

## API Overview

Base URL: http://localhost:3001/api

Example endpoints:

- `GET /api` – API status
- `GET /api/songs` – List songs
- `POST /api/songs` – Create song
- `PUT /api/songs/:uid` – Update song
- `DELETE /api/songs/:uid` – Delete song

See [API.md](API.md) for detailed request/response schemas and examples.

## Troubleshooting

- Port conflicts: change ports in `docker-compose.yml` (e.g., DB `5433`, backend `3001`, adminer `8080`).
- Missing `package-lock.json` during backend Docker build:
  
  ```bash
  # Generate lockfile and rebuild backend image
  make install-backend
  make rebuild-backend
  ```
- DB connection errors: verify `backend/.env` matches the `docker-compose.yml` settings and the DB container is healthy (`docker ps`).

## Development Notes

- Use migrations for all schema changes (do not edit tables manually).
- Keep API contracts documented in [API.md](API.md).
- Prefer environment variables for secrets; never commit real secrets.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
