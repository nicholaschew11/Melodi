import { Fragment, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlbumRankingModal } from "@/components/feed/AlbumRankingModal";
import {
  AlbumSearchModal,
  SpotifyAlbumSearchResult,
} from "@/components/feed/AlbumSearchModal";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { FeedState } from "@/components/feed/FeedState";
import { PostCard } from "@/components/feed/PostCard";
import { SongRankingModal } from "@/components/feed/SongRankingModal";
import { SongSearchModal } from "@/components/feed/SongSearchModal";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { API } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useSpotifyAPI } from "@/lib/spotify";
import { getSupabase } from "@/lib/supabase";
import { feedStyles } from "@/styles/feedStyles";
import {
  Comment,
  FeedPost,
  RankedSong,
  SelectedAlbum,
  SelectedSong,
  SpotifyAlbum,
  SpotifyTrack,
} from "@/types/feed";

export default function FeedScreen() {
  const [feedData, setFeedData] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postContent, setPostContent] = useState("");
  const [selectedSong, setSelectedSong] = useState<SelectedSong | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<SelectedAlbum | null>(
    null
  );
  const [isPosting, setIsPosting] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAlbumSearchModal, setShowAlbumSearchModal] = useState(false);
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [albumSearchResults, setAlbumSearchResults] = useState<
    SpotifyAlbumSearchResult[]
  >([]);
  const [isAlbumSearching, setIsAlbumSearching] = useState(false);
  const [showAlbumRankingModal, setShowAlbumRankingModal] = useState(false);
  const [selectedAlbumForRanking, setSelectedAlbumForRanking] =
    useState<SpotifyAlbum | null>(null);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);
  const [showFollowingOnly, setShowFollowingOnly] = useState(false);
  const [postGenres, setPostGenres] = useState<Map<number, string[]>>(
    new Map()
  );
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [showSongRankingModal, setShowSongRankingModal] = useState(false);
  const [songScore, setSongScore] = useState<number | null>(null);
  const mutedColor = useThemeColor({}, "textMuted");
  const primaryColor = useThemeColor({}, "primary");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "border");
  const accentColor = useThemeColor({}, "accent");
  const { user, token } = useAuth();
  const surfaceColor = useThemeColor({}, "surface");
  const spotifyAPI = useSpotifyAPI();
  const insets = useSafeAreaInsets();

  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);

      const headers: Record<string, string> = {
        "ngrok-skip-browser-warning": "true",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      console.log(API.BACKEND_URL);
      const url = new URL(`${API.BACKEND_URL}/api/posts`);
      if (showFollowingOnly && token) {
        url.searchParams.append("following", "true");
      }

      const response = await fetch(url.toString(), {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const posts = data.posts || [];

      // Fetch comments for each post
      const postsWithComments = await Promise.all(
        posts.map(async (post: FeedPost) => {
          try {
            const commentsResponse = await fetch(
              `${API.BACKEND_URL}/api/posts/${post.post_id}/comments`,
              { headers }
            );

            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              return { ...post, comments: commentsData.comments || [] };
            }
            return { ...post, comments: [] };
          } catch (err) {
            console.error(
              `Error fetching comments for post ${post.post_id}:`,
              err
            );
            return { ...post, comments: [] };
          }
        })
      );

      setFeedData(postsWithComments);

      // Fetch genres for posts with songs
      fetchGenresForPosts(postsWithComments);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch posts");
    } finally {
      setLoading(false);
    }
  };

  const fetchGenresForPosts = async (posts: FeedPost[]) => {
    try {
      const genresMap = new Map<number, string[]>();
      const allGenres = new Set<string>();

      // Fetch genres for each post with a song
      await Promise.all(
        posts.map(async (post) => {
          if (post.songs?.spotify_id) {
            try {
              // Get track details to get artist IDs
              const track = await spotifyAPI.getTrack(post.songs.spotify_id);

              if (track.artists && track.artists.length > 0) {
                // Get artist details for genres
                const artistIds = track.artists.map((a: any) => a.id);
                const artistsData = await spotifyAPI.getArtists(artistIds);

                // Collect all genres from all artists
                const genres: string[] = [];
                artistsData.artists?.forEach((artist: any) => {
                  if (artist.genres && artist.genres.length > 0) {
                    genres.push(...artist.genres);
                  }
                });

                if (genres.length > 0) {
                  genresMap.set(post.post_id, genres);
                  genres.forEach((g) => allGenres.add(g));
                }
              }
            } catch (error) {
              console.error(
                `Error fetching genres for post ${post.post_id}:`,
                error
              );
            }
          }
        })
      );

      setPostGenres(genresMap);

      // Sort genres by frequency and take top 10
      const genreFrequency = new Map<string, number>();
      genresMap.forEach((genres) => {
        genres.forEach((genre) => {
          genreFrequency.set(genre, (genreFrequency.get(genre) || 0) + 1);
        });
      });

      const sortedGenres = Array.from(genreFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre]) => genre);

      setAvailableGenres(sortedGenres);
    } catch (error) {
      console.error("Error fetching genres:", error);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [showFollowingOnly]);

  const handleLike = (
    postId: number,
    newLikeCount: number,
    isLiked: boolean
  ) => {
    setFeedData((prevData) =>
      prevData.map((post) =>
        post.post_id === postId
          ? { ...post, like_count: newLikeCount, isLiked: isLiked }
          : post
      )
    );
  };

  const handleReact = (
    postId: number,
    likeCount: number,
    reactionType: string | null,
    reactionSummary: Record<string, number>
  ) => {
    setFeedData((prevData) =>
      prevData.map((post) =>
        post.post_id === postId
          ? {
              ...post,
              like_count: likeCount,
              isLiked: reactionType !== null,
              userReaction: reactionType as any,
              reaction_summary: reactionSummary,
            }
          : post
      )
    );
  };

  const handleComment = (postId: number) => {
    // Navigate to comments or show comment modal
    console.log("Navigate to comments for post:", postId);
  };

  const handleCommentAdded = (postId: number, comment: Comment) => {
    setFeedData((prevData) =>
      prevData.map((post) =>
        post.post_id === postId
          ? {
              ...post,
              comments: [...(post.comments || []), comment],
            }
          : post
      )
    );
  };

  const submitPost = async (scoreToUse: number | null = null) => {
    if (!user || !token) {
      console.error("Cannot post - user or token missing:", { user: !!user, token: !!token });
      Alert.alert("Error", "You must be logged in to create a post");
      return;
    }

    try {
      setIsPosting(true);

      // Refresh the session to ensure we have a valid token
      const supabase = getSupabase();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("Session refresh failed:", sessionError);
        Alert.alert("Error", "Your session has expired. Please log in again.");
        setIsPosting(false);
        return;
      }

      const freshToken = session.access_token;
      console.log("Using refreshed token for post");

      const requestBody: any = {
        content: postContent.trim() || "",
        visibility: "public",
      };

      if (selectedSong) {
        requestBody.spotifyId = selectedSong.spotifyId;
        // Add song score if provided
        const finalScore = scoreToUse !== null ? scoreToUse : songScore;
        if (finalScore) {
          requestBody.songRank = finalScore;
        }
      } else if (selectedAlbum) {
        // Get the top-ranked song (rank 1) for the main song display
        const topRankedSong = selectedAlbum.rankedSongs
          .filter((song) => song.rank > 0)
          .sort((a, b) => a.rank - b.rank)[0];

        if (!topRankedSong) {
          Alert.alert("Error", "Please rank at least one song from the album");
          setIsPosting(false);
          return;
        }

        // Send top-ranked song's spotifyId for main song display
        requestBody.spotifyId = topRankedSong.spotifyId;
        // Send album ID and full rankings for storage
        requestBody.albumId = selectedAlbum.spotifyId;
        requestBody.albumRankings = selectedAlbum.rankedSongs
          .filter((song) => song.rank > 0)
          .sort((a, b) => a.rank - b.rank)
          .map((song) => ({
            spotifyId: song.spotifyId,
            rank: song.rank,
          }));
      }

      console.log("Creating post with body:", requestBody);
      console.log("Fresh token starts with:", freshToken?.substring(0, 20) + "...");

      const response = await fetch(`${API.BACKEND_URL}/api/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Post creation error:", { status: response.status, errorData });
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to create post`
        );
      }

      const result = await response.json();

      // Clear form
      setPostContent("");
      setSelectedSong(null);
      setSelectedAlbum(null);
      setSongScore(null);

      // Refresh feed
      await fetchPosts();

      Alert.alert("Success", "Post created successfully!");
    } catch (err) {
      console.error("Error creating post:", err);
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to create post"
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleCreatePost = async () => {
    if (!user) {
      Alert.alert("Error", "You must be logged in to create a post");
      return;
    }

    if (!selectedSong && !selectedAlbum) {
      Alert.alert("Error", "Please select a song or album for your post");
      return;
    }

    // If posting a song and haven't ranked it yet, show ranking modal first
    if (selectedSong && songScore === null) {
      setShowSongRankingModal(true);
      return;
    }

    // Otherwise proceed with posting
    await submitPost();
  };

  const handleSelectSong = () => {
    setShowSearchModal(true);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await spotifyAPI.search(query, "track", 20);
      setSearchResults(response.tracks.items);
    } catch (error) {
      console.error("Error searching tracks:", error);
      Alert.alert("Error", "Failed to search for tracks. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSongSelect = (track: SpotifyTrack) => {
    const song = {
      spotifyId: track.id,
      name: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      coverArtUrl: track.album.images[0]?.url || null,
    };
    setSelectedSong(song);
    setShowSearchModal(false);
    setSearchQuery("");
    setSearchResults([]);
    // Don't show ranking modal here - will show after clicking post button
  };

  const handleRankingComplete = async (score: number | null) => {
    setSongScore(score);
    setShowSongRankingModal(false);

    // After ranking is complete, proceed with post creation
    // Pass the score directly to avoid state timing issues
    // If score is null (skipped), still create the post but without a ranking
    await submitPost(score);
  };

  const handleCloseSearchModal = () => {
    setShowSearchModal(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSelectAlbum = () => {
    setShowAlbumSearchModal(true);
  };

  const handleAlbumSearch = async (query: string) => {
    if (!query.trim()) {
      setAlbumSearchResults([]);
      return;
    }

    try {
      setIsAlbumSearching(true);
      const response = await spotifyAPI.search(query, "album", 20);
      setAlbumSearchResults(response.albums.items);
    } catch (error) {
      console.error("Error searching albums:", error);
      Alert.alert("Error", "Failed to search for albums. Please try again.");
    } finally {
      setIsAlbumSearching(false);
    }
  };

  const handleAlbumSelect = async (album: SpotifyAlbumSearchResult) => {
    try {
      setIsLoadingAlbum(true);
      setShowAlbumSearchModal(false);

      // Fetch full album details including tracks
      const albumData = await spotifyAPI.getAlbum(album.id);
      setSelectedAlbumForRanking(albumData);
      setShowAlbumRankingModal(true);
    } catch (error) {
      console.error("Error fetching album:", error);
      Alert.alert("Error", "Failed to load album. Please try again.");
    } finally {
      setIsLoadingAlbum(false);
    }
  };

  const handleAlbumRankingConfirm = (rankedSongs: RankedSong[]) => {
    if (!selectedAlbumForRanking) return;

    setSelectedAlbum({
      spotifyId: selectedAlbumForRanking.id,
      name: selectedAlbumForRanking.name,
      artist: selectedAlbumForRanking.artists.map((a) => a.name).join(", "),
      coverArtUrl: selectedAlbumForRanking.images[0]?.url || "",
      rankedSongs,
    });

    setShowAlbumRankingModal(false);
    setSelectedAlbumForRanking(null);
  };

  const handleCloseAlbumSearchModal = () => {
    setShowAlbumSearchModal(false);
    setAlbumSearchQuery("");
    setAlbumSearchResults([]);
  };

  const handleCloseAlbumRankingModal = () => {
    setShowAlbumRankingModal(false);
    setSelectedAlbumForRanking(null);
  };

  return (
    <ThemedView style={feedStyles.container}>
      <ScrollView
        style={feedStyles.scrollView}
        contentContainerStyle={feedStyles.contentContainer}
      >
        {/* Header */}
        <View style={[feedStyles.header, { paddingTop: insets.top + 30 }]}>
          <ThemedText style={feedStyles.headerTitle}>
            Good{" "}
            {new Date().getHours() < 12
              ? "morning"
              : new Date().getHours() < 18
              ? "afternoon"
              : "evening"}
            , {user?.user_metadata?.username}!
          </ThemedText>
        </View>

        {/* Create Post Section */}
        <View style={feedStyles.feedContainer}>
          <CreatePostForm
            postContent={postContent}
            setPostContent={setPostContent}
            selectedSong={selectedSong}
            selectedAlbum={selectedAlbum}
            onSelectSong={handleSelectSong}
            onSelectAlbum={handleSelectAlbum}
            onRemoveSong={() => setSelectedSong(null)}
            onRemoveAlbum={() => setSelectedAlbum(null)}
            onCreatePost={handleCreatePost}
            isPosting={isPosting}
            mutedColor={mutedColor}
            primaryColor={primaryColor}
            surfaceColor={surfaceColor}
            textColor={textColor}
            borderColor={borderColor}
            accentColor={accentColor}
          />
        </View>
        {/* Feed Filter Toggle */}
        {user && token && (
          <View style={[feedStyles.feedContainer, { paddingVertical: 12 }]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: surfaceColor,
                borderRadius: 15,
              }}
            >
              <ThemedText style={{ fontSize: 16, color: textColor }}>
                From my Followings
              </ThemedText>
              <Switch
                value={showFollowingOnly}
                onValueChange={setShowFollowingOnly}
                trackColor={{
                  false: mutedColor + "40",
                  true: primaryColor + "80",
                }}
                thumbColor={showFollowingOnly ? primaryColor : "#f4f3f4"}
              />
            </View>
          </View>
        )}

        {/* Genre Filter Pills */}
        {availableGenres.length > 0 && (
          <View style={[feedStyles.feedContainer, { paddingVertical: 8 }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor:
                    selectedGenre === null ? primaryColor : surfaceColor,
                  borderWidth: 1,
                  borderColor:
                    selectedGenre === null ? primaryColor : borderColor,
                }}
                onPress={() => setSelectedGenre(null)}
                activeOpacity={0.7}
              >
                <ThemedText
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: selectedGenre === null ? "#fff" : textColor,
                  }}
                >
                  All
                </ThemedText>
              </TouchableOpacity>
              {availableGenres.map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor:
                      selectedGenre === genre ? primaryColor : surfaceColor,
                    borderWidth: 1,
                    borderColor:
                      selectedGenre === genre ? primaryColor : borderColor,
                  }}
                  onPress={() => setSelectedGenre(genre)}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: selectedGenre === genre ? "#fff" : textColor,
                      textTransform: "capitalize",
                    }}
                  >
                    {genre}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={feedStyles.feedContainer}>
          <FeedState
            loading={loading}
            error={error}
            feedDataLength={feedData.length}
            onRetry={fetchPosts}
            primaryColor={primaryColor}
            mutedColor={mutedColor}
          />

          {!loading && !error && feedData.length > 0 && (
            <>
              {feedData
                .filter((post) => {
                  // If no genre is selected, show all posts
                  if (!selectedGenre) return true;

                  // Filter by selected genre
                  const genres = postGenres.get(post.post_id);
                  return genres?.includes(selectedGenre) || false;
                })
                .map((post, index, filteredArray) => (
                  <Fragment key={post.post_id}>
                    <PostCard
                      post={post}
                      onLike={handleLike}
                      onReact={handleReact}
                      onComment={handleComment}
                      onCommentAdded={handleCommentAdded}
                      surfaceColor={surfaceColor}
                      mutedColor={mutedColor}
                      primaryColor={primaryColor}
                      textColor={textColor}
                      borderColor={borderColor}
                      authToken={token || undefined}
                    />

                    {index < filteredArray.length - 1 && (
                      <View
                        style={{
                          height: 2,
                          width: "95%",
                          backgroundColor: mutedColor + "20", // subtle opacity
                          marginVertical: 10,
                          borderRadius: 4,
                          alignSelf: "center",
                        }}
                      />
                    )}
                  </Fragment>
                ))}
            </>
          )}

          {/* Show empty state when genre filter has no results */}
          {!loading &&
            !error &&
            feedData.length > 0 &&
            selectedGenre &&
            feedData.filter((post) =>
              postGenres.get(post.post_id)?.includes(selectedGenre)
            ).length === 0 && (
              <View style={feedStyles.emptyState}>
                <ThemedText
                  style={[feedStyles.emptyStateTitle, { color: textColor }]}
                >
                  No posts found
                </ThemedText>
                <ThemedText
                  style={[feedStyles.emptyStateText, { color: mutedColor }]}
                >
                  No posts match the selected genre. Try selecting a different
                  genre.
                </ThemedText>
              </View>
            )}
        </View>
      </ScrollView>

      {/* Song Search Modal */}
      <SongSearchModal
        visible={showSearchModal}
        searchQuery={searchQuery}
        setSearchQuery={(text) => {
          setSearchQuery(text);
          handleSearch(text);
        }}
        searchResults={searchResults}
        isSearching={isSearching}
        onSongSelect={handleSongSelect}
        onClose={handleCloseSearchModal}
        mutedColor={mutedColor}
        primaryColor={primaryColor}
        insets={insets}
      />

      {/* Song Ranking Modal */}
      <SongRankingModal
        visible={showSongRankingModal}
        onClose={() => setShowSongRankingModal(false)}
        onRankingComplete={handleRankingComplete}
        selectedSong={selectedSong}
        mutedColor={mutedColor}
        primaryColor={primaryColor}
        textColor={textColor}
        surfaceColor={surfaceColor}
        borderColor={borderColor}
      />

      {/* Album Search Modal */}
      <AlbumSearchModal
        visible={showAlbumSearchModal}
        searchQuery={albumSearchQuery}
        setSearchQuery={(text) => {
          setAlbumSearchQuery(text);
          handleAlbumSearch(text);
        }}
        searchResults={albumSearchResults}
        isSearching={isAlbumSearching}
        onAlbumSelect={handleAlbumSelect}
        onClose={handleCloseAlbumSearchModal}
        mutedColor={mutedColor}
        primaryColor={primaryColor}
        insets={insets}
      />

      {/* Album Ranking Modal */}
      <AlbumRankingModal
        visible={showAlbumRankingModal}
        album={selectedAlbumForRanking}
        isLoading={isLoadingAlbum}
        onConfirm={handleAlbumRankingConfirm}
        onClose={handleCloseAlbumRankingModal}
        mutedColor={mutedColor}
        primaryColor={primaryColor}
        textColor={textColor}
        surfaceColor={surfaceColor}
        borderColor={borderColor}
        insets={insets}
      />
    </ThemedView>
  );
}
