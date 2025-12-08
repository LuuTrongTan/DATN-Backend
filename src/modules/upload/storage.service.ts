/**
 * Storage Service - Tổng hợp xử lý upload theo config
 * Hỗ trợ: cloudflare, local, hoặc both
 */

import { getStorageConfig } from './storage.config';
import { uploadImageToCloudflare, uploadMultipleImagesToCloudflare } from './cloudflare.service';
import { saveFileToLocal, saveMultipleFilesToLocal } from './localStorage.service';

interface UploadResult {
  url: string | null;
  cloudflareUrl: string | null;
  localUrl: string | null;
}

interface MultipleUploadResult {
  urls: string[];
  cloudflareUrls: string[] | null;
  localUrls: string[] | null;
}

/**
 * Upload single file theo storage config
 */
export const uploadFile = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> => {
  const config = getStorageConfig();
  const result: UploadResult = {
    url: null,
    cloudflareUrl: null,
    localUrl: null,
  };

  // Upload to Cloudflare (nếu được config)
  if (config.useCloudflare) {
    try {
      result.cloudflareUrl = await uploadImageToCloudflare(buffer, fileName, mimeType);
      result.url = result.cloudflareUrl; // Ưu tiên Cloudflare URL
    } catch (error: any) {
      console.error('Cloudflare upload failed:', error.message);
      // Nếu chỉ dùng Cloudflare và fail thì throw error
      if (!config.useLocal) {
        throw new Error(`Cloudflare upload failed: ${error.message}`);
      }
    }
  }

  // Save to Local (nếu được config)
  if (config.useLocal) {
    try {
      result.localUrl = await saveFileToLocal(buffer, fileName, mimeType);
      // Nếu Cloudflare fail hoặc không dùng, dùng Local URL
      if (!result.url) {
        result.url = result.localUrl;
      }
    } catch (error: any) {
      console.error('Local storage save failed:', error.message);
      // Nếu chỉ dùng Local và fail thì throw error
      if (!config.useCloudflare || !result.cloudflareUrl) {
        throw new Error(`Local storage save failed: ${error.message}`);
      }
    }
  }

  if (!result.url) {
    throw new Error('Failed to upload file to any storage');
  }

  return result;
};

/**
 * Upload multiple files theo storage config
 */
export const uploadMultipleFiles = async (
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>
): Promise<MultipleUploadResult> => {
  const config = getStorageConfig();
  const result: MultipleUploadResult = {
    urls: [],
    cloudflareUrls: null,
    localUrls: null,
  };

  // Upload to Cloudflare (nếu được config)
  if (config.useCloudflare) {
    try {
      result.cloudflareUrls = await uploadMultipleImagesToCloudflare(files);
      result.urls = result.cloudflareUrls; // Ưu tiên Cloudflare URLs
    } catch (error: any) {
      console.error('Cloudflare upload failed:', error.message);
      // Nếu chỉ dùng Cloudflare và fail thì throw error
      if (!config.useLocal) {
        throw new Error(`Cloudflare upload failed: ${error.message}`);
      }
    }
  }

  // Save to Local (nếu được config)
  if (config.useLocal) {
    try {
      result.localUrls = await saveMultipleFilesToLocal(files);
      // Nếu Cloudflare fail hoặc không dùng, dùng Local URLs
      if (result.urls.length === 0) {
        result.urls = result.localUrls;
      }
    } catch (error: any) {
      console.error('Local storage save failed:', error.message);
      // Nếu chỉ dùng Local và fail thì throw error
      if (!config.useCloudflare || !result.cloudflareUrls || result.cloudflareUrls.length === 0) {
        throw new Error(`Local storage save failed: ${error.message}`);
      }
    }
  }

  if (result.urls.length === 0) {
    throw new Error('Failed to upload files to any storage');
  }

  return result;
};

