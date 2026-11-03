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
RUN test "$(dpkg --print-architecture)" = amd64 \
 && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip openssl \
 && curl --fail --silent --show-error --location https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.31.18.zip -o /tmp/awscli.zip \
 && echo '4a1257f6eca864dcdee1b98e29e9428466ed365398c50032ddf5e4b4d3728e32  /tmp/awscli.zip' | sha256sum --check --strict \
 && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install \
 && curl --fail --silent --show-error --location https://s3.amazonaws.com/session-manager-downloads/plugin/1.2.707.0/ubuntu_64bit/session-manager-plugin.deb -o /tmp/session-manager-plugin.deb \
 && echo '91cc9a1a8df6f730622d5e11a8610be6e06d5858408e8029b56d0d63aedd0a68  /tmp/session-manager-plugin.deb' | sha256sum --check --strict \
 && dpkg -i /tmp/session-manager-plugin.deb \
 && aws --version && session-manager-plugin --version \
 && mkdir -p /var/lib/fleet/pki /home/node/.aws && chown -R node:node /var/lib/fleet /home/node/.aws && chmod 700 /var/lib/fleet/pki \
 && rm -rf /var/lib/apt/lists/* /tmp/aws /tmp/awscli.zip /tmp/session-manager-plugin.deb
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "start", "--workspace", "apps/service"]
