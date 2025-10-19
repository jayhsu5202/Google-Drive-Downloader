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

    // Create a unique subfolder for this download using folder ID
    // This prevents files from different folders mixing together
    const folderOutputDir = `${outputDir}/${folderId}`;

    // Spawn gdown process (use python -m gdown for Windows compatibility)
    // gdown will download files into the specified directory
    this.process = spawn('python', [
      '-m',
      'gdown',
      '--folder',
      folderId,
      '-O',
      folderOutputDir,
      '--remaining-ok',
      '--continue'  // Enable resume for partially-downloaded files
    ]);

    let currentFile = '';
    let current = 0;
    let total = 0;
    let lastPercentage = -1;

    // Parse stdout for progress
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('[gdown stdout]', output);

      let hasUpdate = false;

      // Parse different gdown output patterns
      // Pattern 1: "Downloading 3/10 files..."
      const progressMatch = output.match(/Downloading\s+(\d+)\/(\d+)/i);
      if (progressMatch) {
        const newCurrent = parseInt(progressMatch[1], 10);
        const newTotal = parseInt(progressMatch[2], 10);
        if (newCurrent !== current || newTotal !== total) {
          current = newCurrent;
          total = newTotal;
          hasUpdate = true;
        }
      }

      // Pattern 2: "Downloading... <filename>"
      const fileMatch = output.match(/Downloading\.\.\.\s+(.+)/i);
      if (fileMatch) {
        const newFile = fileMatch[1].trim();
        if (newFile !== currentFile) {
          currentFile = newFile;
          current++;
          hasUpdate = true;
        }
      }

      // Pattern 3: "From: <url>"
      const fromMatch = output.match(/From:\s+https:\/\/drive\.google\.com/i);
      if (fromMatch) {
        // File download started
        if (total === 0) {
          total = 1; // At least one file
          hasUpdate = true;
        }
      }

      // Pattern 4: Progress bar (e.g., "100%|████████| 1.23M/1.23M")
      const barMatch = output.match(/(\d+)%\|/);
      if (barMatch) {
        const fileProgress = parseInt(barMatch[1], 10);
        console.log(`[gdown] File progress: ${fileProgress}%`);
      }

      // Only emit if there's an update
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      if (hasUpdate || percentage !== lastPercentage) {
        lastPercentage = percentage;
        const progress: DownloadProgress = {
          current,
          total,
          currentFile,
          percentage,
          status: 'downloading'
        };
        this.emit('progress', progress);
      }
    });

    // Handle errors
    let errorBuffer = '';
    this.process.stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString();
      console.error('[gdown error]', errorText);

      // Accumulate error messages
      errorBuffer += errorText;

      // Check for critical errors that should stop the download
      if (errorText.includes('Failed to retrieve file url') ||
          errorText.includes('Cannot retrieve the public link')) {
        this.emit('error', '無法存取檔案：請檢查連結權限是否設為「知道連結的任何人」');
      }
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

        // Use accumulated error message if available
        const errorMessage = errorBuffer.includes('Failed to retrieve')
          ? '無法存取檔案：請檢查連結權限是否設為「知道連結的任何人」'
          : errorBuffer || `Process exited with code ${code}`;

        this.emit('error', errorMessage);
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

