#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Neural-Trace v2 — Setup & Launch
# Checks all dependencies, installs missing ones, starts server, opens browser.
# Run once to set up. Run again anytime to verify everything is healthy.
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

PASS="${GREEN}✓${RESET}"
FAIL="${RED}✗${RESET}"
WARN="${YELLOW}⚠${RESET}"

ERRORS=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${NEURAL_TRACE_PORT:-8080}"

# ── Helpers ───────────────────────────────────────────────────────────────────
ok()   { echo -e "  ${PASS}  $1"; }
fail() { echo -e "  ${FAIL}  ${RED}$1${RESET}"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${WARN}  ${YELLOW}$1${RESET}"; }
info() { echo -e "  ${DIM}  $1${RESET}"; }
ask()  { printf "\n  %s [y/N]: " "$1"; read -r ans; echo ""; [[ "$ans" =~ ^[Yy]$ ]]; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "  ${CYAN}${BOLD}███╗   ██╗███████╗██╗   ██╗██████╗  █████╗ ██╗${RESET}"
echo -e "  ${CYAN}${BOLD}████╗  ██║██╔════╝██║   ██║██╔══██╗██╔══██╗██║${RESET}"
echo -e "  ${CYAN}${BOLD}██╔██╗ ██║█████╗  ██║   ██║██████╔╝███████║██║${RESET}"
echo -e "  ${CYAN}${BOLD}██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██╔══██║██║${RESET}"
echo -e "  ${CYAN}${BOLD}██║ ╚████║███████╗╚██████╔╝██║  ██║██║  ██║███████╗${RESET}"
echo -e "  ${CYAN}${BOLD}╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝${RESET}"
echo -e "  ${DIM}── v2 SETUP ────────────────────────────────────────${RESET}"
echo ""

# ── [1/6] Node.js ─────────────────────────────────────────────────────────────
echo -e "  ${BOLD}[1/6] Node.js${RESET}"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER found — need v18 or higher"
    info "Download from: https://nodejs.org"
  fi
else
  fail "Node.js not found"
  if ask "Install Node.js 18 via NodeSource?"; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    ok "Node.js installed"
  fi
fi
echo ""

# ── [2/6] Python ──────────────────────────────────────────────────────────────
echo -e "  ${BOLD}[2/6] Python${RESET}"
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
  PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
  PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ]; then
    ok "Python $PY_VER"
  else
    fail "Python $PY_VER found — need 3.11 or higher"
    if ask "Install Python 3.11 via apt?"; then
      sudo apt update && sudo apt install -y python3.11 python3.11-venv
      ok "Python 3.11 installed"
    fi
  fi
else
  fail "Python 3 not found"
  if ask "Install Python 3.11 via apt?"; then
    sudo apt update && sudo apt install -y python3.11 python3.11-venv
    ok "Python 3.11 installed"
  fi
fi
echo ""

# ── [3/6] npm packages ────────────────────────────────────────────────────────
echo -e "  ${BOLD}[3/6] Node packages${RESET}"
cd "$ROOT"
if [ -d "node_modules/docx" ]; then
  DOCX_VER=$(node -e "console.log(require('./node_modules/docx/package.json').version)" 2>/dev/null || echo "unknown")
  ok "docx@$DOCX_VER"
else
  warn "docx not installed — installing now..."
  npm install
  ok "Node packages installed"
fi
echo ""

# ── [4/6] Python packages ─────────────────────────────────────────────────────
echo -e "  ${BOLD}[4/6] Python packages${RESET}"
MISSING_PY=()
python3 -c "import requests" 2>/dev/null  || MISSING_PY+=("requests")
python3 -c "import dotenv"   2>/dev/null  || MISSING_PY+=("python-dotenv")

if [ ${#MISSING_PY[@]} -eq 0 ]; then
  ok "requests, python-dotenv installed"
else
  warn "Missing: ${MISSING_PY[*]} — installing..."
  pip3 install -r requirements.txt --break-system-packages 2>/dev/null \
    || pip3 install -r requirements.txt
  ok "Python packages installed"
fi
echo ""

# ── [5/6] .env ────────────────────────────────────────────────────────────────
echo -e "  ${BOLD}[5/7] Environment${RESET}"
if [ -f "$ROOT/.env" ]; then
  API_KEY=$(grep -E '^ETHERSCAN_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '[:space:]')
  if [ -z "$API_KEY" ] || [ "$API_KEY" = "your_etherscan_api_key_here" ]; then
    fail ".env found but ETHERSCAN_API_KEY is not set"
    info "Edit .env and add your key from: https://etherscan.io/myapikey"
    printf "\n  Open .env in nano now? [y/N]: "
    read -r ans
    [[ "$ans" =~ ^[Yy]$ ]] && nano "$ROOT/.env"
  else
    ok ".env configured — API key is set"
    # Read port from .env
    ENV_PORT=$(grep -E '^NEURAL_TRACE_PORT=' "$ROOT/.env" | cut -d= -f2- | tr -d '[:space:]')
    [ -n "$ENV_PORT" ] && PORT="$ENV_PORT"
  fi

  # Check auth credentials
  AUTH_USER=$(grep -E '^NEURAL_TRACE_USER=' "$ROOT/.env" | cut -d= -f2- | tr -d '[:space:]')
  AUTH_PASS=$(grep -E '^NEURAL_TRACE_PASS=' "$ROOT/.env" | cut -d= -f2- | tr -d '[:space:]')
  if [ -z "$AUTH_USER" ] || [ -z "$AUTH_PASS" ]; then
    warn "NEURAL_TRACE_USER / NEURAL_TRACE_PASS not set — server will run without authentication"
    info "Add credentials to .env to enable login protection"
  elif [ "$AUTH_PASS" = "changeme" ]; then
    warn "Default password detected — change NEURAL_TRACE_PASS in .env before sharing"
  else
    ok "Authentication configured — login protected"
  fi
else
  fail ".env not found"
  if [ -f "$ROOT/.env.example" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    ok ".env created from .env.example"
    warn "Add your Etherscan API key to .env before running"
    info "Get one free at: https://etherscan.io/myapikey"
    printf "\n  Open .env in nano now? [y/N]: "
    read -r ans
    [[ "$ans" =~ ^[Yy]$ ]] && nano "$ROOT/.env"
    ERRORS=$((ERRORS + 1))
  else
    fail ".env.example missing"
  fi
fi
echo ""

# ── [6/7] Data directories ────────────────────────────────────────────────────
echo -e "  ${BOLD}[6/7] Data directories${RESET}"
mkdir -p "$ROOT/data/forward_trace" \
         "$ROOT/data/origin_trace"  \
         "$ROOT/data/monitor"       \
         "$ROOT/data/reports"
ok "data/forward_trace/"
ok "data/origin_trace/"
ok "data/monitor/"
ok "data/reports/"
echo ""

# ── [7/7] Tests ───────────────────────────────────────────────────────────────
echo -e "  ${BOLD}[7/7] Tests${RESET}"
echo ""

if ! python3 -m pytest --version &>/dev/null 2>&1; then
  warn "pytest not found — installing..."
  pip3 install pytest --break-system-packages 2>/dev/null || pip3 install pytest
fi

TEST_OUTPUT=$(cd "$ROOT" && python3 -m pytest tests/ -v --tb=short 2>&1)
TEST_EXIT=$?

while IFS= read -r line; do
  if echo "$line" | grep -qE "::test_.*PASSED"; then
    FILE=$(echo "$line" | sed 's|tests/||' | sed 's|\.py::.*||')
    NAME=$(echo "$line" | sed 's|.*::||' | sed 's| PASSED.*||' | tr '_' ' ')
    echo -e "    ${PASS}  ${DIM}${FILE}${RESET}  ${NAME}"
  elif echo "$line" | grep -qE "::test_.*FAILED"; then
    FILE=$(echo "$line" | sed 's|tests/||' | sed 's|\.py::.*||')
    NAME=$(echo "$line" | sed 's|.*::||' | sed 's| FAILED.*||' | tr '_' ' ')
    echo -e "    ${FAIL}  ${RED}${FILE}  ${NAME}${RESET}"
  elif echo "$line" | grep -qE "^FAILED tests/"; then
    echo -e "    ${RED}${line}${RESET}"
  fi
done <<< "$TEST_OUTPUT"

echo ""
SUMMARY=$(echo "$TEST_OUTPUT" | grep -E "passed|failed" | tail -1 | sed 's/=//g' | xargs)
if [ $TEST_EXIT -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}✓ ${SUMMARY}${RESET}"
else
  echo -e "  ${RED}${BOLD}✗ ${SUMMARY}${RESET}"
fi
echo ""

if [ $TEST_EXIT -ne 0 ]; then
  echo -e "  ${RED}${BOLD}Tests failed. Fix above then run ./setup.sh again.${RESET}"
  echo ""
  exit 1
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo "  ─────────────────────────────────────────────────────────"
echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}$ERRORS issue(s) found. Fix above then run ./setup.sh again.${RESET}"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}${BOLD}All checks passed. Starting Neural-Trace v2...${RESET}"
echo ""
printf "  ${CYAN}Press Enter to start the server and open browser...${RESET}"
read -r
echo ""

# ── Launch ────────────────────────────────────────────────────────────────────
URL="http://localhost:${PORT}"

# Start server
node "$ROOT/server.js" &
SERVER_PID=$!

# Wait for server to bind
sleep 1

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo -e "  ${RED}${BOLD}Server failed to start. Check .env and try: node server.js${RESET}"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}${BOLD}Server running  →  PID $SERVER_PID${RESET}"
echo -e "  ${CYAN}${BOLD}Opening         →  $URL${RESET}"
echo ""
echo -e "  ${DIM}Press CTRL+C to stop${RESET}"
echo ""

# Open browser
case "$(uname -s)" in
  Darwin)                   open "$URL" ;;
  Linux)                    xdg-open "$URL" 2>/dev/null || sensible-browser "$URL" 2>/dev/null || true ;;
  MINGW*|MSYS*|CYGWIN*)    start "$URL" ;;
  *)                        warn "Cannot auto-open browser. Navigate to: $URL" ;;
esac

# Keep alive — CTRL+C kills server cleanly
trap "echo ''; echo -e '  ${DIM}Stopping Neural-Trace...${RESET}'; kill $SERVER_PID 2>/dev/null; echo '  Done.'; echo ''" INT TERM
wait "$SERVER_PID"
