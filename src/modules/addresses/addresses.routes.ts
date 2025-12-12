import express from 'express';
import * as addressesController from './addresses.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = express.Router();

router.get('/', authenticate, addressesController.getAddresses);
router.get('/:id', authenticate, addressesController.getAddressById);
router.post('/', authenticate, addressesController.createAddress);
router.put('/:id', authenticate, addressesController.updateAddress);
router.delete('/:id', authenticate, addressesController.deleteAddress);

export default router;

