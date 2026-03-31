import { Router } from 'express';
import { createComment, createPost, getAllPosts, getCommentsByPostId, getPostsByUserId, getUserSongRankings, toggleLike, toggleReaction } from '../controllers/postsController';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';

const router = Router();

// Create a new post (protected route - requires authentication)
router.post('/', authenticateToken, createPost);

// Get posts for a specific user (optionally authenticated for visibility filtering)
router.get('/user/:userId', optionalAuthenticateToken, getPostsByUserId);

// Get all public posts (for feed functionality) - optionally authenticated
router.get('/', optionalAuthenticateToken, getAllPosts);

// Get user's song rankings
router.get('/rankings/:userId', getUserSongRankings);

// Get current user's song rankings
router.get('/rankings', authenticateToken, getUserSongRankings);

// React to a post (protected route - requires authentication)
router.post('/:postId/react', authenticateToken, toggleReaction);

// Like or unlike a post (legacy, maps to 'love' reaction)
router.post('/:postId/like', authenticateToken, toggleLike);

// Create a new comment on a post (protected route - requires authentication)
router.post('/:postId/comments', authenticateToken, createComment);

// Get all comments for a specific post (public route)
router.get('/:postId/comments', getCommentsByPostId);

export default router;