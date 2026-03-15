FROM node:24-slim AS cli

ARG BUILDKIT_INLINE_CACHE=1
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

ARG BUILDKIT_INLINE_CACHE=1

WORKDIR /app

COPY package.json bun.lock package-lock.json* nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/chat/package.json apps/chat/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

COPY apps/api apps/api
COPY apps/chat apps/chat

ENV NX_DAEMON=false
RUN bunx nx run-many --targets=build --projects=api,chat

FROM node:24-slim

ARG BUILDKIT_INLINE_CACHE=1

# Unconditional packages — cached across all provider variants
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init bash curl procps git \
    jq less tree wget zip unzip openssh-client docker.io \
    # Tier 1 – essential agent tooling
    python3 python3-venv \
    ripgrep fd-find \
    make file patch \
    ca-certificates \
    # Tier 2 – extended agent tooling
    sqlite3 pandoc htop strace \
    # Tier 3 – native compilation support
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd

# uv – ultrafast Python package/project manager (single static binary)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN ln -sf /usr/local/bin/uv /usr/local/bin/uvx

# Deno – secure JS/TS runtime for quick scripting
ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh

# Conditional packages — only busts cache for claude_code builds
ARG AGENT_PROVIDER=gemini
RUN if [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
    dbus gnome-keyring libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*; \
    fi

COPY --from=cli /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=cli /usr/local/bin /usr/local/bin

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist/
COPY --from=builder /app/apps/chat/dist ./chat/
COPY apps/api/package.json ./package.json
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --ignore-scripts && \
    npm install -g mcp-remote

# Playwright browser + system deps for @playwright/mcp
RUN npx playwright install --with-deps chromium

EXPOSE 3000

RUN mkdir -p /app/data /app/playground \
    && if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    mkdir -p /home/node/.gemini && chown -R node:node /home/node/.gemini; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    mkdir -p /home/node/.codex && chown -R node:node /home/node/.codex; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude; \
    fi \
    && chown -R node:node /app/data /app/playground

USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/main.js"]
