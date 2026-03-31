import { Request, Response } from "express";
import { getDatabase } from "../db";
import { AuthRequest } from "../middleware/auth";
import { createOrGetSong } from "./songsController";
import { invalidateTasteProfile } from "./tasteController";

// Get user's song rankings
export const getUserSongRankings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const supabase = await getDatabase();

    const { data: rankings, error } = await supabase
      .from("song_rankings")
      .select(`
        id,
        score,
        created_at,
        updated_at,
        songs:song_id (
          song_id,
          spotify_id,
          song_name,
          artist_name,
          album_name,
          cover_art_url
        )
      `)
      .eq("user_id", userId)
      .order("score", { ascending: false });

    if (error) {
      throw error;
    }

    res.status(200).json({
      rankings: rankings || [],
    });
  } catch (error) {
    console.error("Error fetching user song rankings:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Create a new post
export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const { content, spotifyId, albumId, albumRankings, songRank, visibility = "public" } = req.body;
    const userId = req.userId; // Get user ID from authenticated request

    // Validate required fields
    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Must have either spotifyId (for single song) or albumId (for album ranking)
    // Must have either spotifyId (for single song) or albumId (for album ranking)
    if (!spotifyId && !albumId) {
      return res.status(400).json({
        message: "Either Spotify ID (for song) or Album ID (for album ranking) is required",
      });
    }

    // Validate content length
    if (content && content.length > 5000) {
      return res.status(400).json({
        message: "Post content exceeds maximum length of 5000 characters",
      });
    }

    const supabase = await getDatabase();

    // Verify user exists
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let topSongId: bigint | null = null;
    let postAlbumId: string | null = null;

    // Handle single song post
    if (spotifyId) {
      const song = await createOrGetSong(spotifyId, supabase);
      topSongId = song.song_id;
    }

    // Handle album ranking post
    if (albumId) {
      postAlbumId = albumId;
      
      // Validate album rankings
      if (!albumRankings || !Array.isArray(albumRankings) || albumRankings.length === 0) {
        return res.status(400).json({
          message: "Album rankings are required when posting an album",
        });
      }

      // Ensure we have a top song from the rankings (use rank 1)
      const topRankedSong = albumRankings.find((r: any) => r.rank === 1);
      if (topRankedSong) {
        const song = await createOrGetSong(topRankedSong.spotifyId, supabase);
        topSongId = song.song_id;
      }
    }

    // Create the post
    const { data: newPost, error } = await supabase
      .from("posts")
      .insert([
        {
          user_id: userId,
          content,
          top_song_id: topSongId,
          album_id: postAlbumId,
          visibility,
          like_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select(
        `
                post_id,
                user_id,
                content,
                top_song_id,
                album_id,
                like_count,
                visibility,
                created_at,
                updated_at,
                users:user_id (
                    id,
                    username,
                    display_name
                ),
                songs:top_song_id (
                    song_id,
                    spotify_id,
                    song_name,
                    artist_name,
                    album_name,
                    cover_art_url
                )
            `
      )
      .single();

    if (error) {
      console.error("Error creating post:", error);
      throw error;
    }

    // Create album rankings if provided
    if (albumRankings && albumRankings.length > 0 && newPost.post_id) {
      const rankingInserts = albumRankings.map((ranking: any) => ({
        post_id: newPost.post_id,
        spotify_id: ranking.spotifyId,
        rank: ranking.rank,
        created_at: new Date().toISOString(),
      }));

      const { error: rankingError } = await supabase
        .from("album_rankings")
        .insert(rankingInserts);

      if (rankingError) {
        console.error("Error creating album rankings:", rankingError);
        // Don't fail the post creation, but log the error
      }
    }

    // Handle song score if provided
    if (songRank && typeof songRank === 'number' && topSongId && newPost.post_id) {
      try {
        // Insert or update the song ranking with score
        const { error: rankingError } = await supabase
          .from("song_rankings")
          .upsert({
            user_id: userId,
            post_id: newPost.post_id,
            song_id: topSongId,
            score: songRank, // Using songRank variable to pass score value
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "user_id,song_id"
          });

        if (rankingError) {
          console.error("Error creating song ranking:", rankingError);
        }
      } catch (rankError) {
        console.error("Error handling song ranking:", rankError);
        // Don't fail the post creation, just log the error
      }
    }

    // Fetch the post with album rankings if it's an album post
    let postWithRankings: any = newPost;
    if (postAlbumId) {
      const { data: rankings } = await supabase
        .from("album_rankings")
        .select("*")
        .eq("post_id", newPost.post_id)
        .order("rank", { ascending: true });

      postWithRankings = {
        ...newPost,
        albumRankings: rankings || [],
      };
    }

    // Add song score if available
    if (songRank && topSongId) {
      postWithRankings = {
        ...postWithRankings,
        songScore: songRank,
      };
    }

    // Invalidate taste profile asynchronously
    invalidateTasteProfile(userId).catch(() => {});

    res.status(201).json({
      message: "Post created successfully",
      post: postWithRankings,
    });
  } catch (error) {
    console.error("Error in createPost:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Helper: batch-fetch album rankings and song scores for a list of posts
async function enrichPostsWithRankings(posts: any[], supabase: any) {
  if (!posts || posts.length === 0) return [];

  // Batch fetch album rankings for all album posts
  const albumPostIds = posts
    .filter((p: any) => p.album_id)
    .map((p: any) => p.post_id);

  const albumRankingsMap: Record<number, any[]> = {};
  if (albumPostIds.length > 0) {
    const { data: allAlbumRankings } = await supabase
      .from("album_rankings")
      .select("*")
      .in("post_id", albumPostIds)
      .order("rank", { ascending: true });

    for (const ranking of allAlbumRankings || []) {
      if (!albumRankingsMap[ranking.post_id]) {
        albumRankingsMap[ranking.post_id] = [];
      }
      albumRankingsMap[ranking.post_id].push(ranking);
    }
  }

  // Batch fetch song scores for all song posts
  const songPosts = posts.filter((p: any) => p.top_song_id);
  const songScoreMap: Record<string, number | null> = {};
  if (songPosts.length > 0) {
    const orFilter = songPosts
      .map((p: any) => `and(user_id.eq.${p.user_id},song_id.eq.${p.top_song_id})`)
      .join(",");
    const { data: allSongRankings } = await supabase
      .from("song_rankings")
      .select("user_id, song_id, score")
      .or(orFilter);

    for (const ranking of allSongRankings || []) {
      songScoreMap[`${ranking.user_id}_${ranking.song_id}`] = ranking.score;
    }
  }

  // Merge results
  return posts.map((post: any) => ({
    ...post,
    albumRankings: albumRankingsMap[post.post_id] || [],
    songScore: post.top_song_id
      ? songScoreMap[`${post.user_id}_${post.top_song_id}`] ?? null
      : null,
  }));
}

// Get posts for a specific user
export const getPostsByUserId = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const requesterId = req.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const supabase = await getDatabase();

    // Verify user exists
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get posts for the user with related data
    const {
      data: posts,
      error,
      count,
    } = await supabase
      .from("posts")
      .select(
        `
                post_id,
                user_id,
                content,
                top_song_id,
                album_id,
                like_count,
                visibility,
                created_at,
                updated_at,
                users:user_id (
                    id,
                    username,
                    display_name
                ),
                songs:top_song_id (
                    song_id,
                    spotify_id,
                    song_name,
                    artist_name,
                    album_name,
                    cover_art_url
                )
            `,
        { count: "exact" }
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      console.error("Error fetching posts:", error);
      throw error;
    }

    // Filter posts by visibility
    let filteredPosts = posts || [];
    if (requesterId !== userId) {
      // Check if requester is a friend
      let isFriend = false;
      if (requesterId) {
        const { data: friendship } = await supabase
          .from("friends")
          .select("status")
          .eq("user_one_id", requesterId)
          .eq("user_two_id", userId)
          .eq("status", "accepted")
          .maybeSingle();
        isFriend = !!friendship;
      }
      filteredPosts = filteredPosts.filter((post: any) => {
        if (post.visibility === "public") return true;
        if (post.visibility === "friends_only" && isFriend) return true;
        return false; // hide private posts
      });
    }

    // Batch fetch album rankings and song scores (fixes N+1 query)
    const postsWithRankings = await enrichPostsWithRankings(filteredPosts, supabase);

    res.status(200).json({
      message: "Posts retrieved successfully",
      posts: postsWithRankings,
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: (count || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    console.error("Error in getPostsByUserId:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all posts (for feed functionality)
export const getAllPosts = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 20, offset = 0, following = "false" } = req.query;
    const userId = req.userId; // Optional user ID for like status

    const supabase = await getDatabase();

    // Get the list of users the current user follows (needed for visibility + following filter)
    let followingUserIds: string[] = [];
    if (userId) {
      const { data: friendships } = await supabase
        .from("friends")
        .select("user_two_id")
        .eq("user_one_id", userId)
        .eq("status", "accepted");

      followingUserIds = friendships?.map((f) => f.user_two_id) || [];
    }

    // If filtering by following and user follows no one, return empty
    if (following === "true" && followingUserIds.length === 0) {
      return res.status(200).json({
        message: "Posts retrieved successfully",
        posts: [],
        pagination: {
          total: 0,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: false,
        },
      });
    }

    // Build query with visibility enforcement
    let query = supabase
      .from("posts")
      .select(
        `
                post_id,
                user_id,
                content,
                top_song_id,
                album_id,
                like_count,
                visibility,
                created_at,
                updated_at,
                users:user_id (
                    id,
                    username,
                    display_name
                ),
                songs:top_song_id (
                    song_id,
                    spotify_id,
                    song_name,
                    artist_name,
                    album_name,
                    cover_art_url
                ),
                likes!left (
                    user_id
                ),
                reactions!left (
                    user_id,
                    reaction_type
                ),
                reaction_summary
            `,
        { count: "exact" }
      );

    // Enforce visibility: show public posts + friends_only from followed users + own posts
    if (userId) {
      const visibleUserIds = [...followingUserIds, userId];
      query = query.or(
        `visibility.eq.public,and(visibility.eq.friends_only,user_id.in.(${visibleUserIds.join(",")})),user_id.eq.${userId}`
      );
    } else {
      // Unauthenticated: only public posts
      query = query.eq("visibility", "public");
    }

    // Filter by following users if requested
    if (following === "true" && followingUserIds.length > 0) {
      query = query.in("user_id", followingUserIds);
    }

    const {
      data: posts,
      error,
      count,
    } = await query
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      console.error("Error fetching all posts:", error);
      throw error;
    }

    // Batch fetch album rankings and song scores (fixes N+1 query)
    const postsWithRankings = await enrichPostsWithRankings(posts || [], supabase);

    // Process posts to add reaction/like data for the current user
    const processedPosts =
      postsWithRankings?.map((post) => {
        const userReaction = userId
          ? post.reactions?.find((r: any) => r.user_id === userId)?.reaction_type ?? null
          : null;
        return {
          ...post,
          isLiked: userId
            ? post.likes?.some((like: any) => like.user_id === userId)
            : false,
          userReaction,
          reaction_summary: post.reaction_summary || {},
        };
      }) || [];

    res.status(200).json({
      message: "Posts retrieved successfully",
      posts: processedPosts,
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: (count || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    console.error("Error in getAllPosts:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const VALID_REACTION_TYPES = ["fire", "crying", "mind_blown", "dance", "chill", "love"] as const;

// Helper: recompute reaction_summary for a post from the reactions table
async function recomputeReactionSummary(postId: number, supabase: any) {
  const { data: reactions } = await supabase
    .from("reactions")
    .select("reaction_type")
    .eq("post_id", postId);

  const summary: Record<string, number> = {};
  let totalCount = 0;
  for (const r of reactions || []) {
    summary[r.reaction_type] = (summary[r.reaction_type] || 0) + 1;
    totalCount++;
  }

  await supabase
    .from("posts")
    .update({
      reaction_summary: summary,
      like_count: totalCount,
      updated_at: new Date().toISOString(),
    })
    .eq("post_id", postId);

  return { summary, totalCount };
}

// React to a post (toggle reaction)
export const toggleReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { postId } = req.params;
    const { reactionType = "love" } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!postId) {
      return res.status(400).json({ message: "Post ID is required" });
    }

    if (!VALID_REACTION_TYPES.includes(reactionType)) {
      return res.status(400).json({
        message: `Invalid reaction type. Must be one of: ${VALID_REACTION_TYPES.join(", ")}`,
      });
    }

    const supabase = await getDatabase();

    // Check if post exists
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("post_id")
      .eq("post_id", postId)
      .single();

    if (postError || !post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check for existing reaction
    const { data: existingReaction, error: checkError } = await supabase
      .from("reactions")
      .select("id, reaction_type")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing reaction:", checkError);
      throw checkError;
    }

    let action = "";
    let newReactionType: string | null = null;

    if (existingReaction) {
      if (existingReaction.reaction_type === reactionType) {
        // Same reaction — remove it (toggle off)
        const { error: deleteError } = await supabase
          .from("reactions")
          .delete()
          .eq("id", existingReaction.id);

        if (deleteError) throw deleteError;
        action = "removed";
        newReactionType = null;
      } else {
        // Different reaction — update it
        const { error: updateError } = await supabase
          .from("reactions")
          .update({ reaction_type: reactionType })
          .eq("id", existingReaction.id);

        if (updateError) throw updateError;
        action = "updated";
        newReactionType = reactionType;
      }
    } else {
      // No existing reaction — create one
      const { error: insertError } = await supabase
        .from("reactions")
        .insert([{
          user_id: userId,
          post_id: parseInt(postId),
          reaction_type: reactionType,
          created_at: new Date().toISOString(),
        }]);

      if (insertError) throw insertError;
      action = "added";
      newReactionType = reactionType;
    }

    // Recompute reaction summary and invalidate taste profile
    const { summary, totalCount } = await recomputeReactionSummary(parseInt(postId), supabase);
    invalidateTasteProfile(userId).catch(() => {});

    // Also maintain backward compatibility with likes table
    if (action === "added") {
      // Insert into likes if not exists (for backward compat)
      await supabase.from("likes").upsert([{
        user_id: userId,
        post_id: parseInt(postId),
        created_at: new Date().toISOString(),
      }], { onConflict: "user_id,post_id" }).select();
    } else if (action === "removed") {
      await supabase.from("likes").delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
    }

    res.status(200).json({
      message: `Reaction ${action} successfully`,
      action,
      reactionType: newReactionType,
      reactionSummary: summary,
      likeCount: totalCount,
      isLiked: newReactionType !== null,
    });
  } catch (error) {
    console.error("Error in toggleReaction:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Legacy like endpoint — maps to 'love' reaction
export const toggleLike = async (req: AuthRequest, res: Response) => {
  req.body.reactionType = "love";
  return toggleReaction(req, res);
};

// Create a new comment on a post
export const createComment = async (req: AuthRequest, res: Response) => {
  try {
    const { postId } = req.params;
    const { body } = req.body;
    const userId = req.userId; // Get user ID from authenticated request

    // Validate required fields
    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!body || body.trim() === "") {
      return res.status(400).json({
        message: "Comment body is required",
      });
    }

    if (body.length > 2000) {
      return res.status(400).json({
        message: "Comment body exceeds maximum length of 2000 characters",
      });
    }

    if (!postId) {
      return res.status(400).json({
        message: "Post ID is required",
      });
    }

    const supabase = await getDatabase();

    // Verify user exists
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify post exists
    const { data: post } = await supabase
      .from("posts")
      .select("post_id")
      .eq("post_id", postId)
      .single();

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Create the comment
    const { data: newComment, error } = await supabase
      .from("comments")
      .insert([
        {
          post_id: parseInt(postId),
          body: body.trim(),
          user_id: userId,
        },
      ])
      .select(
        `
                id,
                created_at,
                post_id,
                body,
                user_id,
                users (
                    id,
                    display_name,
                    username
                )
            `
      )
      .single();

    if (error) {
      console.error("Error creating comment:", error);
      return res.status(500).json({
        message: "Failed to create comment",
        error: error.message,
      });
    }

    return res.status(201).json({
      message: "Comment created successfully",
      comment: newComment,
    });
  } catch (error) {
    console.error("Error in createComment:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all comments for a specific post
export const getCommentsByPostId = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({
        message: "Post ID is required",
      });
    }

    const supabase = await getDatabase();

    // Verify post exists
    const { data: post } = await supabase
      .from("posts")
      .select("post_id")
      .eq("post_id", postId)
      .single();

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Get all comments for the post
    const { data: comments, error } = await supabase
      .from("comments")
      .select(
        `
                id,
                created_at,
                post_id,
                body,
                user_id,
                users (
                    id,
                    display_name,
                    username
                )
            `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching comments:", error);
      return res.status(500).json({
        message: "Failed to fetch comments",
        error: error.message,
      });
    }

    return res.status(200).json({
      message: "Comments retrieved successfully",
      comments: comments || [],
    });
  } catch (error) {
    console.error("Error in getCommentsByPostId:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
