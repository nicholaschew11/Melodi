import { Response } from "express";
import { getDatabase } from "../db";
import { AuthRequest } from "../middleware/auth";

// GET /api/discovery/feed — Get discovery feed from friends-of-friends
export const getDiscoveryFeed = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const supabase = await getDatabase();

    // 1. Get user's 1st-degree connections (people they follow)
    const { data: firstDegree } = await supabase
      .from("friends")
      .select("user_two_id")
      .eq("user_one_id", userId)
      .eq("status", "accepted");

    const friendIds = (firstDegree || []).map((f) => f.user_two_id);

    if (friendIds.length === 0) {
      return res.status(200).json({
        message: "Follow more people to discover music",
        posts: [],
        pagination: { total: 0, limit: Number(limit), offset: Number(offset), hasMore: false },
      });
    }

    // 2. Get 2nd-degree connections (people your friends follow)
    const { data: secondDegree } = await supabase
      .from("friends")
      .select("user_one_id, user_two_id")
      .in("user_one_id", friendIds)
      .eq("status", "accepted");

    // Filter to only 2nd degree (not self, not already friends)
    const friendIdSet = new Set(friendIds);
    const secondDegreeMap = new Map<string, string[]>(); // fof_id -> [connecting_friend_ids]

    for (const f of secondDegree || []) {
      const fofId = f.user_two_id;
      if (fofId === userId || friendIdSet.has(fofId)) continue;

      if (!secondDegreeMap.has(fofId)) {
        secondDegreeMap.set(fofId, []);
      }
      secondDegreeMap.get(fofId)!.push(f.user_one_id);
    }

    const fofIds = Array.from(secondDegreeMap.keys());

    if (fofIds.length === 0) {
      return res.status(200).json({
        message: "Your friends need to follow more people for discoveries",
        posts: [],
        pagination: { total: 0, limit: Number(limit), offset: Number(offset), hasMore: false },
      });
    }

    // 3. Get posts already seen (dismissed/saved) by user
    const { data: seenActions } = await supabase
      .from("discovery_actions")
      .select("post_id")
      .eq("user_id", userId);

    const seenPostIds = (seenActions || []).map((a) => a.post_id);

    // 4. Get recent public posts from 2nd-degree users
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
        reaction_summary,
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
      .in("user_id", fofIds)
      .eq("visibility", "public")
      .order("created_at", { ascending: false });

    // Exclude already-seen posts
    if (seenPostIds.length > 0) {
      query = query.not("post_id", "in", `(${seenPostIds.join(",")})`);
    }

    const { data: posts, error, count } = await query
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      console.error("Error fetching discovery feed:", error);
      throw error;
    }

    // 5. Add attribution (which friend connects to this poster)
    const postsWithAttribution = (posts || []).map((post: any) => {
      const connectingFriendIds = secondDegreeMap.get(post.user_id) || [];
      return {
        ...post,
        connectedVia: connectingFriendIds[0] || null, // We'll resolve the username on the client
        connectedViaIds: connectingFriendIds,
      };
    });

    // 6. Resolve connecting friend usernames
    const allConnectingIds = new Set<string>();
    for (const post of postsWithAttribution) {
      for (const id of post.connectedViaIds) {
        allConnectingIds.add(id);
      }
    }

    let friendUsernameMap: Record<string, string> = {};
    if (allConnectingIds.size > 0) {
      const { data: friendUsers } = await supabase
        .from("users")
        .select("id, username")
        .in("id", Array.from(allConnectingIds));

      for (const u of friendUsers || []) {
        friendUsernameMap[u.id] = u.username;
      }
    }

    const finalPosts = postsWithAttribution.map((post: any) => ({
      ...post,
      connectedVia: post.connectedVia
        ? {
            id: post.connectedVia,
            username: friendUsernameMap[post.connectedVia] || "a friend",
          }
        : null,
      connectedViaIds: undefined, // clean up
    }));

    res.status(200).json({
      message: "Discovery feed retrieved",
      posts: finalPosts,
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: (count || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    console.error("Error in getDiscoveryFeed:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// POST /api/discovery/action — Save or dismiss a discovery
export const discoveryAction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { postId, action, discoveredViaUserId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!postId || !action) {
      return res.status(400).json({ message: "postId and action are required" });
    }

    if (!["save", "dismiss"].includes(action)) {
      return res.status(400).json({ message: "action must be 'save' or 'dismiss'" });
    }

    const supabase = await getDatabase();

    // Upsert the action
    const { error } = await supabase
      .from("discovery_actions")
      .upsert(
        {
          user_id: userId,
          post_id: postId,
          action,
          discovered_via_user_id: discoveredViaUserId || null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,post_id" }
      );

    if (error) {
      console.error("Error saving discovery action:", error);
      throw error;
    }

    // If saving, also create a 'love' reaction on the post
    if (action === "save") {
      await supabase
        .from("reactions")
        .upsert(
          {
            user_id: userId,
            post_id: postId,
            reaction_type: "love",
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id,post_id" }
        );
    }

    res.status(200).json({
      message: `Discovery ${action}d successfully`,
      action,
    });
  } catch (error) {
    console.error("Error in discoveryAction:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// GET /api/discovery/saved — Get saved discoveries
export const getSavedDiscoveries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const supabase = await getDatabase();

    const { data: saved, error } = await supabase
      .from("discovery_actions")
      .select(
        `
        post_id,
        created_at,
        discovered_via_user_id
      `
      )
      .eq("user_id", userId)
      .eq("action", "save")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching saved discoveries:", error);
      throw error;
    }

    // Fetch the actual posts
    const postIds = (saved || []).map((s) => s.post_id);
    let posts: any[] = [];
    if (postIds.length > 0) {
      const { data: postData } = await supabase
        .from("posts")
        .select(
          `
          post_id,
          user_id,
          content,
          top_song_id,
          album_id,
          like_count,
          created_at,
          users:user_id (id, username, display_name),
          songs:top_song_id (song_id, spotify_id, song_name, artist_name, album_name, cover_art_url)
        `
        )
        .in("post_id", postIds);
      posts = postData || [];
    }

    res.status(200).json({
      message: "Saved discoveries retrieved",
      posts,
    });
  } catch (error) {
    console.error("Error in getSavedDiscoveries:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
