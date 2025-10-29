/**
 * Utility functions for handling base64 images
 */

/**
 * Validates a base64 image data URL
 * @param {string} imageData - The base64 image data URL
 * @returns {Object} - Validation result with isValid boolean and error message
 */
function validateBase64Image(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    return { isValid: false, error: 'Image must be a string' };
  }

  // Check if it's a valid data URL
  if (!imageData.startsWith('data:image/')) {
    return { isValid: false, error: 'Image must be a valid base64 data URL starting with "data:image/"' };
  }

  // Extract base64 part and validate
  const base64Match = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  if (!base64Match) {
    return { isValid: false, error: 'Invalid base64 image format' };
  }

  const [, imageType, base64Data] = base64Match;
  
  // Validate image type
  const validTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  if (!validTypes.includes(imageType.toLowerCase())) {
    return { 
      isValid: false, 
      error: `Unsupported image type: ${imageType}. Supported types: ${validTypes.join(', ')}` 
    };
  }

  // Validate base64 data length (reasonable size limit)
  if (base64Data.length > 5000000) { // ~3.75MB limit
    return { 
      isValid: false, 
      error: 'Image too large. Maximum size is approximately 3.75MB' 
    };
  }

  // Validate base64 data format
  try {
    Buffer.from(base64Data, 'base64');
  } catch (error) {
    return { isValid: false, error: 'Invalid base64 data' };
  }

  return { isValid: true };
}

/**
 * Extracts image information from a base64 data URL
 * @param {string} imageData - The base64 image data URL
 * @returns {Object|null} - Image info object or null if invalid
 */
function extractImageInfo(imageData) {
  const validation = validateBase64Image(imageData);
  if (!validation.isValid) {
    return null;
  }

  const base64Match = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  const [, imageType, base64Data] = base64Match;
  
  // Calculate approximate file size (base64 is ~33% larger than binary)
  const approximateSizeBytes = Math.ceil((base64Data.length * 3) / 4);
  
  return {
    type: imageType.toLowerCase(),
    base64Data: base64Data,
    sizeBytes: approximateSizeBytes,
    sizeKB: Math.round(approximateSizeBytes / 1024 * 100) / 100,
    sizeMB: Math.round(approximateSizeBytes / (1024 * 1024) * 100) / 100
  };
}

/**
 * Converts a base64 image to a Buffer
 * @param {string} imageData - The base64 image data URL
 * @returns {Buffer|null} - Buffer containing image data or null if invalid
 */
function base64ToBuffer(imageData) {
  const validation = validateBase64Image(imageData);
  if (!validation.isValid) {
    return null;
  }

  const base64Match = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  const [, , base64Data] = base64Match;
  
  try {
    return Buffer.from(base64Data, 'base64');
  } catch (error) {
    return null;
  }
}

/**
 * Checks if an image is within size limits
 * @param {string} imageData - The base64 image data URL
 * @param {number} maxSizeMB - Maximum size in MB (default: 3.75)
 * @returns {boolean} - True if within limits
 */
function isImageWithinSizeLimit(imageData, maxSizeMB = 3.75) {
  const validation = validateBase64Image(imageData);
  if (!validation.isValid) {
    return false;
  }

  const base64Match = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  const [, , base64Data] = base64Match;
  
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const approximateSizeBytes = Math.ceil((base64Data.length * 3) / 4);
  
  return approximateSizeBytes <= maxSizeBytes;
}

/**
 * Gets supported image types
 * @returns {Array} - Array of supported image MIME types
 */
function getSupportedImageTypes() {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
}

/**
 * Gets supported image file extensions
 * @returns {Array} - Array of supported file extensions
 */
function getSupportedImageExtensions() {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
}

module.exports = {
  validateBase64Image,
  extractImageInfo,
  base64ToBuffer,
  isImageWithinSizeLimit,
  getSupportedImageTypes,
  getSupportedImageExtensions
};
