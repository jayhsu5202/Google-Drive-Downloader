import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { FileVerification, DownloadedFile } from '../types.js';

/**
 * Calculate file hash (MD5 or SHA256)
 * @param filePath - Path to the file
 * @param algorithm - Hash algorithm ('md5' or 'sha256')
 * @returns Promise<string> - Hex hash string
 */
export async function calculateFileHash(
  filePath: string,
  algorithm: 'md5' | 'sha256' = 'md5'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data: string | Buffer) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Verify file integrity by comparing hash
 * @param filePath - Path to the file
 * @param expectedHash - Expected hash value
 * @param algorithm - Hash algorithm ('md5' or 'sha256')
 * @returns Promise<FileVerification> - Verification result
 */
export async function verifyFile(
  filePath: string,
  expectedHash: string,
  algorithm: 'md5' | 'sha256' = 'md5'
): Promise<FileVerification> {
  try {
    const actualHash = await calculateFileHash(filePath, algorithm);
    const verified = actualHash === expectedHash.toLowerCase();

    return {
      filePath,
      hash: actualHash,
      algorithm,
      verified
    };
  } catch (error) {
    console.error(`Error verifying file ${filePath}:`, error);
    return {
      filePath,
      hash: '',
      algorithm,
      verified: false
    };
  }
}

/**
 * Get file information including size and hash
 * @param filePath - Path to the file
 * @param calculateHash - Whether to calculate hash (default: true)
 * @returns Promise<DownloadedFile> - File information
 */
export async function getFileInfo(
  filePath: string,
  calculateHash: boolean = true
): Promise<DownloadedFile> {
  try {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    let hash: string | undefined;
    if (calculateHash) {
      hash = await calculateFileHash(filePath, 'md5');
    }

    return {
      name: fileName,
      size: stats.size,
      path: filePath,
      verified: false,
      hash
    };
  } catch (error) {
    console.error(`Error getting file info for ${filePath}:`, error);
    throw error;
  }
}

/**
 * Scan directory and get all files with their info (recursively)
 * @param dirPath - Directory path
 * @returns Promise<DownloadedFile[]> - Array of file information
 */
export async function scanDirectory(dirPath: string): Promise<DownloadedFile[]> {
  try {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const files = fs.readdirSync(dirPath);
    const fileInfoPromises: Promise<DownloadedFile>[] = [];

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stats = fs.statSync(fullPath);

      if (stats.isFile()) {
        // Add file to list
        fileInfoPromises.push(getFileInfo(fullPath));
      } else if (stats.isDirectory()) {
        // Recursively scan subdirectory
        const subFiles = await scanDirectory(fullPath);
        fileInfoPromises.push(...subFiles.map(f => Promise.resolve(f)));
      }
    }

    return await Promise.all(fileInfoPromises);
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
    return [];
  }
}

