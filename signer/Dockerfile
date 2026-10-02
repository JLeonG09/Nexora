FROM node:22-alpine
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# El almacén de pnpm vive en una caché de BuildKit: entre builds solo se descarga lo que cambió.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json ./
COPY src src
RUN mkdir -p data && chown node:node data
ENV HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
