# The Codex broker's container (workers/codex-broker/worker.js): the Codex CLI and the call server, run as an unprivileged user.
# Why (28 Oct 2026, spec ci-on-codex-subscription-design): codex never runs as root and has no shell tool; the login file is mode 0600 for this user only. The image holds no secret.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && npm install -g @openai/codex@0.162.1 && useradd -m -u 1001 codex
COPY server.mjs /app/server.mjs
USER codex
ENV CODEX_HOME=/home/codex/.codex
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
