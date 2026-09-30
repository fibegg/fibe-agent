# syntax=docker/dockerfile:1.7

FROM node:24-slim AS cli-base

ARG BUILDKIT_INLINE_CACHE=1

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM cli-base AS cli

ARG AGENT_PROVIDER=gemini

COPY --link package.json ./
COPY --link scripts/install-provider.mjs scripts/provider-versions.json ./scripts/
RUN --mount=type=cache,target=/root/.npm \
    node scripts/install-provider.mjs "$AGENT_PROVIDER"

RUN mkdir -p /usr/local/share/cursor-agent

RUN find /usr/local/lib/node_modules -type f -name "*.map" -delete 2>/dev/null || true

FROM node:24-slim AS builder
COPY --link --from=oven/bun:1.4.2-slim /usr/local/bin/bun /usr/local/bin/bun

ARG BUILDKIT_INLINE_CACHE=1
ARG NPM_CONFIG_JOBS
ARG NX_PARALLEL

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# node-pty requires native compilation; install build tools + node-gyp
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g node-gyp@13.0.2

WORKDIR /app

COPY --link package.json bun.lock package-lock.json* nx.json tsconfig.base.json tsconfig.json eslint.config.mjs vitest.workspace.ts ./
COPY --link apps/api/package.json apps/api/
COPY --link apps/chat/package.json apps/chat/
COPY --link apps/e2e-api/package.json apps/e2e-api/
COPY --link apps/e2e-chat/package.json apps/e2e-chat/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    NPM_CONFIG_JOBS="${NPM_CONFIG_JOBS:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}" && \
    npm_config_jobs="${NPM_CONFIG_JOBS}" bun install

COPY --link apps/api apps/api
COPY --link apps/chat apps/chat
COPY --link apps/e2e-api apps/e2e-api
COPY --link apps/e2e-chat apps/e2e-chat
COPY --link shared shared

ENV NX_DAEMON=false \
    VITE_THEME_SOURCE=frame \
    VITE_HIDE_THEME_SWITCH=true

RUN --mount=type=cache,target=/app/.nx/cache \
    NX_PARALLEL="${NX_PARALLEL:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}" && \
    npx nx run-many --targets=build --projects=api,chat --parallel="${NX_PARALLEL}"

FROM golang:1.27.1-alpine AS gitea-mcp

ARG GITEA_MCP_VERSION=1.8.0

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    /usr/local/go/bin/go install "gitea.com/gitea/gitea-mcp@v${GITEA_MCP_VERSION}"

FROM node:24-slim AS runtime-base

ARG BUILDKIT_INLINE_CACHE=1
ARG GITHUB_MCP_VERSION=1.12.2
ARG NPM_CONFIG_JOBS

