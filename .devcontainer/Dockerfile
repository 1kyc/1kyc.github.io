FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

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