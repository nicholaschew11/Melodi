-- Melodi Local Database Schema
-- This file initializes the local PostgreSQL database with all required tables.
-- It runs automatically when the Docker container is first created.

-- ══════════════════════════════════════════
-- Core tables
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(30) UNIQUE,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(100),
    bio TEXT,
    favorite_genres TEXT,
    is_public BOOLEAN DEFAULT true,
    spotify_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
    song_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    spotify_id VARCHAR(255) UNIQUE NOT NULL,
    song_name VARCHAR(500) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    album_name VARCHAR(500),
    cover_art_url TEXT,
    valence DECIMAL,
    arousal DECIMAL,
    analysis JSONB,
    embedding JSONB,
    va_prediction JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    post_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    top_song_id BIGINT REFERENCES songs(song_id),
    album_id VARCHAR(255),
    like_count INTEGER DEFAULT 0,
    visibility VARCHAR(20) DEFAULT 'public',
    reaction_summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friends (
    user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_user_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_one_id, user_two_id)
);

CREATE TABLE IF NOT EXISTS likes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id BIGINT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS album_rankings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    spotify_id VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id, rank)
);

CREATE TABLE IF NOT EXISTS comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS song_rankings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id BIGINT REFERENCES posts(post_id) ON DELETE CASCADE,
    song_id BIGINT NOT NULL REFERENCES songs(song_id) ON DELETE CASCADE,
    score DECIMAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS song_data (
    id BIGINT PRIMARY KEY,
    acousticness DECIMAL,
    danceability DECIMAL,
    energy DECIMAL,
    instrumentalness DECIMAL,
    key INTEGER,
    liveness DECIMAL,
    loudness DECIMAL,
    mode INTEGER,
    speechiness DECIMAL,
    tempo DECIMAL,
    valence DECIMAL,
    arousal DECIMAL,
    analysis JSONB,
    embedding JSONB,
    va_prediction JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_songs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id BIGINT NOT NULL REFERENCES songs(song_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, song_id)
);

-- ══════════════════════════════════════════
-- New feature tables
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id BIGINT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    reaction_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions(post_id);

CREATE TABLE IF NOT EXISTS taste_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avg_valence DECIMAL,
    avg_arousal DECIMAL,
    genre_distribution JSONB DEFAULT '{}',
    song_count INTEGER DEFAULT 0,
    last_computed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compatibility_cache (
    user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score DECIMAL NOT NULL,
    genre_overlap DECIMAL,
    mood_proximity DECIMAL,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS discovery_actions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id BIGINT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL,
    discovered_via_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);

-- ══════════════════════════════════════════
-- Indexes for performance
-- ══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user_one ON friends(user_one_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_two ON friends(user_two_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_songs_spotify_id ON songs(spotify_id);
