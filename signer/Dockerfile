FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src src
RUN mkdir -p data && chown node:node data
ENV HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]
