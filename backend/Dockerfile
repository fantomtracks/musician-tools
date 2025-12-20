ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine as base
WORKDIR /app
EXPOSE 3001

FROM base as dev
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
CMD npm run dev

FROM base as prod
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
