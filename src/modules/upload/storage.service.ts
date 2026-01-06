/**
 * Storage Service - Xử lý upload file qua server (local storage)
 */

import { getStorageConfig } from './storage.config';
import { saveFileToLocal, saveMultipleFilesToLocal } from './localStorage.service';
import { logger } from '../../utils/logging';

interface UploadResult {
  url: string;
  localUrl: string;
}

interface MultipleUploadResult {
  urls: string[];
  localUrls: string[];
}

/**
 * Upload single file qua server (local storage)
 */
export const uploadFile = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> => {
  const config = getStorageConfig();
  
  if (!config.useLocal) {
    throw new Error('Local storage is not configured');
  }

  try {
    const localUrl = await saveFileToLocal(buffer, fileName, mimeType);
    
    return {
      url: localUrl,
      localUrl: localUrl,
    };
  } catch (error: any) {
    logger.error('Local storage save failed', error instanceof Error ? error : new Error(String(error)), {
      fileName,
      mimeType,
    });
    throw new Error(`Local storage save failed: ${error.message}`);
  }
};

/**
 * Upload multiple files qua server (local storage)
 */
export const uploadMultipleFiles = async (
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>
): Promise<MultipleUploadResult> => {
  const config = getStorageConfig();
  
  if (!config.useLocal) {
    throw new Error('Local storage is not configured');
  }

  try {
    const localUrls = await saveMultipleFilesToLocal(files);
    
    return {
      urls: localUrls,
      localUrls: localUrls,
    };
  } catch (error: any) {
    logger.error('Local storage save failed', error instanceof Error ? error : new Error(String(error)), {
      fileCount: files.length,
    });
    throw new Error(`Local storage save failed: ${error.message}`);
  }
};




