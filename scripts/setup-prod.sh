#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
# Melodi — Production setup helper
# Generates production-ready environment configurations
# ═══════════════════════════════════════════════════════════

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════════════"
echo "  Melodi — Production Environment Setup"
echo "═══════════════════════════════════════════════════"
echo ""

# Backend .env.production
cat > "$ROOT_DIR/backend/.env.production" <<'EOF'
# ── Production Backend Configuration ──
# Fill in these values for your production deployment

PORT=3000

# Supabase (use your production project)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Database (for Prisma, if used)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Spotify
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# CORS — set to your production frontend URLs
ALLOWED_ORIGINS=https://your-app.com,melodi://

# API base URL (for internal calls like batch analysis)
API_BASE_URL=https://api.your-domain.com
EOF

# Frontend .env.production
cat > "$ROOT_DIR/frontend/.env.production" <<'EOF'
# ── Production Frontend Configuration ──

# Points to your deployed backend (NOT localhost, NOT ngrok)
EXPO_PUBLIC_API_URL=https://api.your-domain.com

# Supabase (use your production project)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
EOF

echo "Created:"
echo "  backend/.env.production"
echo "  frontend/.env.production"
echo ""
echo "Next steps:"
echo "  1. Fill in the production credentials in both files"
echo "  2. Deploy backend: docker build -t melodi-backend ./backend"
echo "  3. Deploy to your host (Railway, Fly.io, AWS, etc.)"
echo "  4. Run the SQL in db/init.sql on your production Supabase"
echo "  5. Build frontend: cd frontend && eas build --profile production"
echo ""
echo "Recommended hosting:"
echo "  Backend:   Railway.app or Fly.io (easy Docker deploys)"
echo "  Database:  Supabase (already configured)"
echo "  Frontend:  Expo EAS + TestFlight/App Store"
echo ""
