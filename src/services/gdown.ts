import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import type { DownloadProgress } from '../types.js';

export class GdownService extends EventEmitter {
  private process: ChildProcess | null = null;

  /**
   * Download a Google Drive folder using gdown CLI
   * @param url - Google Drive folder URL or ID
   * @param outputDir - Output directory path
   */
  downloadFolder(url: string, outputDir: string = './downloads'): void {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Extract folder ID from URL if needed
    const folderId = this.extractFolderId(url);
    
    // Spawn gdown process (use python -m gdown for Windows compatibility)
    this.process = spawn('python', [
      '-m',
      'gdown',
      '--folder',
      folderId,
      '-O',
      outputDir,
      '--remaining-ok'
    ]);

    let currentFile = '';
    let current = 0;
    let total = 0;

    // Parse stdout for progress
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[gdown]', output);

      // Parse progress: "Downloading 3/10 files..."
      const progressMatch = output.match(/Downloading\s+(\d+)\/(\d+)/i);
      if (progressMatch) {
        current = parseInt(progressMatch[1], 10);
        total = parseInt(progressMatch[2], 10);
      }

      // Parse current file name
      const fileMatch = output.match(/Downloading\s+(.+?)\.{3}/i);
      if (fileMatch) {
        currentFile = fileMatch[1];
      }

      // Emit progress event
      const progress: DownloadProgress = {
        current,
        total,
        currentFile,
        percentage: total > 0 ? Math.round((current / total) * 100) : 0,
        status: 'downloading'
      };
      this.emit('progress', progress);
    });

    // Handle errors
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[gdown error]', data.toString());
      this.emit('error', data.toString());
    });

    // Handle completion
    this.process.on('close', (code: number | null) => {
      if (code === 0) {
        const progress: DownloadProgress = {
          current: total,
          total,
          currentFile: '',
          percentage: 100,
          status: 'completed'
        };
        this.emit('progress', progress);
        this.emit('complete');
      } else {
        const progress: DownloadProgress = {
          current,
          total,
          currentFile,
          percentage: 0,
          status: 'error'
        };
        this.emit('progress', progress);
        this.emit('error', `Process exited with code ${code}`);
      }
    });
  }

  /**
   * Extract folder ID from Google Drive URL
   * @param url - Google Drive URL or folder ID
   * @returns Folder ID
   */
  private extractFolderId(url: string): string {
    // If already an ID, return as is
    if (!url.includes('http')) {
      return url;
    }

    // Extract from URL: https://drive.google.com/drive/folders/{ID}
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return match[1];
    }

    // Fallback: return original URL
    return url;
  }

  /**
   * Cancel the download process
   */
  cancel(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

