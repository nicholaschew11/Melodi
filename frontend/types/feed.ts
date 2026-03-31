export interface Comment {
  id: string;
  created_at: string;
  post_id: number;
  body: string;
  user_id: string;
  users: {
    id: string;
    username: string;
    display_name: string | null;
  };
}

export interface AlbumRanking {
  id?: number;
  post_id: number;
  spotify_id: string;
  rank: number;
  created_at?: string;
}

export type ReactionType = "fire" | "crying" | "mind_blown" | "dance" | "chill" | "love";

export const REACTION_EMOJI_MAP: Record<ReactionType, { emoji: string; label: string }> = {
  fire: { emoji: "\uD83D\uDD25", label: "This slaps" },
  crying: { emoji: "\uD83D\uDE2D", label: "In my feels" },
  mind_blown: { emoji: "\uD83E\uDD2F", label: "Unexpected banger" },
  dance: { emoji: "\uD83D\uDC83", label: "Makes me move" },
  chill: { emoji: "\uD83D\uDE0C", label: "Vibes" },
  love: { emoji: "\u2764\uFE0F", label: "Love this" },
};

export interface FeedPost {
  post_id: number;
  user_id: string;
  content: string;
  like_count: number;
  visibility: string;
  created_at: string;
  updated_at: string;
  isLiked?: boolean;
  userReaction?: ReactionType | null;
  reaction_summary?: Record<string, number>;
  comments?: Comment[];
  album_id?: string | null;
  albumRankings?: AlbumRanking[];
  songRank?: number;
  songScore?: number;
  users: {
    id: string;
    username: string;
    display_name: string | null;
  };
  songs: {
    song_id: string;
    spotify_id: string;
    song_name: string;
    artist_name: string;
    album_name: string | null;
    cover_art_url: string | null;
  } | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: {
    id: string;
    name: string;
  }[];
  album: {
    id: string;
    name: string;
    images: {
      url: string;
      height: number;
      width: number;
    }[];
  };
  external_urls: {
    spotify: string;
  };
}

export interface SelectedSong {
  spotifyId: string;
  name: string;
  artist: string;
  coverArtUrl?: string | null;
}

export interface SpotifyAlbumTrack {
  id: string;
  name: string;
  artists: {
    id: string;
    name: string;
  }[];
  track_number: number;
  duration_ms: number;
  preview_url: string | null;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: {
    id: string;
    name: string;
  }[];
  images: {
    url: string;
    height: number;
    width: number;
  }[];
  release_date: string;
  total_tracks: number;
  tracks: {
    items: SpotifyAlbumTrack[];
    total: number;
    next: string | null;
  };
}

export interface RankedSong {
  spotifyId: string;
  name: string;
  artist: string;
  rank: number;
  trackNumber: number;
}

export interface SelectedAlbum {
  spotifyId: string;
  name: string;
  artist: string;
  coverArtUrl: string;
  rankedSongs: RankedSong[];
}
