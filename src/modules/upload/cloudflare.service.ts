/**
 * Cloudflare Images Upload Service (Backend)
 * Handles file uploads to Cloudflare CDN
 */

import { logger } from '../../utils/logging';

interface CloudflareUploadResponse {
  success: boolean;
  result?: {
    id: string;
    filename: string;
    uploaded: string;
    requireSignedURLs: boolean;
    variants: string[];
  };
  errors?: Array<{
    code: number;
    message: string;
  }>;
}

interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  imagesApiUrl: string;
}

// Get Cloudflare configuration from environment variables
const getCloudflareConfig = (): CloudflareConfig => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
  const imagesApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare configuration is missing. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in your .env file');
  }

  return { accountId, apiToken, imagesApiUrl };
};

/**
 * Upload a single file to Cloudflare Images
 * @param fileBuffer - File buffer to upload
 * @param fileName - Original file name
 * @param mimeType - File MIME type
 * @param requireSignedURLs - Whether the image requires signed URLs (default: false)
 * @returns Promise with the uploaded image URL
 */
export const uploadImageToCloudflare = async (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  requireSignedURLs: boolean = false
): Promise<string> => {
  try {
    const config = getCloudflareConfig();
    
    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    
    if (!validImageTypes.includes(mimeType) && !validVideoTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not supported. Supported types: ${validImageTypes.join(', ')}, ${validVideoTypes.join(', ')}`);
    }

    // Validate file size (max 10MB for images, 500MB for videos)
    const maxSize = mimeType.startsWith('video/') ? 500 * 1024 * 1024 : 10 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      throw new Error(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
    }
    
    // Note: Cloudflare Images API primarily supports images
    // For videos, consider using Cloudflare Stream or R2
    // This implementation uploads videos to Images API which may have limitations

    // Create FormData using form-data package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });
    if (requireSignedURLs) {
      formData.append('requireSignedURLs', 'true');
    }

    // Upload to Cloudflare Images
    const response = await fetch(config.imagesApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    const data = await response.json() as CloudflareUploadResponse;

    if (!response.ok || !data.success) {
      const errorMessage = data.errors?.[0]?.message || `Upload failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    if (!data.result) {
      throw new Error('Upload succeeded but no result returned');
    }

    // Return the public URL (use the first variant, usually the original)
    const imageUrl = data.result.variants?.[0] || data.result.filename;
    
    return imageUrl;
  } catch (error: any) {
    logger.error('Error uploading to Cloudflare', error instanceof Error ? error : new Error(String(error)), {
      fileName,
      mimeType,
    });
    throw new Error(error.message || 'Failed to upload file to Cloudflare');
  }
};

/**
 * Upload multiple files to Cloudflare Images
 * @param files - Array of file objects with buffer, fileName, and mimeType
 * @param requireSignedURLs - Whether the images require signed URLs (default: false)
 * @returns Promise with array of uploaded image URLs
 */
export const uploadMultipleImagesToCloudflare = async (
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>,
  requireSignedURLs: boolean = false
): Promise<string[]> => {
  try {
    const uploadPromises = files.map(file => 
      uploadImageToCloudflare(file.buffer, file.fileName, file.mimeType, requireSignedURLs)
    );
    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error: any) {
    logger.error('Error uploading multiple files to Cloudflare', error instanceof Error ? error : new Error(String(error)), {
      fileCount: files.length,
    });
    throw new Error(error.message || 'Failed to upload files to Cloudflare');
  }
};

/**
 * Delete an image from Cloudflare Images
 * @param imageId - The ID of the image to delete
 */
export const deleteImageFromCloudflare = async (imageId: string): Promise<void> => {
  try {
    const config = getCloudflareConfig();
    
    const response = await fetch(`${config.imagesApiUrl}/${imageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
      },
    });

    if (!response.ok) {
      const data = await response.json() as { errors?: Array<{ message?: string }> };
      const errorMessage = data.errors?.[0]?.message || `Delete failed with status ${response.status}`;
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    logger.error('Error deleting from Cloudflare', error instanceof Error ? error : new Error(String(error)), {
      imageId,
    });
    throw new Error(error.message || 'Failed to delete file from Cloudflare');
  }
};

/**
 * Extract image ID from Cloudflare URL
 * @param url - Cloudflare image URL
 * @returns Image ID or null if not a valid Cloudflare URL
 */
export const extractImageIdFromUrl = (url: string): string | null => {
  // Cloudflare Images URLs format: https://imagedelivery.net/<account-hash>/<image-id>/<variant>
  const match = url.match(/imagedelivery\.net\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
};

export default {
  uploadImageToCloudflare,
  uploadMultipleImagesToCloudflare,
  deleteImageFromCloudflare,
  extractImageIdFromUrl,
};

