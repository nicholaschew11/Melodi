import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { CompatibilityBadge } from '@/components/profile/CompatibilityBadge';
import { MoodAura } from '@/components/profile/MoodAura';
import { TasteDNA } from '@/components/profile/TasteDNA';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { API } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FeedPost } from '@/types/feed';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  email: string;
  bio?: string;
  favorite_genres?: string;
  is_public: boolean;
  stats: {
    totalPosts: number;
    totalFollowers: number;
    totalFollowing: number;
  };
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textMuted');
  const textColor = useThemeColor({}, 'text');
  const surfaceColor = useThemeColor({}, 'surface');
  const borderColor = useThemeColor({}, 'border');

  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null);
  const [tasteProfile, setTasteProfile] = useState<{
    avg_valence: number | null;
    avg_arousal: number | null;
    genre_distribution: Record<string, number>;
    song_count: number;
  } | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    const loadUserProfile = async () => {
      setLoading(true);
      try {
        console.log('Loading profile for user:', id);
        
        // Fetch user profile from backend
        const response = await fetch(`${API.BACKEND_URL}/api/auth/user/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('User profile loaded:', result);
        
        setUserProfile(result.user);

        // Check if already following from API
        if (token && user?.id !== id) {
          try {
            const followStatusResponse = await fetch(
              `${API.BACKEND_URL}/api/users/${id}/following-status`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
              }
            );

            if (followStatusResponse.ok) {
              const followStatusResult = await followStatusResponse.json();
              setIsFollowing(followStatusResult.isFollowing || false);
            }
          } catch (error) {
            console.error('Error checking follow status:', error);
            setIsFollowing(false);
          }
        } else {
          setIsFollowing(false);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadUserProfile();
    }
  }, [id, token, user]);

  // Fetch taste profile and compatibility
  useEffect(() => {
    const fetchTasteData = async () => {
      if (!id) return;

      try {
        // Fetch taste profile
        const profileRes = await fetch(`${API.BACKEND_URL}/api/taste/profile/${id}`, {
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setTasteProfile(profileData.profile);
        }

        // Fetch compatibility if viewing another user's profile
        if (token && user?.id !== id) {
          const compatRes = await fetch(`${API.BACKEND_URL}/api/taste/compatibility/${id}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'ngrok-skip-browser-warning': 'true',
            },
          });
          if (compatRes.ok) {
            const compatData = await compatRes.json();
            setCompatibilityScore(compatData.compatibility.score);
          }
        }
      } catch (error) {
        console.error('Error fetching taste data:', error);
      }
    };

    if (userProfile) {
      fetchTasteData();
    }
  }, [id, userProfile, token, user]);

  // Fetch user posts
  useEffect(() => {
    const loadUserPosts = async () => {
      if (!id) return;
      
      setPostsLoading(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        };
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API.BACKEND_URL}/api/posts/user/${id}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('User posts loaded:', result);
        
        // Transform the posts to match FeedPost interface
        const transformedPosts: FeedPost[] = (result.posts || []).map((post: any) => ({
          post_id: post.post_id,
          user_id: post.user_id,
          content: post.content,
          like_count: post.like_count || 0,
          visibility: post.visibility,
          created_at: post.created_at,
          updated_at: post.updated_at,
          isLiked: false, // Will be updated if user is authenticated
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

    if (userProfile) {
      loadUserPosts();
    }
  }, [id, userProfile, token]);

  const handleFollow = async () => {
    if (!token) {
      return;
    }

    const wasFollowing = isFollowing;
    const newFollowingState = !isFollowing;

    // Optimistic update
    setIsFollowing(newFollowingState);

    try {
      const endpoint = 'follow';
      const method = newFollowingState ? 'POST' : 'DELETE';

      const response = await fetch(
        `${API.BACKEND_URL}/api/users/${id}/${endpoint}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update user profile stats
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          stats: {
            ...userProfile.stats,
            totalFollowers: newFollowingState
              ? userProfile.stats.totalFollowers + 1
              : userProfile.stats.totalFollowers - 1,
          },
        });
      }
    } catch (error) {
      console.error('Error following/unfollowing user:', error);
      // Revert optimistic update
      setIsFollowing(wasFollowing);
    }
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
    // Navigate to comments or show comment modal
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

  const isOwnProfile = user?.id === id;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!userProfile) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={mutedColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="person.circle.fill" size={64} color={mutedColor} style={styles.emptyIcon} />
          <ThemedText style={styles.emptyTitle}>Profile Not Found</ThemedText>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            This profile doesn&apos;t exist or couldn&apos;t be loaded.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!userProfile.is_public && user?.id !== id) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={mutedColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="lock.fill" size={64} color={mutedColor} style={styles.emptyIcon} />
          <ThemedText style={styles.emptyTitle}>Private Profile</ThemedText>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            This profile is private.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header with back button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={mutedColor} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
          {isOwnProfile && (
            <TouchableOpacity 
              onPress={() => router.push('/profile/edit')} 
              style={styles.backButton}
            >
              <IconSymbol name="pencil" size={20} color={primaryColor} />
            </TouchableOpacity>
          )}
          {!isOwnProfile && <View style={styles.backButton} />}
        </View>

        {/* Profile Info */}
        <MoodAura
          valence={tasteProfile?.avg_valence ?? null}
          arousal={tasteProfile?.avg_arousal ?? null}
          style={[styles.profileCard, { backgroundColor: surfaceColor, borderColor }]}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { borderColor: primaryColor }]}>
              <IconSymbol name="person.circle.fill" size={40} color={primaryColor} />
            </View>
          </View>
          
          <ThemedText style={styles.displayName}>
            {userProfile.display_name || userProfile.username}
          </ThemedText>
          
          <ThemedText style={[styles.username, { color: mutedColor }]}>
            @{userProfile.username}
          </ThemedText>

          {userProfile.bio && (
            <ThemedText style={[styles.bio, { color: mutedColor }]}>
              {userProfile.bio}
            </ThemedText>
          )}

          {userProfile.favorite_genres && (
            <View style={styles.genresContainer}>
              {userProfile.favorite_genres.split(',').map((genre, index) => (
                <View key={index} style={[styles.genreTag, { backgroundColor: primaryColor + '20', borderColor: primaryColor }]}>
                  <ThemedText style={[styles.genreText, { color: primaryColor }]}>
                    {genre.trim()}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{userProfile.stats.totalPosts}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Posts</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => router.push(`/followers?userId=${id}` as any)}
            >
              <ThemedText style={styles.statValue}>{userProfile.stats.totalFollowers}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Followers</ThemedText>
            </TouchableOpacity>
            <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => router.push(`/following?userId=${id}` as any)}
            >
              <ThemedText style={styles.statValue}>{userProfile.stats.totalFollowing}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: mutedColor }]}>Following</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Compatibility Badge + Follow Button */}
          {!isOwnProfile && (
            <View style={styles.actionRow}>
              {compatibilityScore !== null && (
                <CompatibilityBadge score={compatibilityScore} />
              )}
              <TouchableOpacity
                style={[
                  styles.followButton,
                  isFollowing ? { borderColor, backgroundColor: 'transparent' } : { backgroundColor: primaryColor }
                ]}
                onPress={handleFollow}
              >
                <ThemedText
                  style={[
                    styles.followButtonText,
                    isFollowing ? { color: primaryColor } : { color: '#FFFFFF' }
                  ]}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </MoodAura>

        {/* Taste DNA Visualization */}
        {tasteProfile && tasteProfile.song_count > 0 && (
          <View style={[styles.tasteDNAContainer, { backgroundColor: surfaceColor, borderColor }]}>
            <TasteDNA
              genreDistribution={tasteProfile.genre_distribution}
              mutedColor={mutedColor}
              primaryColor={primaryColor}
            />
          </View>
        )}

        {/* Posts Section */}
        <View style={styles.postsSection}>
          <ThemedText style={styles.postsSectionTitle}>Posts</ThemedText>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    minWidth: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  profileCard: {
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    marginBottom: 12,
  },
  bio: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  followButton: {
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 120,
    alignItems: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tasteDNAContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  bottomPadding: {
    height: 100,
  },
  postsSection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  postsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
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
