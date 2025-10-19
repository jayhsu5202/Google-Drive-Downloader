// Type definitions for the application

export interface DownloadProgress {
  current: number;
  total: number;
  currentFile: string;
  percentage: number;
  status: 'scanning' | 'downloading' | 'completed' | 'error';
}

export interface DownloadRequest {
  url: string;
  outputDir?: string;
}

export interface FileVerification {
  filePath: string;
  hash: string;
  algorithm: 'md5' | 'sha256';
  verified: boolean;
}

export interface DownloadedFile {
  name: string;
  size: number;
  path: string;
  verified: boolean;
  hash?: string;
}

