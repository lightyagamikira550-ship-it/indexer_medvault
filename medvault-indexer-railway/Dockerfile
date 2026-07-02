FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/medvault-core ./packages/medvault-core
COPY tsconfig.json ./
COPY src ./src

RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/medvault-core ./packages/medvault-core
COPY --from=build /app/dist ./dist

RUN npm ci --omit=dev && npm run build:core

ENV INDEXER_PORT=3300
EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.INDEXER_PORT||process.env.PORT||3300)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
