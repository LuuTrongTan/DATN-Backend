import express from 'express';
import * as faqController from './faq.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// Public routes
router.get('/', faqController.getFAQs);
router.get('/:id', faqController.getFAQById);

// Admin/Staff routes
router.post('/', authenticate, requireRole('admin', 'staff'), faqController.createFAQ);
router.put('/:id', authenticate, requireRole('admin', 'staff'), faqController.updateFAQ);
router.delete('/:id', authenticate, requireRole('admin', 'staff'), faqController.deleteFAQ);

export default router;

