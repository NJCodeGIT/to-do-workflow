#!/bin/bash
# SessionStart hook: make a fresh cloud container ready to lint, test and run the app.
# Local sessions are left alone (the developer manages Node and .env there).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Idempotent: npm install reuses the cached node_modules from a previous container state.
npm install --no-audit --no-fund

# `npm run dev` needs JWT_SECRET (32+ chars). Tests, lint and CI do not. Never overwrite .env.
if [ ! -f .env ]; then
  cp .env.example .env
  secret="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${secret}|" .env
fi