RUN rm -f /etc/apt/apt.conf.d/docker-clean && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# Unconditional packages: cached across all provider variants
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    dumb-init bash curl procps git \
    jq less tree wget zip unzip openssh-client \
    python3 python3-venv python-is-python3 \
    ripgrep fd-find \
    make file patch \
    ca-certificates \
    sqlite3 pandoc htop strace \
    imagemagick ffmpeg ghostscript \
    poppler-utils qpdf pdfgrep mupdf-tools \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then DOCKER_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then DOCKER_ARCH="aarch64"; \
    else echo "Unsupported Docker CLI architecture: $ARCH" >&2; exit 1; fi && \
    curl -fsSL -o docker.tgz "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-29.8.1.tgz" && \
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
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gh=2.102.0 && \
    rm -rf /var/lib/apt/lists/*

# Official GitHub MCP server. `mcp-github` is kept as a compatibility wrapper
# for the MCP config currently emitted by Fibe.
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then GITHUB_MCP_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then GITHUB_MCP_ARCH="arm64"; \
    else echo "Unsupported GitHub MCP architecture: $ARCH" >&2; exit 1; fi && \
    curl -fsSL -o github-mcp-server.tgz \
      "https://github.com/github/github-mcp-server/releases/download/v${GITHUB_MCP_VERSION}/github-mcp-server_Linux_${GITHUB_MCP_ARCH}.tar.gz" && \
    tar -xzf github-mcp-server.tgz -C /usr/local/bin github-mcp-server && \
    rm -f github-mcp-server.tgz && \
    chmod +x /usr/local/bin/github-mcp-server && \
    printf '#!/bin/sh\nexec /usr/local/bin/github-mcp-server stdio "$@"\n' > /usr/local/bin/mcp-github && \
    chmod +x /usr/local/bin/mcp-github

COPY --link --from=gitea-mcp /go/bin/gitea-mcp /usr/local/bin/gitea-mcp

COPY --link --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /usr/local/bin/

ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh -s -- v2.9.7

WORKDIR /app

COPY --link apps/api/package.json apps/api/package-lock.json ./

# node-gyp must be globally available for native addon compilation.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g node-gyp@13.0.2

# Install production JS deps AND mcp-remote
RUN --mount=type=cache,target=/root/.npm \
    NPM_CONFIG_JOBS="${NPM_CONFIG_JOBS:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}" && \
    npm_config_jobs="${NPM_CONFIG_JOBS}" npm ci --omit=dev --ignore-scripts && \
    npm install -g mcp-remote@0.14.3

# Compile node-pty native addon for the target platform.
RUN --mount=type=cache,target=/root/.npm \
    NPM_CONFIG_JOBS="${NPM_CONFIG_JOBS:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}" && \
    npm_config_jobs="${NPM_CONFIG_JOBS}" npm rebuild node-pty --build-from-source

# npm-distributed MCP helper.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g @playwright/mcp@0.0.83

# System libraries and Chrome channel required by Playwright. Install this as
# root at build time so non-root agent sessions do not try to elevate later.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    DEBIAN_FRONTEND=noninteractive npx -y playwright@1.64.0-alpha-1790635538000 install-deps chromium && \
    if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        DEBIAN_FRONTEND=noninteractive npx -y playwright@1.64.0-alpha-1790635538000 install chrome; \
    else \
        apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chromium && \
        mkdir -p /opt/google/chrome && \
        ln -sf /usr/bin/chromium /opt/google/chrome/chrome && \
        ln -sf /usr/bin/chromium /usr/local/bin/google-chrome; \
    fi && \
    /opt/google/chrome/chrome --version && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/*

ENV CHROME_BIN=/opt/google/chrome/chrome \
    GOOGLE_CHROME_BIN=/opt/google/chrome/chrome

# Ensures su/sudo sessions inherit high nofile: prevents EMFILE in dev mode
RUN mkdir -p /etc/security/limits.d \
    && printf "*  soft  nofile  1048576\n*  hard  nofile  1048576\n" > /etc/security/limits.d/99-nofile.conf

RUN mkdir -p /app/data /app/playground /home/node/.cache \
    && chown -R node:node /app/data /app/playground /home/node/.cache

USER node

# Download Chromium browser binary as node and verify Chrome is non-root usable.
RUN npx -y playwright@1.64.0-alpha-1790635538000 install chromium && /opt/google/chrome/chrome --version

USER root

COPY --link scripts/mcp-remote-wrapper.sh /usr/local/bin/mcp-remote-wrapper
RUN chmod +x /usr/local/bin/mcp-remote-wrapper

# Detects prod (dist/ present) vs dev (source code mounted, no dist/) at runtime.
# In dev mode it runs `npm install` then `nx serve` so the container works
# when the entire project root is volume-mounted (e.g. local Rails orchestration).
COPY --link docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY --link mode /app/mode
RUN chmod +x /app/mode

COPY --link scripts/install-fibe.sh /usr/local/bin/install-fibe.sh
ARG FIBE_CLI_VERSION=0.2.45
RUN chmod +x /usr/local/bin/install-fibe.sh \
    && /usr/local/bin/install-fibe.sh \
    && /usr/local/bin/fibe version \
    && /usr/local/bin/fibe local playgrounds --help >/dev/null

COPY --link --from=oven/bun:1.4.2-slim /usr/local/bin/bun /usr/local/bin/bun

FROM runtime-base

ARG BUILDKIT_INLINE_CACHE=1
ARG AGENT_PROVIDER=gemini

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    if [ "$AGENT_PROVIDER" = "claude_code" ] || [ "$AGENT_PROVIDER" = "claude-code" ] || [ "$AGENT_PROVIDER" = "antigravity" ]; then \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/partial/* && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    dbus dbus-x11 gnome-keyring libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*; \
    fi

COPY --link --from=cli /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --link --from=cli /usr/local/bin /usr/local/bin
COPY --link --from=cli /usr/local/share/cursor-agent /usr/local/share/cursor-agent

# The provider CLI stage inherits node's default docker-entrypoint.sh in
# /usr/local/bin. Re-apply fibe-agent's smart entrypoint after copying CLI bins.
COPY --link docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && grep -q "dist/main.js" /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

RUN if [ "$AGENT_PROVIDER" = "cursor" ]; then cursor-agent --version && cursor-agent --help >/dev/null; fi

RUN if [ "$AGENT_PROVIDER" = "gemini" ]; then \
    mkdir -p /home/node/.gemini && chown -R node:node /home/node/.gemini; \
    elif [ "$AGENT_PROVIDER" = "openai_codex" ] || [ "$AGENT_PROVIDER" = "openai-codex" ]; then \
    mkdir -p /home/node/.codex && chown -R node:node /home/node/.codex; \
    elif [ "$AGENT_PROVIDER" = "claude_code" ] || [ "$AGENT_PROVIDER" = "claude-code" ]; then \
    mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude; \
    elif [ "$AGENT_PROVIDER" = "opencode" ]; then \
    mkdir -p /home/node/.local/share/opencode && chown -R node:node /home/node/.local; \
    elif [ "$AGENT_PROVIDER" = "cursor" ]; then \
    mkdir -p /home/node/.cursor && chown -R node:node /home/node/.cursor; \
    elif [ "$AGENT_PROVIDER" = "antigravity" ]; then \
    mkdir -p /home/node/.gemini/antigravity-cli && chown -R node:node /home/node/.gemini; \
    fi

# Doing this LAST ensures code changes don't bust the Playwright/native cache
COPY --link --from=builder /app/apps/api/dist ./dist/
COPY --link --from=builder /app/apps/chat/dist ./chat/

# Inject git SHA at the last possible moment so it doesn't bust previous caches
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

# Cheap tracked marker for proving a fresh image was produced without
# invalidating dependency or build layers.
COPY --link ci /app/ci

USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
