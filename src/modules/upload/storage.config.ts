/**
 * Storage Configuration
 * Cho phép chọn loại storage: cloudflare, local, hoặc both
 */

export type StorageType = 'cloudflare' | 'local' | 'both';

interface StorageConfig {
  type: StorageType;
  useCloudflare: boolean;
  useLocal: boolean;
}

/**
 * Get storage configuration from environment variables
 */
export const getStorageConfig = (): StorageConfig => {
  const storageType = (process.env.STORAGE_TYPE || 'both').toLowerCase() as StorageType;
  
  // Validate storage type
  if (!['cloudflare', 'local', 'both'].includes(storageType)) {
    console.warn(`Invalid STORAGE_TYPE: ${storageType}, defaulting to 'both'`);
    return {
      type: 'both',
      useCloudflare: true,
      useLocal: true,
    };
  }
  
  const useCloudflare = storageType === 'cloudflare' || storageType === 'both';
  const useLocal = storageType === 'local' || storageType === 'both';
  
  // Check if Cloudflare config exists if useCloudflare is true
  if (useCloudflare) {
    const hasCloudflareConfig = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
    if (!hasCloudflareConfig) {
      console.warn('STORAGE_TYPE requires Cloudflare but config is missing. Falling back to local only.');
      return {
        type: 'local',
        useCloudflare: false,
        useLocal: true,
      };
    }
  }
  
  return {
    type: storageType,
    useCloudflare,
    useLocal,
  };
};




