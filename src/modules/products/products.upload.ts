/**
 * Multer configuration for product file uploads
 */

import multer from 'multer';

// Configure multer for memory storage
const storage = multer.memoryStorage();
export const productUpload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    
    if (validImageTypes.includes(file.mimetype) || validVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`));
    }
  },
});

// Middleware for product creation with files
export const productCreateMiddleware = productUpload.fields([
  { name: 'image_files', maxCount: 10 },
  { name: 'video_file', maxCount: 1 },
]);

