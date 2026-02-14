#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

# DSPy RLM's Python interpreter requires Deno.
export PATH="$HOME/.deno/bin:$PATH"
if [ -n "${DENO_BIN:-}" ]; then
  export PATH="$(dirname "$DENO_BIN"):$PATH"
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "Error: Deno executable not found." >&2
  echo "Install it with: curl -fsSL https://deno.land/install.sh | sh" >&2
  echo "Or set DENO_BIN to your deno binary path." >&2
  exit 1
fi

source venv/bin/activate
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
