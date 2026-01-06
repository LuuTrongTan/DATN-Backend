import { Response } from 'express';
import multer from 'multer';
import { uploadFile, uploadMultipleFiles } from './storage.service';
import { AuthRequest } from '../../types/request.types';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
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

// Multer middleware for single file
export const uploadSingleMiddleware = upload.single('file');

// Single file upload handler
export const uploadSingle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return ResponseHandler.error(res, 'No file provided', 400);
    }

    const { buffer, originalname, mimetype } = req.file;
    
    // Upload file qua server (local storage)
    const uploadResult = await uploadFile(buffer, originalname, mimetype);

    return ResponseHandler.success(res, {
      url: uploadResult.url,
      localUrl: uploadResult.localUrl,
      fileName: originalname,
      mimeType: mimetype,
    }, 'Upload file thành công');
  } catch (error: any) {
    logger.error('Upload error', error instanceof Error ? error : new Error(String(error)), {
      fileName: req.file?.originalname,
      mimeType: req.file?.mimetype,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, error.message || 'Failed to upload file', error);
  }
};

// Multer middleware for multiple files
export const uploadMultipleMiddleware = upload.array('files', 10); // Max 10 files

// Multiple files upload handler
export const uploadMultiple = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files) {
      return ResponseHandler.error(res, 'No files provided', 400);
    }

    // Handle different file input formats
    let files: Express.Multer.File[] = [];
    
    if (Array.isArray(req.files)) {
      // Array format: [file1, file2, ...]
      files = req.files;
    } else if (typeof req.files === 'object') {
      // Object format: { fieldname: [file1, file2, ...] }
      // Flatten all files from all fields
      files = Object.values(req.files).flat();
    } else {
      // Single file (shouldn't happen with upload.array, but handle it)
      files = [req.files];
    }

    if (files.length === 0) {
      return ResponseHandler.error(res, 'No files provided', 400);
    }
    
    const uploadData: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = files.map((file: Express.Multer.File) => ({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    }));

    // Upload files qua server (local storage)
    const uploadResult = await uploadMultipleFiles(uploadData);

    return ResponseHandler.success(res, {
      urls: uploadResult.urls,
      localUrls: uploadResult.localUrls,
      count: uploadResult.urls.length,
    }, 'Upload files thành công');
  } catch (error: any) {
    logger.error('Upload error', error instanceof Error ? error : new Error(String(error)), {
      fileCount: req.files ? (Array.isArray(req.files) ? req.files.length : 1) : 0,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, error.message || 'Failed to upload files', error);
  }
};

