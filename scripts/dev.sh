#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
# Melodi — One-command local development
# Usage:  ./scripts/dev.sh          Start everything
#         ./scripts/dev.sh stop     Tear down (keeps DB data)
#         ./scripts/dev.sh reset    Tear down + wipe DB data
#         ./scripts/dev.sh db       Start only the database
# ═══════════════════════════════════════════════════════════

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[melodi]${NC} $1"; }
warn() { echo -e "${YELLOW}[melodi]${NC} $1"; }
err()  { echo -e "${RED}[melodi]${NC} $1"; }
info() { echo -e "${CYAN}[melodi]${NC} $1"; }

# ── Get local IP address ──
get_local_ip() {
    # macOS
    if command -v ipconfig &>/dev/null; then
        ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost"
    # Linux
    elif command -v hostname &>/dev/null; then
        hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"
    else
        echo "localhost"
    fi
}

# ── Check dependencies ──
check_deps() {
    local missing=()
    command -v docker &>/dev/null   || missing+=("docker")
    command -v node &>/dev/null     || missing+=("node")
    command -v npm &>/dev/null      || missing+=("npm")

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing required tools: ${missing[*]}"
        err "Install them first, then re-run this script."
        exit 1
    fi
}

# ── Stop everything ──
stop() {
    log "Stopping services..."

    # Kill background processes we started
    if [ -f "$ROOT_DIR/.dev-pids" ]; then
        while read -r pid; do
            kill "$pid" 2>/dev/null || true
        done < "$ROOT_DIR/.dev-pids"
        rm -f "$ROOT_DIR/.dev-pids"
    fi

    # Stop Docker services
    docker compose down 2>/dev/null || true

    log "All services stopped."
}

# ── Reset (stop + wipe data) ──
reset() {
    stop
    log "Wiping database data..."
    docker compose down -v 2>/dev/null || true
    log "Database data wiped. Next start will re-initialize."
}

# ── Start database only ──
start_db() {
    log "Starting database..."
    docker compose up -d db
    log "Waiting for PostgreSQL to be ready..."
    until docker compose exec -T db pg_isready -U melodi &>/dev/null; do
        sleep 1
    done
    log "Database is ready on localhost:5433"
    info "  Connect: psql -h localhost -p 5433 -U melodi -d melodi"
}

# ── Generate .env files if missing ──
setup_env() {
    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    # Backend .env
    if [ ! -f "$ROOT_DIR/backend/.env" ]; then
        warn "No backend/.env found. Creating from .env.example..."
        if [ -f "$ROOT_DIR/backend/.env.example" ]; then
            cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
            warn "  -> Created backend/.env — please fill in your Supabase/Spotify credentials"
        else
            cat > "$ROOT_DIR/backend/.env" <<EOF
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
ALLOWED_ORIGINS=http://localhost:8081,http://${LOCAL_IP}:8081
API_BASE_URL=http://localhost:3000
EOF
            warn "  -> Created backend/.env — please fill in your Supabase/Spotify credentials"
        fi
    fi

    # Ensure ALLOWED_ORIGINS includes the local IP
    if ! grep -q "$LOCAL_IP" "$ROOT_DIR/backend/.env" 2>/dev/null; then
        if grep -q "ALLOWED_ORIGINS" "$ROOT_DIR/backend/.env"; then
            # Append local IP to existing ALLOWED_ORIGINS
            sed -i.bak "s|ALLOWED_ORIGINS=\(.*\)|ALLOWED_ORIGINS=\1,http://${LOCAL_IP}:8081|" "$ROOT_DIR/backend/.env"
            rm -f "$ROOT_DIR/backend/.env.bak"
        fi
    fi

    # Frontend .env
    if [ ! -f "$ROOT_DIR/frontend/.env" ]; then
        warn "No frontend/.env found. Creating..."
        cat > "$ROOT_DIR/frontend/.env" <<EOF
EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:3000
EOF
        if [ -f "$ROOT_DIR/frontend/.env.example" ]; then
            # Append Supabase vars from example
            grep "SUPABASE" "$ROOT_DIR/frontend/.env.example" >> "$ROOT_DIR/frontend/.env" 2>/dev/null || true
        fi
        warn "  -> Created frontend/.env — please fill in Supabase credentials"
    fi

    # Always update the API URL to current local IP
    if grep -q "EXPO_PUBLIC_API_URL" "$ROOT_DIR/frontend/.env"; then
        sed -i.bak "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:3000|" "$ROOT_DIR/frontend/.env"
        rm -f "$ROOT_DIR/frontend/.env.bak"
    else
        echo "EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:3000" >> "$ROOT_DIR/frontend/.env"
    fi
}

# ── Install dependencies if needed ──
install_deps() {
    if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
        log "Installing backend dependencies..."
        (cd "$ROOT_DIR/backend" && npm install)
    fi

    if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
        log "Installing frontend dependencies..."
        (cd "$ROOT_DIR/frontend" && npm install)
    fi
}

# ── Main: start everything ──
start() {
    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    check_deps
    setup_env
    install_deps

    # Clean up any previous PIDs
    rm -f "$ROOT_DIR/.dev-pids"

    log "Starting backend on port 3000..."
    (cd "$ROOT_DIR/backend" && npm run dev) &
    echo $! >> "$ROOT_DIR/.dev-pids"

    # Wait for backend to be ready
    log "Waiting for backend to be ready..."
    for i in $(seq 1 30); do
        if curl -sf http://localhost:3000/ &>/dev/null; then
            break
        fi
        sleep 1
    done

    log "Starting frontend (Expo)..."
    info ""
    info "  ┌──────────────────────────────────────────────┐"
    info "  │  Backend:   http://localhost:3000             │"
    info "  │  Backend:   http://${LOCAL_IP}:3000       │"
    info "  │  Frontend:  Expo DevTools (see below)        │"
    info "  │                                              │"
    info "  │  No ngrok needed! Phone connects via LAN:    │"
    info "  │  API URL:   http://${LOCAL_IP}:3000       │"
    info "  │                                              │"
    info "  │  Stop:   ./scripts/dev.sh stop               │"
    info "  │  Reset:  ./scripts/dev.sh reset              │"
    info "  └──────────────────────────────────────────────┘"
    info ""

    # Start Expo with LAN host (no tunnel/ngrok needed)
    cd "$ROOT_DIR/frontend"
    EXPO_PUBLIC_API_URL="http://${LOCAL_IP}:3000" npx expo start --host lan
}

# ── Dispatch command ──
case "${1:-start}" in
    start)  start ;;
    stop)   stop ;;
    reset)  reset ;;
    db)     start_db ;;
    *)
        echo "Usage: $0 {start|stop|reset|db}"
        exit 1
        ;;
esac
