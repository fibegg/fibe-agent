FROM node:24-slim AS cli

ARG BUILDKIT_INLINE_CACHE=1
ARG AGENT_PROVIDER=gemini

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.npm \
    if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    npm install -g @google/gemini-cli; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    npm install -g @anthropic-ai/claude-code@2.1.50; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    npm install -g @openai/codex@0.104.0; \
    elif [ "$AGENT_PROVIDER" = "opencode" ]; then \
    npm install -g opencode-ai; \
    fi

RUN find /usr/local/lib/node_modules -type f -name "*.map" -delete 2>/dev/null || true

FROM node:24-slim AS builder
COPY --from=oven/bun:1.3.11-slim /usr/local/bin/bun /usr/local/bin/bun

ARG BUILDKIT_INLINE_CACHE=1

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# node-pty requires native compilation; install build tools + node-gyp
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g node-gyp

WORKDIR /app

COPY package.json bun.lock package-lock.json* nx.json tsconfig.base.json tsconfig.json eslint.config.mjs vitest.workspace.ts ./
COPY apps/api/package.json apps/api/
COPY apps/chat/package.json apps/chat/
COPY apps/e2e-api/package.json apps/e2e-api/
COPY apps/e2e-chat/package.json apps/e2e-chat/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

COPY apps/api apps/api
COPY apps/chat apps/chat
COPY apps/e2e-api apps/e2e-api
COPY apps/e2e-chat apps/e2e-chat
COPY shared shared

ENV NX_DAEMON=false \
    VITE_THEME_SOURCE=frame \
    VITE_HIDE_THEME_SWITCH=true

RUN --mount=type=cache,target=/app/.nx/cache \
    npx nx run-many --targets=build --projects=api,chat

FROM node:24-slim

ARG BUILDKIT_INLINE_CACHE=1
ARG AGENT_PROVIDER=gemini

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# Unconditional packages — cached across all provider variants
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    dumb-init bash curl procps git \
    jq less tree wget zip unzip openssh-client docker.io \
    python3 python3-venv \
    ripgrep fd-find \
    make file patch \
    ca-certificates \
    sqlite3 pandoc htop strace \
    imagemagick ffmpeg ghostscript \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN printf '#!/bin/sh\nexec /usr/local/bin/uv tool run "$@"\n' > /usr/local/bin/uvx \
    && chmod +x /usr/local/bin/uvx

ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    if [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
    dbus gnome-keyring libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*; \
    fi

COPY --from=cli /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=cli /usr/local/bin /usr/local/bin

WORKDIR /app

# ---- HEAVY NPM DEPS AND BROWSER INSTALLATION ----
COPY apps/api/package.json ./package.json

# node-gyp must be globally available for native addon compilation.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g node-gyp

# Install production JS deps AND mcp-remote
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --ignore-scripts && \
    npm install -g mcp-remote

# Compile node-pty native addon for the target platform.
RUN --mount=type=cache,target=/root/.npm \
    npm rebuild node-pty --build-from-source

# @playwright/mcp
RUN --mount=type=cache,target=/root/.npm \
    npm install -g @playwright/mcp@0.0.68

# System libraries required by Chromium.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    npx -y playwright install-deps chromium

# ---- PREPARE DIRS AND USER ----
RUN mkdir -p /app/data /app/playground /home/node/.cache \
    && touch /app/data/STEERING.md \
    && if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    mkdir -p /home/node/.gemini && chown -R node:node /home/node/.gemini; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    mkdir -p /home/node/.codex && chown -R node:node /home/node/.codex; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude; \
    elif [ "$AGENT_PROVIDER" = "opencode" ]; then \
    mkdir -p /home/node/.local/share/opencode && chown -R node:node /home/node/.local; \
    fi \
    && chown -R node:node /app/data /app/playground /home/node/.cache

USER node

# Download Chromium browser binary as node
RUN npx -y playwright install chromium

USER root

# ---- FINALLY COPY DIST FILES ----
# Doing this LAST ensures code changes don't bust the Playwright/native cache
COPY --from=builder /app/apps/api/dist ./dist/
COPY --from=builder /app/apps/chat/dist ./chat/

# Inject git SHA at the last possible moment so it doesn't bust previous caches
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/main.js"]
