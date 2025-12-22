import express from 'express';
import * as provincesController from './provinces.controller';

const router = express.Router();

// Search provinces, districts, wards (must be first - exact match)
// GET /api/provinces/search?q=keyword
router.get('/search', provincesController.search);

// Get wards by district code (longer path must be before shorter path)
// GET /api/provinces/districts/:districtCode/wards
router.get('/districts/:districtCode/wards', provincesController.getWards);

// Get district by code
// GET /api/provinces/districts/:code?depth=1
router.get('/districts/:code', provincesController.getDistrictByCode);

// Get ward by code
// GET /api/provinces/wards/:code
router.get('/wards/:code', provincesController.getWardByCode);

// Get districts by province code (longer path must be before shorter path)
// GET /api/provinces/:provinceCode/districts?depth=1
router.get('/:provinceCode/districts', provincesController.getDistricts);

// Get all provinces (tỉnh/thành phố) - must be before /:code
// GET /api/provinces?depth=1
router.get('/', provincesController.getProvinces);

// Get province by code (catch-all - must be last)
// GET /api/provinces/:code?depth=2
router.get('/:code', provincesController.getProvinceByCode);

export default router;

