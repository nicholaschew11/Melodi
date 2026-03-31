import { Request, Response } from 'express';
import { getDatabase } from '../db';

// Sync user from Supabase Auth to custom users table
export const syncUser = async (req: Request, res: Response) => {
    try {
        const { userId, email, username, displayName, spotifyId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        if (username && (username.length < 3 || username.length > 30)) {
            return res.status(400).json({ message: 'Username must be between 3 and 30 characters' });
        }

        const supabase = await getDatabase();

        // Check if user already exists in our custom table
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
            
        if (existingUser) {
            return res.status(200).json({ 
                message: 'User already exists', 
                user: existingUser 
            });
        }

        // Insert new user into our custom users table
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([
                { 
                    id: userId,
                    email: email || null,
                    username: username || email?.split('@')[0] || `user_${userId.slice(0, 8)}`,
                    display_name: displayName || null,
                    spotify_id: spotifyId || null
                }
            ])
            .select()
            .single();
            
        if (error) {
            throw error;
        }

        res.status(201).json({ 
            message: 'User synced successfully', 
            user: newUser 
        });
    } catch (error) {
        console.error('Sync user error:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};

// Get user profile from custom users table
export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const supabase = await getDatabase();
        
        // Get user from custom users table with all profile fields
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, username, display_name, bio, favorite_genres, is_public, spotify_id, created_at')
            .eq('id', userId)
            .single();
            
        if (error || !user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get user stats (posts count)
        const { count: postsCount } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Get followers count (friends where this user is user_two)
        const { count: followersCount } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_two_id', userId)
            .eq('status', 'accepted');

        // Get following count (friends where this user is user_one)
        const { count: followingCount } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_one_id', userId)
            .eq('status', 'accepted');

        const userWithStats = {
            ...user,
            stats: {
                totalPosts: postsCount || 0,
                totalFollowers: followersCount || 0,
                totalFollowing: followingCount || 0,
            }
        };

        res.status(200).json({ user: userWithStats });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { displayName, bio, favoriteGenres, isPublic } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const supabase = await getDatabase();
        
        // Build update object with only provided fields
        const updateData: any = {};
        if (displayName !== undefined) updateData.display_name = displayName;
        if (bio !== undefined) updateData.bio = bio;
        if (favoriteGenres !== undefined) updateData.favorite_genres = favoriteGenres;
        if (isPublic !== undefined) updateData.is_public = isPublic;

        // Update user profile
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();
            
        if (error) {
            throw error;
        }

        res.status(200).json({ 
            message: 'Profile updated successfully', 
            user: updatedUser 
        });
    } catch (error) {
        console.error('Update user profile error:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const supabase = await getDatabase();
        
        const { data: allUsers, error } = await supabase
            .from('users')
            .select('id, email, username, created_at');
            
        if (error) {
            throw error;
        }
        
        res.status(200).json(allUsers);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
