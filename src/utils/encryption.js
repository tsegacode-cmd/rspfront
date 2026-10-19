/**
 * Simple encryption utility for sensitive data
 * Uses Base64 encoding with a simple XOR cipher
 * Note: For production, consider using Web Crypto API or a proper encryption library
 */

const SECRET_KEY = 'RedSeaBrokerage2024';

/**
 * Encrypt data
 */
export function encrypt(data) {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    let encrypted = '';
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      encrypted += String.fromCharCode(charCode);
    }
    
    return btoa(encrypted);
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

/**
 * Decrypt data
 */
export function decrypt(encryptedData) {
  try {
    const encrypted = atob(encryptedData);
    let decrypted = '';
    
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      decrypted += String.fromCharCode(charCode);
    }
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Hash data (one-way)
 */
export function hash(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = 0;
  
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return hash.toString(36);
}
