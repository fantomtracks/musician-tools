# Musician Tools Backend

Backend server for Musician Tools application built with Express.js, PostgreSQL, and Sequelize ORM.

## Tech Stack

- **Framework:** Express.js 4.16.1
- **Database:** PostgreSQL
- **ORM:** Sequelize 6.9.0
- **Authentication:** Session-based (express-session + bcrypt)
- **Logging:** Winston 3.16.0
- **Node Version:** 22.x

## Getting Started

### Prerequisites

- Node.js 22.x
- PostgreSQL database

### Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials.

3. Run database migrations:
```bash
npx sequelize-cli db:migrate
```

4. Start the development server:
```bash
npm run dev
```

The server will start on port 3001 (or the PORT specified in your .env file).

## Project Structure

```
backend/
├── config/
│   └── config.js           # Database configuration for different environments
├── controllers/            # Business logic controllers
├── middleware/             # Express middleware functions
├── migrations/             # Database migration files
├── models/                 # Sequelize models
│   └── index.js           # Auto-loads all models
├── routes/                 # API route definitions
│   └── index.js           # Main router
├── seeders/               # Database seeders
├── logs/                  # Winston log files
├── db.js                  # Database connection
├── logger.js              # Winston logger configuration
├── server.js              # Main Express application
└── package.json

```

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests with mocha
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues

## Database Management

### Create a new migration:
```bash
npx sequelize-cli migration:generate --name description-of-change
```

### Run migrations:
```bash
npx sequelize-cli db:migrate
```

### Undo last migration:
```bash
npx sequelize-cli db:migrate:undo
```

### Create a new seeder:
```bash
npx sequelize-cli seed:generate --name seed-name
```

### Run seeders:
```bash
npx sequelize-cli db:seed:all
```

## API Endpoints

Base URL: `http://localhost:3001/api`

- `GET /api` - API status check

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `NODE_ENV` - Environment (development, test, staging, production)
- `DATABASE_URL_DEV` - PostgreSQL connection string for development
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Secret key for JWT tokens

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- `logs/exceptions.log` - Uncaught exceptions

In development mode, logs are also output to the console with color formatting.
