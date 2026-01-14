import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import * as adminSettingsController from './admin-settings.controller';
import { USER_ROLE } from '../../constants';

const router = express.Router();

// Chỉ admin mới được thao tác cấu hình hệ thống
router.use(authenticate, authorize([USER_ROLE.ADMIN]));

// Cấu hình xác thực Firebase cho đăng ký bằng số điện thoại
router.get(
  '/auth/phone-firebase',
  adminSettingsController.getPhoneFirebaseRegistrationConfig
);

router.put(
  '/auth/phone-firebase',
  adminSettingsController.updatePhoneFirebaseRegistrationConfig
);

export default router;

