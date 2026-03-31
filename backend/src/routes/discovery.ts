import { Router } from 'express';
import { getDiscoveryFeed, discoveryAction, getSavedDiscoveries } from '../controllers/discoveryController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get discovery feed (friends-of-friends posts)
router.get('/feed', authenticateToken, getDiscoveryFeed);

// Save or dismiss a discovery
router.post('/action', authenticateToken, discoveryAction);

// Get saved discoveries
router.get('/saved', authenticateToken, getSavedDiscoveries);

export default router;
