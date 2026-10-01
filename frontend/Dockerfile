FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# El almacén de pnpm vive en una caché de BuildKit: entre builds solo se descarga lo que cambió.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
# Vite incrusta las VITE_* en el bundle al compilar: cambiar una exige reconstruir la imagen.
ARG VITE_PRIVY_APP_ID=
ARG VITE_PRIVY_CLIENT_ID=
ARG VITE_STELLAR_NETWORK=testnet
ENV VITE_MOCK=false \
    VITE_API_URL= \
    VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID \
    VITE_PRIVY_CLIENT_ID=$VITE_PRIVY_CLIENT_ID \
    VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK
RUN pnpm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
