import { Router } from 'express';
import { getTasteProfile, getCompatibility } from '../controllers/tasteController';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';

const router = Router();

// Get taste profile for a user
router.get('/profile/:userId', optionalAuthenticateToken, getTasteProfile);

// Get compatibility score between current user and target user
router.get('/compatibility/:userId', authenticateToken, getCompatibility);

export default router;
