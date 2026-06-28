ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine as base
WORKDIR /app
EXPOSE 3001

FROM base as dev
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
# Migrations are the single source of truth: run them BEFORE the app starts
# (mirrors prod's release_command), so the functional unique indexes exist and
# the boot-time schema guard (story 11.1) passes even on a fresh database.
CMD npx sequelize-cli db:migrate && npm run dev

FROM base as prod
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
