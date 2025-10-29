const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { base64ToBuffer } = require('../utils/imageUtils');

/**
 * Generate a temporary URL for a base64 image
 * @param {string} base64Image - The base64 image data URL
 * @param {Map} tempUrls - The temporary URLs storage Map
 * @param {number} expiryMinutes - How long the URL should be valid (default: 4 minutes)
 * @returns {string} - Temporary URL path
 */
function generateTemporaryImageUrl(base64Image, tempUrls, expiryMinutes = 4) {
  if (!base64Image) return null;
  
  // Generate a unique ID like songs do
  const tempId = uuidv4();
  
  // Create URL path like songs: /image/${tempId}.jpg
  const imageType = getImageTypeFromBase64(base64Image);
  const tempUrl = `/image/${tempId}.${imageType}`;
  
  // Store in tempUrls with expiry (4 minutes = 240000ms like songs)
  const expiresAt = Date.now() + (expiryMinutes * 60 * 1000);
  tempUrls.set(`${tempId}.${imageType}`, { 
    imageData: base64Image, 
    expiresAt: expiresAt 
  });
  
  return tempUrl;
}

/**
 * Extract image type from base64 data URL
 * @param {string} base64Image - The base64 image data URL
 * @returns {string} - Image file extension (jpg, png, gif, webp)
 */
function getImageTypeFromBase64(base64Image) {
  const match = base64Image.match(/^data:image\/([^;]+);base64,/);
  if (!match) return 'jpg'; // Default fallback
  
  const mimeType = match[1].toLowerCase();
  
  // Map MIME types to file extensions
  const typeMap = {
    'jpeg': 'jpg',
    'jpg': 'jpg',
    'png': 'png',
    'gif': 'gif',
    'webp': 'webp'
  };
  
  return typeMap[mimeType] || 'jpg';
}

/**
 * Get image data from a temporary URL token
 * @param {string} token - The temporary URL token
 * @param {Map} tempUrls - The temporary URLs storage Map
 * @returns {Object|null} - Image data object or null if expired/invalid
 */
function getImageFromTemporaryUrl(token, tempUrls) {
  if (!token || !tempUrls.has(token)) {
    return null;
  }
  
  const imageData = tempUrls.get(token);
  
  // Check if expired
  if (Date.now() > imageData.expiresAt) {
    tempUrls.delete(token);
    return null;
  }
  
  return imageData.imageData;
}



/**
 * Get image buffer and metadata from base64 data
 * @param {string} base64Image - The base64 image data URL
 * @returns {Object|null} - Object with buffer, mimeType, and size, or null if invalid
 */
function getImageBuffer(base64Image) {
  if (!base64Image) return null;
  
  try {
    // Extract MIME type and base64 data
    const match = base64Image.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    
    const [, mimeType, base64Data] = match;
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    return {
      buffer,
      mimeType,
      size: buffer.length
    };
  } catch (error) {
    console.error('❌ Error converting base64 to buffer:', error.message);
    return null;
  }
}

/**
 * Convert base64 image to temporary URL for playlists
 * @param {string} base64Image - The base64 image data URL
 * @param {Map} tempUrls - The temporary URLs storage Map
 * @returns {string|null} - Temporary URL path or null if no image
 */
function convertPlaylistImageToUrl(base64Image, tempUrls) {
  if (!base64Image) return null;
  return generateTemporaryImageUrl(base64Image, tempUrls, 4); // 4 minutes expiry like songs
}

/**
 * Convert base64 image to temporary URL for songs
 * @param {string} base64Image - The base64 image data URL
 * @param {Map} tempUrls - The temporary URLs storage Map
 * @returns {string|null} - Temporary URL path or null if no image
 */
function convertSongImageToUrl(base64Image, tempUrls) {
  if (!base64Image) return null;
  return generateTemporaryImageUrl(base64Image, tempUrls, 4); // 4 minutes expiry like songs
}

module.exports = {
  generateTemporaryImageUrl,
  getImageFromTemporaryUrl,
  getImageBuffer,
  convertPlaylistImageToUrl,
  convertSongImageToUrl
};
