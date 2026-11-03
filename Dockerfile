FROM node:22.16.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json packages/shared/
COPY apps/service/package*.json apps/service/
COPY apps/web/package*.json apps/web/
COPY apps/desktop/package*.json apps/desktop/
RUN npm install --ignore-scripts --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/service apps/service
COPY apps/web apps/web
RUN npm run build --workspace packages/shared && npm run build --workspace apps/service && npm run build --workspace apps/web
RUN npm prune --omit=dev --ignore-scripts
FROM node:22.16.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "start", "--workspace", "apps/service"]
