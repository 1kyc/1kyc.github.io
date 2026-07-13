FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

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

# Claude Code via the native installer, as the node user, into ~/.local — which
# is writable, so it can self-update. The previous root `npm install -g` lived in
# root-owned /usr/local and could never auto-update in this sudo-less, cap-dropped
# container (and running `claude install` by hand left two installs fighting).
# Prepend ~/.local/bin so the binary is found by the non-login shells the harness
# uses (Debian's ~/.profile only adds it for login shells). Chat history/config
# are unaffected: they live in the .claude volume (CLAUDE_CONFIG_DIR), separate
# from the binary under ~/.local.
ENV PATH="/home/node/.local/bin:${PATH}"
# Download-then-run (not `curl | bash`) so a failed fetch fails the build instead
# of silently piping nothing into bash and shipping an image without Claude.
RUN curl -fsSL https://claude.ai/install.sh -o /tmp/install-claude.sh \
    && bash /tmp/install-claude.sh \
    && rm /tmp/install-claude.sh

CMD ["bash"]