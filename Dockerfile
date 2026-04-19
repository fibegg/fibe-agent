FROM node:24-slim AS cli

ARG BUILDKIT_INLINE_CACHE=1
ARG AGENT_PROVIDER=gemini

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.npm \
    if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    npm install -g @google/gemini-cli; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ]; then \
    npm install -g @anthropic-ai/claude-code; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ]; then \
    npm install -g @openai/codex; \
    elif [ "$AGENT_PROVIDER" = "opencode" ]; then \
    npm install -g opencode-ai; \
    elif [ "$AGENT_PROVIDER" = "cursor" ]; then \
    curl https://cursor.com/install -fsS | bash; \
    fi

RUN mkdir -p /root/.local/share/cursor-agent

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
ARG GITHUB_MCP_VERSION=1.0.0
ARG GITEA_MCP_VERSION=1.1.0

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# Unconditional packages — cached across all provider variants
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    dumb-init bash curl procps git \
    jq less tree wget zip unzip openssh-client \
    python3 python3-venv python-is-python3 \
    ripgrep fd-find \
    make file patch \
    ca-certificates \
    sqlite3 pandoc htop strace \
    imagemagick ffmpeg ghostscript \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then DOCKER_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then DOCKER_ARCH="aarch64"; \
    else DOCKER_ARCH="x86_64"; fi && \
    curl -fsSL -o docker.tgz "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-27.4.1.tgz" && \
    tar -xzf docker.tgz docker/docker && \
    mv docker/docker /usr/local/bin/docker && \
    chmod +x /usr/local/bin/docker && \
    rm -rf docker docker.tgz

# Official GitHub CLI (`gh`) Debian repository.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    mkdir -p -m 755 /etc/apt/keyrings /etc/apt/sources.list.d && \
    wget -nv -O /etc/apt/keyrings/githubcli-archive-keyring.gpg \
      https://cli.github.com/packages/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Official GitHub MCP server. `mcp-github` is kept as a compatibility wrapper
# for the MCP config currently emitted by Fibe.
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then GITHUB_MCP_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then GITHUB_MCP_ARCH="arm64"; \
    else GITHUB_MCP_ARCH="x86_64"; fi && \
    curl -fsSL -o github-mcp-server.tgz \
      "https://github.com/github/github-mcp-server/releases/download/v${GITHUB_MCP_VERSION}/github-mcp-server_Linux_${GITHUB_MCP_ARCH}.tar.gz" && \
    tar -xzf github-mcp-server.tgz -C /usr/local/bin github-mcp-server && \
    rm -f github-mcp-server.tgz && \
    chmod +x /usr/local/bin/github-mcp-server && \
    printf '#!/bin/sh\nexec /usr/local/bin/github-mcp-server stdio "$@"\n' > /usr/local/bin/mcp-github && \
    chmod +x /usr/local/bin/mcp-github

# Official Gitea MCP server binary.
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then GITEA_MCP_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then GITEA_MCP_ARCH="arm64"; \
    else GITEA_MCP_ARCH="x86_64"; fi && \
    curl -fsSL \
      "https://gitea.com/gitea/gitea-mcp/releases/download/v${GITEA_MCP_VERSION}/gitea-mcp_Linux_${GITEA_MCP_ARCH}.tar.gz" | \
      tar -xz -C /usr/local/bin gitea-mcp && \
    chmod +x /usr/local/bin/gitea-mcp

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
COPY --from=cli /root/.local/share/cursor-agent /usr/local/share/cursor-agent

WORKDIR /app

RUN if [ -d /usr/local/share/cursor-agent ]; then \
    CURSOR_BIN=$$(find /usr/local/share/cursor-agent -type f -name cursor-agent | head -n 1); \
    if [ -n "$$CURSOR_BIN" ]; then \
    ln -sf "$$CURSOR_BIN" /usr/local/bin/cursor-agent; \
    ln -sf "$$CURSOR_BIN" /usr/local/bin/agent; \
    fi; \
    fi

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

# npm-distributed MCP helper.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g @playwright/mcp@0.0.68

# System libraries required by Chromium.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    npx -y playwright install-deps chromium

# ---- FIX FILE DESCRIPTOR LIMITS ----
# Ensures su/sudo sessions inherit high nofile — prevents EMFILE in dev mode
RUN mkdir -p /etc/security/limits.d \
    && printf "*  soft  nofile  1048576\n*  hard  nofile  1048576\n" > /etc/security/limits.d/99-nofile.conf

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
    elif [ "$AGENT_PROVIDER" = "cursor" ]; then \
    mkdir -p /home/node/.cursor && chown -R node:node /home/node/.cursor; \
    fi \
    && chown -R node:node /app/data /app/playground /home/node/.cache

USER node

# Download Chromium browser binary as node
RUN npx -y playwright install chromium

USER root

# ---- MCP REMOTE RECONNECTION WRAPPER ----
COPY scripts/mcp-remote-wrapper.sh /usr/local/bin/mcp-remote-wrapper
RUN chmod +x /usr/local/bin/mcp-remote-wrapper

# ---- SMART ENTRYPOINT ----
# Detects prod (dist/ present) vs dev (source code mounted, no dist/) at runtime.
# In dev mode it runs `npm install` then `nx serve` so the container works
# when the entire project root is volume-mounted (e.g. local Rails orchestration).
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ---- FIBE CLI (downloaded from fibegg/sdk GitHub Releases) ----
COPY scripts/install-fibe.sh /usr/local/bin/install-fibe.sh
RUN chmod +x /usr/local/bin/install-fibe.sh \
    && /usr/local/bin/install-fibe.sh \
    && /usr/local/bin/fibe version \
    && /usr/local/bin/fibe local-playgrounds --help >/dev/null

# ---- FINALLY COPY DIST FILES ----
# Doing this LAST ensures code changes don't bust the Playwright/native cache
COPY --from=builder /app/apps/api/dist ./dist/
COPY --from=builder /app/apps/chat/dist ./chat/

# Inject git SHA at the last possible moment so it doesn't bust previous caches
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
