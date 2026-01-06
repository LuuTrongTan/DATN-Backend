/**
 * Storage Configuration
 * Chỉ hỗ trợ local storage (upload qua server)
 */

interface StorageConfig {
  useLocal: boolean;
}

/**
 * Get storage configuration
 * Luôn trả về local storage
 */
export const getStorageConfig = (): StorageConfig => {
  return {
    useLocal: true,
  };
};




