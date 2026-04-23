/**
 * Crypto Utility Module
 * Handles API key encryption and decryption using AES-256-GCM
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Derive encryption key from machine-specific identifier
 * Uses a combination of machine ID and app-specific salt
 */
function getMachineKey(): Buffer {
  // Use a combination of environment variables for machine-specific key
  const machineId = [
    process.env.COMPUTERNAME || process.env.HOSTNAME || 'default',
    process.env.USERNAME || process.env.USER || 'user',
    process.env.USERPROFILE || process.env.HOME || '/home',
  ].join('-');

  // Derive key using scrypt
  return scryptSync(machineId, 'moliu-ai-providers-v1', KEY_LENGTH, {
    N: 2 ** 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024, // 64MB
  });
}

/**
 * Encrypt a plaintext string
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (base64)
 */
export function encrypt(plaintext: string): string {
  const key = getMachineKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();

  // Combine: iv:authTag:ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * @param encryptedData - The encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedData: string): string {
  const key = getMachineKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a string appears to be encrypted
 * @param value - The string to check
 * @returns true if the string looks like encrypted data
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  try {
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Encrypt API key if not already encrypted
 * @param apiKey - The API key to encrypt
 * @returns Encrypted API key
 */
export function encryptApiKey(apiKey: string): string {
  if (isEncrypted(apiKey)) {
    return apiKey; // Already encrypted
  }
  return encrypt(apiKey);
}

/**
 * Decrypt API key if encrypted
 * @param apiKey - The API key (encrypted or plain)
 * @returns Decrypted API key
 */
export function decryptApiKey(apiKey: string): string {
  if (!apiKey) return '';
  
  if (isEncrypted(apiKey)) {
    try {
      return decrypt(apiKey);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return apiKey; // Return as-is if decryption fails
    }
  }
  return apiKey;
}
