import { Response } from 'express';
import multer from 'multer';
import { uploadFile, uploadMultipleFiles } from './storage.service';
import { AuthRequest } from '../../types/request.types';

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
      return res.status(400).json({ 
        success: false,
        message: 'No file provided' 
      });
    }

    const { buffer, originalname, mimetype } = req.file;
    
    // Upload file theo storage config (cloudflare, local, hoặc both)
    const uploadResult = await uploadFile(buffer, originalname, mimetype);

    res.json({
      success: true,
      data: {
        url: uploadResult.url,
        cloudflareUrl: uploadResult.cloudflareUrl,
        localUrl: uploadResult.localUrl,
        fileName: originalname,
        mimeType: mimetype,
      },
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file',
    });
  }
};

// Multer middleware for multiple files
export const uploadMultipleMiddleware = upload.array('files', 10); // Max 10 files

// Multiple files upload handler
export const uploadMultiple = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      return res.status(400).json({ 
        success: false,
        message: 'No files provided' 
      });
    }

    const files = Array.isArray(req.files) ? req.files : [req.files];
    
    const uploadData = files.map(file => ({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    }));

    // Upload files theo storage config (cloudflare, local, hoặc both)
    const uploadResult = await uploadMultipleFiles(uploadData);

    res.json({
      success: true,
      data: {
        urls: uploadResult.urls,
        cloudflareUrls: uploadResult.cloudflareUrls,
        localUrls: uploadResult.localUrls,
        count: uploadResult.urls.length,
      },
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload files',
    });
  }
};

