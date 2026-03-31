import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/feed/PostCard';
import { MoodAura } from '@/components/profile/MoodAura';
import { TasteDNA } from '@/components/profile/TasteDNA';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { API } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FeedPost } from '@/types/feed';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = '0f5c814e10af4468988d67d8fc1c99c7';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET ?? '';
const REDIRECT_URI = 'melodi://spotify-auth-callback';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

interface ProfileStats {
  totalPosts: number;
  totalFollowers: number;
  totalFollowing: number;
}

interface TopTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
  previewUrl?: string;
}

interface TopArtist {
  id: string;
  name: string;
  image: string;
  genres: string[];
}

interface ListeningStats {
  totalMinutes: number;
  topGenre: string;
  danceability: number;
  energy: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    images: { url: string }[];
  };
  duration_ms?: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
}

interface SongAnalysis {
  id: string;
  danceability?: number;
  energy?: number;
  valence?: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, token } = useAuth();
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textMuted');
  const textColor = useThemeColor({}, 'text');
  const surfaceColor = useThemeColor({}, 'surface');
  const surfaceElevatedColor = useThemeColor({}, 'surfaceElevated');
  const borderColor = useThemeColor({}, 'border');

  const [loading, setLoading] = useState(true);
  const [timeRangeLoading, setTimeRangeLoading] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [activeTab, setActiveTab] = useState<'analytics' | 'posts'>('analytics');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [profileStats, setProfileStats] = useState<ProfileStats>({
    totalPosts: 0,
    totalFollowers: 0,
    totalFollowing: 0,
  });
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [listeningStats, setListeningStats] = useState<ListeningStats | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'short_term' | 'medium_term' | 'long_term'>('medium_term');
  const [tasteProfile, setTasteProfile] = useState<{
    avg_valence: number | null;
    avg_arousal: number | null;
    genre_distribution: Record<string, number>;
    song_count: number;
  } | null>(null);

  // Spotify authentication
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: [
        'user-read-email',
        'user-library-read',
        'user-read-recently-played',
        'user-top-read',
        'playlist-read-private',
        'playlist-read-collaborative',
        'playlist-modify-public',
      ],
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    },
    {
      authorizationEndpoint: 'https://accounts.spotify.com/authorize',
      tokenEndpoint: 'https://accounts.spotify.com/api/token',
    }
  );

  // Helper function to get Spotify access token
  const getSpotifyAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('No Spotify access token found');
        return null;
      }
      
      // Check if token is expired
      const expirationDate = await AsyncStorage.getItem('expirationDate');
      if (expirationDate && Date.now() > parseInt(expirationDate, 10)) {
        console.log('Spotify access token expired');
        return null;
      }
      
      return token;
    } catch (error) {
      console.error('Error getting Spotify access token:', error);
      return null;
    }
  }, []);

  // Function to ensure song exists in backend and get its song_id
  const ensureSongExists = useCallback(async (spotifyId: string): Promise<number | null> => {
    try {
      // First, try to get the song by Spotify ID
      const getResponse = await fetch(
        `${API.BACKEND_URL}/api/songs/spotify/${spotifyId}`,
        {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        }
      );

      if (getResponse.ok) {
        const data = await getResponse.json();
        return data.song?.song_id || null;
      }

      // If not found, create the song
      const createResponse = await fetch(`${API.BACKEND_URL}/api/songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ spotifyId }),
      });

      if (createResponse.ok) {
        const data = await createResponse.json();
        return data.song?.song_id || null;
      }

      return null;
    } catch (error) {
      console.error('Error ensuring song exists:', error);
      return null;
    }
  }, []);

  // Function to get analytics for songs
  const getSongAnalytics = useCallback(async (songIds: number[]): Promise<SongAnalysis[]> => {
    try {
      const analyticsPromises = songIds.map(async (songId) => {
        // First, ensure analysis exists by creating it
        await fetch(`${API.BACKEND_URL}/api/analysis/song/${songId}`, {
          method: 'POST',
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });

        // Then get the analysis
        const response = await fetch(`${API.BACKEND_URL}/api/analysis/song/${songId}`, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });

        if (response.ok) {
          return await response.json();
        }
        return null;
      });

      const results = await Promise.all(analyticsPromises);
      return results.filter((result): result is SongAnalysis => result !== null);
    } catch (error) {
      console.error('Error getting song analytics:', error);
      return [];
    }
  }, []);

  // Function to load music data based on time range
  const loadMusicData = useCallback(async (timeRange: 'short_term' | 'medium_term' | 'long_term') => {
    try {
      const accessToken = await getSpotifyAccessToken();
      if (!accessToken) {
        console.log('No Spotify access token available');
        // Show empty state - user needs to authenticate
        setTopTracks([]);
        setTopArtists([]);
        setListeningStats(null);
        return;
      }

      // Fetch top tracks from Spotify
      const tracksResponse = await fetch(
        `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=20`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!tracksResponse.ok) {
        throw new Error('Failed to fetch top tracks');
      }

      const tracksData: { items: SpotifyTrack[] } = await tracksResponse.json();
      
      // Process tracks: ensure they exist in backend and get song IDs
      const songIdPromises = tracksData.items.map((track) => ensureSongExists(track.id));
      const songIds = (await Promise.all(songIdPromises)).filter((id): id is number => id !== null);

      // Get analytics for all songs
      const analytics = await getSongAnalytics(songIds);

      // Map tracks to our format
      const processedTracks: TopTrack[] = tracksData.items.slice(0, 10).map((track) => ({
        id: track.id,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        albumArt: track.album.images?.[0]?.url || '',
        previewUrl: undefined,
      }));

      setTopTracks(processedTracks);

      // Fetch top artists from Spotify
      const artistsResponse = await fetch(
        `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=20`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      let artistsData: { items: SpotifyArtist[] } | null = null;
      if (artistsResponse.ok) {
        artistsData = await artistsResponse.json();
        if (artistsData) {
          const processedArtists: TopArtist[] = artistsData.items.slice(0, 10).map((artist) => ({
            id: artist.id,
            name: artist.name,
            image: artist.images?.[0]?.url || '',
            genres: artist.genres || [],
          }));
          setTopArtists(processedArtists);
        }
      }

      // Calculate listening stats from analytics
      if (analytics.length > 0) {
        // Analytics values are 0-1, convert to 0-100 percentage
        const totalDanceability = analytics.reduce((sum, a) => sum + (a.danceability || 0), 0);
        const totalEnergy = analytics.reduce((sum, a) => sum + (a.energy || 0), 0);
        const avgDanceability = Math.round((totalDanceability / analytics.length) * 100);
        const avgEnergy = Math.round((totalEnergy / analytics.length) * 100);

        // Calculate total minutes (estimate based on average track length)
        const totalDurationMs = tracksData.items.reduce((sum, track) => sum + (track.duration_ms || 0), 0);
        const totalMinutes = Math.round(totalDurationMs / 60000);

        // Get top genre from artists
        let topGenre = 'Unknown';
        if (artistsData) {
          const allGenres = artistsData.items.flatMap((artist) => artist.genres || []);
          const genreCounts = allGenres.reduce((acc, genre) => {
            acc[genre] = (acc[genre] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
          topGenre = sortedGenres[0]?.[0] || 'Unknown';
          
          // Capitalize first letter
          topGenre = topGenre.charAt(0).toUpperCase() + topGenre.slice(1);
        }

        setListeningStats({
          totalMinutes,
          topGenre,
          danceability: avgDanceability,
          energy: avgEnergy,
        });
      }
    } catch (error) {
      console.error('Error loading music data:', error);
    }
  }, [getSpotifyAccessToken, ensureSongExists, getSongAnalytics]);

  // Exchange Spotify auth code for token
  const exchangeCodeForToken = useCallback(
    async (code: string) => {
      try {
        setAuthenticating(true);
        const body = `grant_type=authorization_code&code=${encodeURIComponent(
          code
        )}&redirect_uri=${encodeURIComponent(
          REDIRECT_URI
        )}&code_verifier=${encodeURIComponent(request?.codeVerifier || '')}`;

        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
          },
          body: body,
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.access_token) {
          const expirationDate = new Date(
            Date.now() + tokenData.expires_in * 1000
          ).getTime();
          await AsyncStorage.setItem('token', tokenData.access_token);
          await AsyncStorage.setItem('expirationDate', expirationDate.toString());

          Alert.alert('Success!', 'Successfully authenticated with Spotify!');
          
          // Reload music data after authentication
          await loadMusicData(selectedTimeRange);
        } else {
          Alert.alert('Error', 'Failed to get access token from Spotify');
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to exchange code for token');
        console.error('Token exchange error:', error);
      } finally {
        setAuthenticating(false);
      }
    },
    [request, loadMusicData, selectedTimeRange]
  );

  // Handle Spotify auth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      exchangeCodeForToken(code);
    } else if (response?.type === 'error') {
      Alert.alert('Error', 'Failed to authenticate with Spotify');
      setAuthenticating(false);
    }
  }, [response, exchangeCodeForToken]);

  // Refresh data periodically and when app becomes active
  // This ensures data is refreshed when user returns to the profile tab after authentication

  // Also listen to app state changes to refresh when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user) {
        // Reload data when app comes to foreground
        loadMusicData(selectedTimeRange);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, loadMusicData, selectedTimeRange]);

  // Load initial profile data (only runs once on mount)
  useEffect(() => {
    const loadInitialProfileData = async () => {
      setLoading(true);
      try {
        if (user?.id) {
          // Fetch real profile stats from backend
          const response = await fetch(`${API.BACKEND_URL}/api/auth/user/${user.id}`, {
            headers: {
              'ngrok-skip-browser-warning': 'true',
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.user?.stats) {
              setProfileStats({
                totalPosts: data.user.stats.totalPosts || 0,
                totalFollowers: data.user.stats.totalFollowers || 0,
                totalFollowing: data.user.stats.totalFollowing || 0,
              });
            }
          } else {
            // Try to get error message from response
            let errorMessage = `Status: ${response.status}`;
            try {
              const errorData = await response.json();
              errorMessage += ` - ${errorData.message || JSON.stringify(errorData)}`;
            } catch (e) {
              errorMessage += ` - ${response.statusText}`;
            }
            console.error('Failed to fetch profile stats:', errorMessage);
            console.error('Request URL:', `${API.BACKEND_URL}/api/auth/user/${user.id}`);
            // Set default values if fetch fails
            setProfileStats({
              totalPosts: 0,
              totalFollowers: 0,
              totalFollowing: 0,
            });
          }
        }

        // Fetch taste profile
        if (user?.id) {
          try {
            const tasteRes = await fetch(`${API.BACKEND_URL}/api/taste/profile/${user.id}`, {
              headers: { 'ngrok-skip-browser-warning': 'true' },
            });
            if (tasteRes.ok) {
              const tasteData = await tasteRes.json();
              setTasteProfile(tasteData.profile);
            }
          } catch (e) {
            console.error('Error fetching taste profile:', e);
          }
        }

        // Load initial music data which will also set listening stats
        await loadMusicData('medium_term');
      } catch (error) {
        console.error('Error loading initial profile data:', error);
        // Set default values on error
        setProfileStats({
          totalPosts: 0,
          totalFollowers: 0,
          totalFollowing: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadInitialProfileData();
    }
  }, [user, loadMusicData]);

  // Load user posts
  useEffect(() => {
    const loadUserPosts = async () => {
      if (!user?.id || activeTab !== 'posts') return;

      setPostsLoading(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API.BACKEND_URL}/api/posts/user/${user.id}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        const transformedPosts: FeedPost[] = (result.posts || []).map((post: any) => ({
          post_id: post.post_id,
          user_id: post.user_id,
          content: post.content,
          like_count: post.like_count || 0,
          visibility: post.visibility,
          created_at: post.created_at,
          updated_at: post.updated_at,
          isLiked: post.isLiked || false,
          comments: post.comments || [],
          album_id: post.album_id || null,
          albumRankings: post.albumRankings || [],
          songRank: post.songRank || undefined,
          songScore: post.songScore || undefined,
          users: {
            id: post.users?.id || post.user_id,
            username: post.users?.username || '',
            display_name: post.users?.display_name || null,
          },
          songs: post.songs ? {
            song_id: post.songs.song_id?.toString() || '',
            spotify_id: post.songs.spotify_id || '',
            song_name: post.songs.song_name || '',
            artist_name: post.songs.artist_name || '',
            album_name: post.songs.album_name || null,
            cover_art_url: post.songs.cover_art_url || null,
          } : null,
        }));

        setPosts(transformedPosts);
      } catch (error) {
        console.error('Error loading user posts:', error);
        setPosts([]);
      } finally {
        setPostsLoading(false);
      }
    };

    loadUserPosts();
  }, [user?.id, activeTab, token]);

  // handle time range changes
  const handleTimeRangeChange = async (timeRange: 'short_term' | 'medium_term' | 'long_term') => {
    setSelectedTimeRange(timeRange);
    setTimeRangeLoading(true);
    await loadMusicData(timeRange);
    setTimeRangeLoading(false);
  };

  const handleLike = (postId: number, newLikeCount: number, isLiked: boolean) => {
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.post_id === postId
          ? { ...post, like_count: newLikeCount, isLiked: isLiked }
          : post
      )
    );
  };

  const handleComment = (postId: number) => {
    console.log('Navigate to comments for post:', postId);
  };

  const handleCommentAdded = (postId: number, comment: any) => {
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.post_id === postId
          ? { ...post, comments: [...(post.comments || []), comment] }
          : post
      )
    );
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const timeRangeLabels = {
    short_term: 'Last Month',
    medium_term: 'Last 6 Months',
    long_term: 'All Time',
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={styles.loadingText}>Loading your profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Minimal Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => router.push('/profile/edit' as any)}
            >
              <IconSymbol name="gear" size={22} color={mutedColor} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={handleLogout}
            >
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={22} color={mutedColor} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile Header - Spotify Style */}
        <MoodAura
          valence={tasteProfile?.avg_valence ?? null}
          arousal={tasteProfile?.avg_arousal ?? null}
          style={styles.profileSection}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: surfaceColor }]}>
              <IconSymbol name="person.fill" size={48} color={primaryColor} />
            </View>
          </View>
          
          <ThemedText style={styles.displayName}>
            {user?.user_metadata?.username || user?.email?.split('@')[0] || 'Music Lover'}
          </ThemedText>
          
          {user?.email && (
            <ThemedText style={[styles.email, { color: mutedColor }]}>
              {user.email}
            </ThemedText>
          )}

          {/* Minimal Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={[styles.statItem, { marginLeft: -25 }]}
              onPress={() => user?.id && router.push(`/followers?userId=${user.id}` as any)}
            >
              <ThemedText style={styles.statValue}>{profileStats.totalFollowers}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Followers</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statItem, { marginLeft: -7 }]}
              onPress={() => user?.id && router.push(`/following?userId=${user.id}` as any)}
            >
              <ThemedText style={styles.statValue}>{profileStats.totalFollowing}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Following</ThemedText>
            </TouchableOpacity>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{profileStats.totalPosts}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Posts</ThemedText>
            </View>
          </View>
        </MoodAura>

        {/* Taste DNA */}
        {tasteProfile && tasteProfile.song_count > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
            <TasteDNA
              genreDistribution={tasteProfile.genre_distribution}
              mutedColor={mutedColor}
              primaryColor={primaryColor}
            />
          </View>
        )}

        {/* Tab Switcher */}
        <View style={styles.tabSection}>
          <View style={[styles.tabContainer, { backgroundColor: surfaceColor }]}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'analytics' && [styles.tabButtonActive, { backgroundColor: primaryColor }],
              ]}
              onPress={() => setActiveTab('analytics')}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  activeTab === 'analytics' && styles.tabTextActive,
                  activeTab !== 'analytics' && { color: mutedColor },
                ]}
              >
                Analytics
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'posts' && [styles.tabButtonActive, { backgroundColor: primaryColor }],
              ]}
              onPress={() => setActiveTab('posts')}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  activeTab === 'posts' && styles.tabTextActive,
                  activeTab !== 'posts' && { color: mutedColor },
                ]}
              >
                Posts
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Posts Tab Content */}
        {activeTab === 'posts' && (
          <View style={styles.postsSection}>
            {postsLoading ? (
              <View style={styles.postsLoadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
              </View>
            ) : posts.length === 0 ? (
              <View style={styles.emptyPostsContainer}>
                <IconSymbol name="music.note" size={48} color={mutedColor} style={styles.emptyPostsIcon} />
                <ThemedText style={[styles.emptyPostsText, { color: mutedColor }]}>
                  No posts yet
                </ThemedText>
              </View>
            ) : (
              <View style={styles.postsList}>
                {posts.map((post) => (
                  <PostCard
                    key={post.post_id}
                    post={post}
                    onLike={handleLike}
                    onComment={handleComment}
                    onCommentAdded={handleCommentAdded}
                    surfaceColor={surfaceColor}
                    mutedColor={mutedColor}
                    primaryColor={primaryColor}
                    textColor={textColor}
                    borderColor={borderColor}
                    authToken={token}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Analytics Tab Content */}
        {activeTab === 'analytics' && (
          <>
            {/* Spotify Auth Prompt - Minimal */}
        {!listeningStats && topTracks.length === 0 && !loading && (
          <View style={styles.section}>
            <View style={[styles.authCard, { backgroundColor: surfaceColor }]}>
              <IconSymbol name="music.note" size={40} color={primaryColor} style={styles.authIcon} />
              <ThemedText style={styles.authTitle}>Connect to Spotify</ThemedText>
              <ThemedText style={[styles.authMessage, { color: mutedColor }]}>
                Connect your Spotify account to see your listening insights
              </ThemedText>
              <TouchableOpacity
                style={[
                  styles.authButton,
                  { backgroundColor: primaryColor, opacity: authenticating ? 0.6 : 1 },
                ]}
                onPress={() => {
                  if (request && !authenticating) {
                    promptAsync();
                  }
                }}
                disabled={authenticating || !request}
              >
                {authenticating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.authButtonText}>Connect Spotify</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Listening Stats - Spotify Style */}
        {listeningStats && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Your Listening</ThemedText>
            <View style={[styles.statsCard, { backgroundColor: surfaceColor }]}>
              <View style={[styles.listeningStatsRow, { borderBottomColor: borderColor }]}>
                <View style={styles.listeningStatItem}>
                  <ThemedText style={styles.listeningStatValue}>
                    {Math.round(listeningStats.totalMinutes / 60)}h
                  </ThemedText>
                  <ThemedText style={[styles.listeningStatLabel, { color: mutedColor }]}>
                    Total Listened
                  </ThemedText>
                </View>
                
                <View style={styles.listeningStatItem}>
                  <ThemedText style={styles.listeningStatValueGenre}>
                    {listeningStats.topGenre}
                  </ThemedText>
                  <ThemedText style={[styles.listeningStatLabel, { color: mutedColor }]}>
                    Top Genre
                  </ThemedText>
                </View>
              </View>
              
              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <View style={styles.metricHeader}>
                    <ThemedText style={[styles.metricLabel, { color: mutedColor }]}>Danceability</ThemedText>
                    <ThemedText style={styles.metricValue}>{listeningStats.danceability}%</ThemedText>
                  </View>
                  <View style={[styles.metricBar, { backgroundColor: borderColor }]}>
                    <View 
                      style={[
                        styles.metricBarFill, 
                        { 
                          width: `${listeningStats.danceability}%`,
                          backgroundColor: primaryColor 
                        }
                      ]} 
                    />
                  </View>
                </View>

                <View style={styles.metricItem}>
                  <View style={styles.metricHeader}>
                    <ThemedText style={[styles.metricLabel, { color: mutedColor }]}>Energy</ThemedText>
                    <ThemedText style={styles.metricValue}>{listeningStats.energy}%</ThemedText>
                  </View>
                  <View style={[styles.metricBar, { backgroundColor: borderColor }]}>
                    <View 
                      style={[
                        styles.metricBarFill, 
                        { 
                          width: `${listeningStats.energy}%`,
                          backgroundColor: primaryColor 
                        }
                      ]} 
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Time Range Selector - Integrated */}
        {(listeningStats || topTracks.length > 0) && (
          <View style={styles.timeRangeSection}>
            <View style={[styles.timeRangeContainer, { backgroundColor: surfaceColor }]}>
              {(['short_term', 'medium_term', 'long_term'] as const).map((range, index) => (
                <TouchableOpacity
                  key={range}
                  style={[
                    styles.timeRangeButton,
                    selectedTimeRange === range && [styles.timeRangeButtonActive, { backgroundColor: primaryColor }],
                    index > 0 && styles.timeRangeButtonNotFirst,
                  ]}
                  onPress={() => handleTimeRangeChange(range)}
                  disabled={timeRangeLoading}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={[
                      styles.timeRangeText,
                      selectedTimeRange === range && styles.timeRangeTextActive,
                      selectedTimeRange !== range && { color: mutedColor },
                      timeRangeLoading && styles.timeRangeTextDisabled,
                    ]}
                  >
                    {timeRangeLabels[range]}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Top Tracks - Spotify Style */}
        {topTracks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Top Tracks</ThemedText>
            </View>
            
            {timeRangeLoading ? (
              <View style={styles.musicLoadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.musicLoadingText, { color: mutedColor }]}>
                  Loading tracks...
                </ThemedText>
              </View>
            ) : (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {topTracks.map((track, index) => (
                  <TouchableOpacity 
                    key={track.id} 
                    style={styles.trackCard}
                  >
                    <View style={[styles.trackNumber, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
                      <ThemedText style={styles.trackNumberText}>
                        {index + 1}
                      </ThemedText>
                    </View>
                    <Image
                      source={{ uri: track.albumArt }}
                      style={styles.trackImage}
                    />
                    <ThemedText style={styles.trackName} numberOfLines={1}>
                      {track.name}
                    </ThemedText>
                    <ThemedText style={[styles.trackArtist, { color: mutedColor }]} numberOfLines={1}>
                      {track.artist}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Top Artists - Spotify Style */}
        {topArtists.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Top Artists</ThemedText>
            </View>
            
            {timeRangeLoading ? (
              <View style={styles.musicLoadingContainer}>
                <ActivityIndicator size="small" color={primaryColor} />
                <ThemedText style={[styles.musicLoadingText, { color: mutedColor }]}>
                  Loading artists...
                </ThemedText>
              </View>
            ) : (
              <View style={styles.artistsGridContainer}>
                <View style={styles.artistsGrid}>
                  {topArtists.map((artist, index) => (
                    <TouchableOpacity 
                      key={artist.id} 
                      style={styles.artistCard}
                    >
                      <View style={styles.artistImageContainer}>
                        <View style={[styles.artistNumber, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
                          <ThemedText style={styles.artistNumberText}>
                            {index + 1}
                          </ThemedText>
                        </View>
                        <Image
                          source={{ uri: artist.image }}
                          style={styles.artistImage}
                        />
                      </View>
                      <ThemedText style={styles.artistName} numberOfLines={2}>
                        {artist.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 40,
    includeFontPadding: false,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.5,
    lineHeight: 36,
    includeFontPadding: false,
  },
  email: {
    fontSize: 15,
    marginBottom: 24,
    opacity: 0.7,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 32,
    paddingTop: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginTop: 32,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  timeRangeSection: {
    marginTop: 24,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 6,
    width: '100%',
    maxWidth: 400,
    gap: 8,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  timeRangeButtonActive: {
    // Active state handled by backgroundColor
  },
  timeRangeButtonNotFirst: {
    marginLeft: 0,
  },
  timeRangeText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  timeRangeTextActive: {
    fontWeight: '700',
  },
  timeRangeTextDisabled: {
    opacity: 0.4,
  },
  statsCard: {
    padding: 24,
    borderRadius: 12,
    overflow: 'visible',
  },
  listeningStatsRow: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 32,
    paddingBottom: 24,
    paddingTop: 0,
    borderBottomWidth: 1,
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  listeningStatItem: {
    flex: 1,
    alignItems: 'flex-start',
    paddingTop: 0,
    overflow: 'visible',
  },
  listeningStatValue: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -1,
    lineHeight: 44,
    includeFontPadding: false,
  },
  listeningStatValueGenre: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.8,
    lineHeight: 38,
    includeFontPadding: false,
  },
  listeningStatLabel: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsRow: {
    gap: 20,
  },
  metricItem: {
    gap: 8,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  metricBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  authCard: {
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  authIcon: {
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  authMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  authButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  musicLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  musicLoadingText: {
    fontSize: 14,
  },
  horizontalScroll: {
    paddingRight: 20,
    gap: 16,
  },
  trackCard: {
    width: 140,
    marginRight: 16,
  },
  trackNumber: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  trackNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  trackImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  trackName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  trackArtist: {
    fontSize: 13,
    lineHeight: 18,
  },
  artistsGridContainer: {
    width: '100%',
    alignItems: 'center',
  },
  artistsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
  },
  artistCard: {
    width: (width - 60) / 2,
    alignItems: 'center',
    marginBottom: 20,
  },
  artistImageContainer: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  artistNumber: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  artistNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  artistImage: {
    width: (width - 60) / 2,
    aspectRatio: 1,
    borderRadius: (width - 60) / 4,
  },
  artistName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  bottomPadding: {
    height: 100,
  },
  tabSection: {
    marginTop: 16,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 6,
    width: '100%',
    maxWidth: 400,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  tabButtonActive: {
    // Active state handled by backgroundColor
  },
  tabText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  postsSection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  postsLoadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyPostsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyPostsIcon: {
    marginBottom: 12,
    opacity: 0.4,
  },
  emptyPostsText: {
    fontSize: 14,
    textAlign: 'center',
  },
  postsList: {
    gap: 16,
  },
});
