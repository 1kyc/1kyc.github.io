FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# Browser for Playwright (site tests/screenshots + the Playwright MCP server).
# Must be installed here, as root at build time: the running container drops all
# Linux caps and sets no-new-privileges, so apt/root installs are impossible
# afterwards — which is why a browser was previously unavailable at runtime.
# `install chrome` puts Google Chrome at /opt/google/chrome/chrome (the default
# the Playwright MCP's `chrome` channel looks for); `--with-deps` apt-installs the
# shared libs a headless browser needs on Debian (libnss3, libatk, libasound,
# libgbm, …). Chrome is launched with --no-sandbox (set in .mcp.json) since the
# dropped caps disable its setuid sandbox. Pinned for reproducible builds.
RUN npx -y playwright@1.61.1 install --with-deps chrome \
    && rm -rf /var/lib/apt/lists/*

# Pre-create the dirs backed by named volumes (see devcontainer.json mounts)
# owned by node, so each fresh volume inherits node ownership on first init.
# We can't chown post-create: runArgs drops all caps + no-new-privileges, so
# sudo is unavailable. .config/gh persists gh's auth token; .claude persists
# the full Claude Code config footprint (CLAUDE_CONFIG_DIR points here).
RUN mkdir -p /home/node/.config/gh /home/node/.claude \
    && chown -R node:node /home/node/.config /home/node/.claude

USER node
WORKDIR /workspace

CMD ["bash"]