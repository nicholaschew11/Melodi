import { Response } from "express";
import { getDatabase } from "../db";
import { AuthRequest } from "../middleware/auth";

// Compute a user's taste profile from their posts and reactions
async function computeTasteProfile(userId: string, supabase: any) {
  // Get songs from user's own posts (weight 2x)
  const { data: userPosts } = await supabase
    .from("posts")
    .select("top_song_id")
    .eq("user_id", userId)
    .not("top_song_id", "is", null);

  const postedSongIds = (userPosts || []).map((p: any) => p.top_song_id);

  // Get songs from posts the user reacted to (weight 1x)
  const { data: userReactions } = await supabase
    .from("reactions")
    .select("post_id")
    .eq("user_id", userId);

  let reactedSongIds: number[] = [];
  if (userReactions && userReactions.length > 0) {
    const reactedPostIds = userReactions.map((r: any) => r.post_id);
    const { data: reactedPosts } = await supabase
      .from("posts")
      .select("top_song_id")
      .in("post_id", reactedPostIds)
      .not("top_song_id", "is", null);
    reactedSongIds = (reactedPosts || []).map((p: any) => p.top_song_id);
  }

  // Also check likes table for backward compat
  const { data: userLikes } = await supabase
    .from("likes")
    .select("post_id")
    .eq("user_id", userId);

  if (userLikes && userLikes.length > 0) {
    const likedPostIds = userLikes.map((l: any) => l.post_id);
    const { data: likedPosts } = await supabase
      .from("posts")
      .select("top_song_id")
      .in("post_id", likedPostIds)
      .not("top_song_id", "is", null);
    const likedSongIds = (likedPosts || []).map((p: any) => p.top_song_id);
    reactedSongIds = [...new Set([...reactedSongIds, ...likedSongIds])];
  }

  // Get all unique song IDs
  const allSongIds = [...new Set([...postedSongIds, ...reactedSongIds])];

  if (allSongIds.length === 0) {
    // No data — store empty profile
    const profile = {
      user_id: userId,
      avg_valence: null,
      avg_arousal: null,
      genre_distribution: {},
      song_count: 0,
      last_computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("taste_profiles")
      .upsert(profile, { onConflict: "user_id" });

    return profile;
  }

  // Fetch song analysis data (valence, arousal from song_data)
  const { data: songData } = await supabase
    .from("song_data")
    .select("id, valence, arousal")
    .in("id", allSongIds);

  // Build a map of song_id -> analysis data
  const songDataMap: Record<number, { valence: number; arousal: number }> = {};
  for (const sd of songData || []) {
    if (sd.valence != null && sd.arousal != null) {
      songDataMap[sd.id] = { valence: sd.valence, arousal: sd.arousal };
    }
  }

  // Compute weighted averages
  let totalValence = 0;
  let totalArousal = 0;
  let totalWeight = 0;

  for (const songId of postedSongIds) {
    const data = songDataMap[songId];
    if (data) {
      totalValence += data.valence * 2;
      totalArousal += data.arousal * 2;
      totalWeight += 2;
    }
  }

  for (const songId of reactedSongIds) {
    const data = songDataMap[songId];
    if (data) {
      totalValence += data.valence * 1;
      totalArousal += data.arousal * 1;
      totalWeight += 1;
    }
  }

  const avgValence = totalWeight > 0 ? totalValence / totalWeight : null;
  const avgArousal = totalWeight > 0 ? totalArousal / totalWeight : null;

  // Build genre distribution from song artist names
  const { data: songs } = await supabase
    .from("songs")
    .select("song_id, artist_name")
    .in("song_id", allSongIds);

  const genreCounts: Record<string, number> = {};
  const artistNames = new Set<string>();
  for (const song of songs || []) {
    if (song.artist_name) {
      // Use artist name as a proxy for genre grouping
      const artists = song.artist_name.split(",").map((a: string) => a.trim().toLowerCase());
      for (const artist of artists) {
        artistNames.add(artist);
        genreCounts[artist] = (genreCounts[artist] || 0) + 1;
      }
    }
  }

  // Normalize genre distribution to percentages
  const totalGenreCount = Object.values(genreCounts).reduce((sum, c) => sum + c, 0);
  const genreDistribution: Record<string, number> = {};
  if (totalGenreCount > 0) {
    // Take top 10 artists/genres
    const sorted = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [genre, count] of sorted) {
      genreDistribution[genre] = Math.round((count / totalGenreCount) * 100) / 100;
    }
  }

  const profile = {
    user_id: userId,
    avg_valence: avgValence,
    avg_arousal: avgArousal,
    genre_distribution: genreDistribution,
    song_count: allSongIds.length,
    last_computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("taste_profiles")
    .upsert(profile, { onConflict: "user_id" });

  return profile;
}

// GET /api/taste/profile/:userId
export const getTasteProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const supabase = await getDatabase();

    // Check if profile exists and is fresh (< 24h old)
    const { data: existing } = await supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing && existing.last_computed_at) {
      const age = Date.now() - new Date(existing.last_computed_at).getTime();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (age < ONE_DAY) {
        return res.status(200).json({ profile: existing });
      }
    }

    // Recompute
    const profile = await computeTasteProfile(userId, supabase);
    return res.status(200).json({ profile });
  } catch (error) {
    console.error("Error in getTasteProfile:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// GET /api/taste/compatibility/:userId
export const getCompatibility = async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.userId;

    if (!currentUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }

    if (currentUserId === targetUserId) {
      return res.status(200).json({
        compatibility: {
          score: 100,
          genreOverlap: 100,
          moodProximity: 100,
        },
      });
    }

    const supabase = await getDatabase();

    // Check cache first (order doesn't matter — store both ways)
    const cacheKey1 = { user_a_id: currentUserId, user_b_id: targetUserId };
    const cacheKey2 = { user_a_id: targetUserId, user_b_id: currentUserId };

    const { data: cached } = await supabase
      .from("compatibility_cache")
      .select("*")
      .eq("user_a_id", cacheKey1.user_a_id)
      .eq("user_b_id", cacheKey1.user_b_id)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.computed_at).getTime();
      const SIX_HOURS = 6 * 60 * 60 * 1000;
      if (age < SIX_HOURS) {
        return res.status(200).json({
          compatibility: {
            score: cached.score,
            genreOverlap: cached.genre_overlap,
            moodProximity: cached.mood_proximity,
          },
        });
      }
    }

    // Get both taste profiles (compute if needed)
    let { data: profileA } = await supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (!profileA) {
      profileA = await computeTasteProfile(currentUserId, supabase);
    }

    let { data: profileB } = await supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!profileB) {
      profileB = await computeTasteProfile(targetUserId, supabase);
    }

    // If either profile has no data, return 50% (neutral)
    if (profileA.song_count === 0 || profileB.song_count === 0) {
      return res.status(200).json({
        compatibility: {
          score: 50,
          genreOverlap: 50,
          moodProximity: 50,
        },
      });
    }

    // Calculate genre overlap (weighted Jaccard-like similarity)
    const genresA: Record<string, number> = profileA.genre_distribution || {};
    const genresB: Record<string, number> = profileB.genre_distribution || {};
    const allGenres = new Set([...Object.keys(genresA), ...Object.keys(genresB)]);

    let intersection = 0;
    let union = 0;
    for (const genre of allGenres) {
      const a = genresA[genre] || 0;
      const b = genresB[genre] || 0;
      intersection += Math.min(a, b);
      union += Math.max(a, b);
    }
    const genreOverlap = union > 0 ? (intersection / union) * 100 : 50;

    // Calculate mood proximity
    const va = profileA.avg_valence ?? 0;
    const aa = profileA.avg_arousal ?? 0;
    const vb = profileB.avg_valence ?? 0;
    const ab = profileB.avg_arousal ?? 0;

    const maxDistance = Math.sqrt(8); // Max distance in [-1,1] x [-1,1] space
    const distance = Math.sqrt(
      Math.pow(va - vb, 2) + Math.pow(aa - ab, 2)
    );
    const moodProximity = (1 - distance / maxDistance) * 100;

    // Combined score: 50% genre, 50% mood
    const score = Math.round(0.5 * genreOverlap + 0.5 * moodProximity);

    // Cache the result
    await supabase
      .from("compatibility_cache")
      .upsert({
        user_a_id: currentUserId,
        user_b_id: targetUserId,
        score,
        genre_overlap: Math.round(genreOverlap),
        mood_proximity: Math.round(moodProximity),
        computed_at: new Date().toISOString(),
      }, { onConflict: "user_a_id,user_b_id" });

    return res.status(200).json({
      compatibility: {
        score,
        genreOverlap: Math.round(genreOverlap),
        moodProximity: Math.round(moodProximity),
      },
    });
  } catch (error) {
    console.error("Error in getCompatibility:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Invalidate taste profile (called after post/reaction)
export async function invalidateTasteProfile(userId: string) {
  try {
    const supabase = await getDatabase();
    await supabase
      .from("taste_profiles")
      .delete()
      .eq("user_id", userId);
    await supabase
      .from("compatibility_cache")
      .delete()
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  } catch (error) {
    console.error("Error invalidating taste profile:", error);
  }
}
