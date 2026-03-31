import { DiscoveryCard } from '@/components/discovery/DiscoveryCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { API } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface DiscoveryPost {
  post_id: number;
  user_id: string;
  content: string;
  like_count: number;
  created_at: string;
  reaction_summary?: Record<string, number>;
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
  connectedVia: {
    id: string;
    username: string;
  } | null;
}

export default function DiscoverScreen() {
  const { token } = useAuth();
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textMuted');
  const surfaceColor = useThemeColor({}, 'surface');

  const [posts, setPosts] = useState<DiscoveryPost[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchDiscoveries = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch(`${API.BACKEND_URL}/api/discovery/feed?limit=30`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setPosts(data.posts || []);
      setMessage(data.message || '');
      setCurrentIndex(0);
    } catch (error) {
      console.error('Error fetching discoveries:', error);
      setMessage('Failed to load discoveries');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDiscoveries();
  }, [fetchDiscoveries]);

  const handleSave = async (postId: number) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const currentPost = posts[currentIndex];
      await fetch(`${API.BACKEND_URL}/api/discovery/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          postId,
          action: 'save',
          discoveredViaUserId: currentPost?.connectedVia?.id || null,
        }),
      });
    } catch (error) {
      console.error('Error saving discovery:', error);
    }

    // Move to next card after a short delay
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
    }, 300);
  };

  const handleDismiss = async (postId: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await fetch(`${API.BACKEND_URL}/api/discovery/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          postId,
          action: 'dismiss',
        }),
      });
    } catch (error) {
      console.error('Error dismissing discovery:', error);
    }

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
    }, 300);
  };

  const currentPost = posts[currentIndex];
  const hasMore = currentIndex < posts.length;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: mutedColor }]}>
            Finding music for you...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!hasMore || posts.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Discover</ThemedText>
        </View>
        <View style={styles.centered}>
          <IconSymbol name="sparkles" size={64} color={mutedColor} style={{ opacity: 0.4 }} />
          <ThemedText style={styles.emptyTitle}>
            {posts.length === 0 ? "No discoveries yet" : "All caught up!"}
          </ThemedText>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            {posts.length === 0
              ? "Follow more people to discover music through their connections"
              : "Check back later for more music from your extended network"}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Discover</ThemedText>
        <ThemedText style={[styles.headerSubtitle, { color: mutedColor }]}>
          {currentIndex + 1} of {posts.length}
        </ThemedText>
      </View>

      <GestureHandlerRootView style={styles.cardContainer}>
        <DiscoveryCard
          key={currentPost.post_id}
          post={currentPost}
          onSave={handleSave}
          onDismiss={handleDismiss}
        />
      </GestureHandlerRootView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
