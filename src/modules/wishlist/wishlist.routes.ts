import express from 'express';
import * as wishlistController from './wishlist.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

router.get('/', authenticate, wishlistController.getWishlist);
router.post('/', authenticate, wishlistController.addToWishlist);
router.delete('/:product_id', authenticate, wishlistController.removeFromWishlist);
router.get('/check/:product_id', authenticate, wishlistController.checkWishlist);

export default router;

