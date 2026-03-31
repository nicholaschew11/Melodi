# Melodi

A social music discovery app where you share, rank, and discover music through your friends.

## Quick Start (One Command)

```bash
make dev
```

That's it. This will:
1. Install dependencies (if needed)
2. Auto-detect your local IP address
3. Start the backend on `http://localhost:3000`
4. Start Expo in LAN mode (phone connects over WiFi, no ngrok needed)
5. Set `EXPO_PUBLIC_API_URL` to your local IP automatically

**First time?** You need to fill in your credentials:
- Copy `backend/.env.example` to `backend/.env` and add your Supabase + Spotify keys
- Copy `frontend/.env.example` to `frontend/.env` and add your Supabase keys
- The script will create these for you on first run if they don't exist

### Other Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Start everything |
| `make stop` | Stop all services |
| `make reset` | Stop + wipe local database |
| `make db` | Start only the local PostgreSQL |
| `make help` | Show all available commands |

Or use the script directly:
```bash
./scripts/dev.sh start   # same as make dev
./scripts/dev.sh stop
./scripts/dev.sh reset
./scripts/dev.sh db
```

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  Expo (Frontend)    │────>│  Express API (Backend)   │
│  React Native       │     │  Port 3000               │
│  Port 8081          │     │                          │
└─────────────────────┘     └──────────┬───────────────┘
                                       │
                            ┌──────────▼───────────────┐
                            │  Supabase (PostgreSQL)   │
                            │  Cloud (dev & prod)      │
                            └──────────────────────────┘
```

### How the Phone Connects (No Ngrok)

The old way required ngrok because your phone couldn't reach `localhost`. The new setup uses **Expo LAN mode**:

1. `dev.sh` detects your computer's local IP (e.g., `192.168.1.42`)
2. Sets `EXPO_PUBLIC_API_URL=http://192.168.1.42:3000`
3. Starts Expo with `--host lan`
4. Your phone (on the same WiFi) can reach the backend directly

**Requirements:** Phone and computer must be on the same WiFi network.

If you need to test from outside your network (e.g., sharing with someone), you can still use ngrok:
```bash
ngrok http 3000
# Then set EXPO_PUBLIC_API_URL to the ngrok URL in frontend/.env
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase key |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify API client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify API client secret |
| `ALLOWED_ORIGINS` | No | CORS origins (auto-configured by dev.sh) |
| `API_BASE_URL` | No | Self-referencing URL for internal calls |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | No | Backend URL (auto-set by dev.sh) |
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |

## Database

### Development
The app uses **Supabase** (cloud PostgreSQL) for both development and production. Your Supabase project is the single source of truth.

A `docker-compose.yml` is provided if you want a **local PostgreSQL** for offline development or testing:
```bash
make db                    # Start local PostgreSQL on port 5433
psql -h localhost -p 5433 -U melodi -d melodi   # Connect
```

The local database is initialized from `db/init.sql` which contains the full schema.

### Running Migrations on Supabase
When you need to add new tables or modify the schema in production, run the SQL in `db/init.sql` through the Supabase SQL Editor, or use the Supabase CLI:
```bash
# Using Supabase CLI
supabase db push
```

### Schema Overview
Core tables: `users`, `posts`, `songs`, `friends`, `likes`, `comments`, `album_rankings`, `song_rankings`, `song_data`

Feature tables: `reactions`, `taste_profiles`, `compatibility_cache`, `discovery_actions`

## Deploy to TestFlight

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login
eas login

# 3. Build
cd frontend
eas build --profile production   # Select ALL platforms

# 4. Submit
# Android: Download APK from Expo dashboard and share
# iOS: Submit to App Store Connect
eas submit -p ios

# 5. On App Store Connect
# TestFlight > Add testers to the new build
```

## Project Structure

```
melodi/
├── backend/                 # Express.js API
│   ├── src/
│   │   ├── controllers/     # Business logic
│   │   ├── routes/          # API endpoints
│   │   ├── middleware/       # Auth middleware
│   │   └── db.ts            # Database connection
│   └── prisma/              # Schema definition
├── frontend/                # React Native (Expo)
│   ├── app/                 # Screens (Expo Router)
│   │   ├── (tabs)/          # Tab screens (Feed, Search, Discover, Profile)
│   │   └── (auth)/          # Login/Signup
│   ├── components/          # Reusable components
│   ├── contexts/            # Auth, Theme providers
│   ├── lib/                 # Spotify API, Supabase, OAuth
│   └── constants/           # Theme, API config
├── trackAnalysisService/    # Python audio analysis (FastAPI)
├── db/
│   └── init.sql             # Full database schema
├── scripts/
│   └── dev.sh               # One-command dev setup
├── docker-compose.yml       # Local PostgreSQL
└── Makefile                 # Dev commands
```
