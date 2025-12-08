/**
 * Local Storage Service - Lưu file vào local storage
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface LocalStorageConfig {
  uploadDir: string;
  baseUrl: string;
}

// Get configuration from environment variables
const getLocalStorageConfig = (): LocalStorageConfig => {
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const baseUrl = process.env.BASE_URL || 'http://localhost:3004';
  
  // Ensure upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  // Create subdirectories for images and videos
  const imagesDir = path.join(uploadDir, 'images');
  const videosDir = path.join(uploadDir, 'videos');
  
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  
  return { uploadDir, baseUrl };
};

/**
 * Generate unique filename
 */
const generateFileName = (originalName: string): string => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const timestamp = Date.now();
  const uuid = uuidv4().substring(0, 8);
  return `${baseName}-${timestamp}-${uuid}${ext}`;
};

/**
 * Save file to local storage
 * @param fileBuffer - File buffer to save
 * @param fileName - Original file name
 * @param mimeType - File MIME type
 * @returns Promise with the file URL
 */
export const saveFileToLocal = async (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> => {
  try {
    const config = getLocalStorageConfig();
    
    // Determine subdirectory based on file type
    const isVideo = mimeType.startsWith('video/');
    const subDir = isVideo ? 'videos' : 'images';
    const targetDir = path.join(config.uploadDir, subDir);
    
    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Generate unique filename
    const uniqueFileName = generateFileName(fileName);
    const filePath = path.join(targetDir, uniqueFileName);
    
    // Write file to disk
    fs.writeFileSync(filePath, fileBuffer);
    
    // Return public URL
    const publicUrl = `${config.baseUrl}/uploads/${subDir}/${uniqueFileName}`;
    
    return publicUrl;
  } catch (error: any) {
    console.error('Error saving file to local storage:', error);
    throw new Error(error.message || 'Failed to save file to local storage');
  }
};

/**
 * Save multiple files to local storage
 * @param files - Array of file objects with buffer, fileName, and mimeType
 * @returns Promise with array of file URLs
 */
export const saveMultipleFilesToLocal = async (
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>
): Promise<string[]> => {
  try {
    const savePromises = files.map(file => 
      saveFileToLocal(file.buffer, file.fileName, file.mimeType)
    );
    const urls = await Promise.all(savePromises);
    return urls;
  } catch (error: any) {
    console.error('Error saving multiple files to local storage:', error);
    throw new Error(error.message || 'Failed to save files to local storage');
  }
};

/**
 * Delete file from local storage
 * @param fileUrl - File URL to delete
 */
export const deleteFileFromLocal = async (fileUrl: string): Promise<void> => {
  try {
    const config = getLocalStorageConfig();
    
    // Extract file path from URL
    // URL format: http://localhost:3004/uploads/images/filename.jpg
    const urlParts = fileUrl.split('/uploads/');
    if (urlParts.length < 2) {
      throw new Error('Invalid file URL');
    }
    
    const relativePath = urlParts[1];
    const filePath = path.join(config.uploadDir, relativePath);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    } else {
      console.warn(`File not found: ${filePath}`);
    }
  } catch (error: any) {
    console.error('Error deleting file from local storage:', error);
    throw new Error(error.message || 'Failed to delete file from local storage');
  }
};

/**
 * Get file path from URL
 * @param fileUrl - File URL
 * @returns File path or null if invalid
 */
export const getFilePathFromUrl = (fileUrl: string): string | null => {
  try {
    const config = getLocalStorageConfig();
    const urlParts = fileUrl.split('/uploads/');
    if (urlParts.length < 2) {
      return null;
    }
    const relativePath = urlParts[1];
    return path.join(config.uploadDir, relativePath);
  } catch (error) {
    return null;
  }
};

export default {
  saveFileToLocal,
  saveMultipleFilesToLocal,
  deleteFileFromLocal,
  getFilePathFromUrl,
};

