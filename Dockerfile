# Production image: install (with devDeps for tsc), compile, prune, run.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY openapi.yaml ./
COPY db ./db
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8020

EXPOSE 8020
CMD ["node", "dist/server.js"]
