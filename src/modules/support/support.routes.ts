import express from 'express';
import * as supportController from './support.controller';
import { authenticate, requireRole } from '../../middlewares/auth.middleware';

const router = express.Router();

// All support routes require authentication
router.use(authenticate);

// Get tickets (user sees their own, admin/staff see all)
router.get('/', supportController.getTickets);

// Get ticket by ID
router.get('/:id', supportController.getTicketById);

// Create ticket
router.post('/', supportController.createTicket);

// Update ticket (user can update their own, admin/staff can update all)
router.put('/:id', supportController.updateTicket);

// Get messages for a ticket
router.get('/:id/messages', supportController.getTicketMessages);

// Send message to ticket
router.post('/:id/messages', supportController.sendMessage);

export default router;

