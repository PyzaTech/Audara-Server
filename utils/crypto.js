const crypto = require('crypto');

function encryptMessage(message, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), data: encrypted.toString('base64') });
}

function decryptMessage(encrypted, key) {
  try {
    const data = JSON.parse(encrypted);
    const iv = Buffer.from(data.iv, 'base64');
    const encryptedText = Buffer.from(data.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('❌ Decryption error:', err.message);
    return null;
  }
}

function generateSessionKey() {
  return crypto.randomBytes(32);
}

module.exports = { encryptMessage, decryptMessage, generateSessionKey }; 