FROM node:24-slim AS cli

ARG AGENT_PROVIDER=gemini

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.npm \
    if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    npm install -g @google/gemini-cli; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    npm install -g @anthropic-ai/claude-code@2.1.50; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    npm install -g @openai/codex@0.104.0; \
    fi

RUN find /usr/local/lib/node_modules -type f -name "*.map" -delete 2>/dev/null || true

FROM oven/bun:1.3.9-slim AS builder

WORKDIR /app

COPY package.json bun.lock package-lock.json* nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/chat/package.json apps/chat/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

COPY apps/api apps/api
COPY apps/chat apps/chat

ENV NX_DAEMON=false
RUN bunx nx run api:build
RUN bunx nx run chat:build

FROM node:24-slim

ARG AGENT_PROVIDER=gemini

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init bash curl procps git \
    jq less tree wget zip unzip openssh-client \
    && if [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    apt-get install -y --no-install-recommends dbus gnome-keyring libsecret-1-0; \
    fi \
    && rm -rf /var/lib/apt/lists/*

COPY --from=cli /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=cli /usr/local/bin /usr/local/bin

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist/
COPY --from=builder /app/apps/chat/dist ./chat/
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

EXPOSE 3000

RUN mkdir -p /app/data \
    && if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    mkdir -p /home/node/.gemini && chown -R node:node /home/node/.gemini; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    mkdir -p /home/node/.codex && chown -R node:node /home/node/.codex; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude; \
    fi \
    && chown -R node:node /app/data

USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/main.js"]
