import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import type { DownloadProgress } from '../types.js';

export class GdownService extends EventEmitter {
  private process: ChildProcess | null = null;
  private currentProgress: DownloadProgress | null = null;

  /**
   * Get current download progress
   * @returns Current progress or null if no download in progress
   */
  getCurrentProgress(): DownloadProgress | null {
    return this.currentProgress;
  }

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
    ], {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'  // Force UTF-8 encoding for Python output
      }
    });

    let currentFile = '';
    let current = 0;  // Number of completed files
    let total = 0;    // Total number of files
    let lastPercentage = -1;
    let fileList: string[] = [];
    let lastFileProgress = 0;  // Current file download progress (0-100)
    let scanningComplete = false;  // Track if directory scanning is complete

    // Parse stdout for progress
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString('utf8');
      console.log('[gdown stdout]', output);

      let hasUpdate = false;

      // Pattern 1: "Building directory structure completed"
      // This marks the end of scanning phase
      if (output.includes('Building directory structure completed')) {
        console.log('[gdown] Directory structure built, starting file processing');
        scanningComplete = true;
        hasUpdate = true;
      }

      // Pattern 2: "Processing file <id> <filename>"
      // This indicates a new file is being discovered
      const processingMatch = output.match(/Processing file\s+\S+\s+(.+)/i);
      if (processingMatch) {
        const newFile = processingMatch[1].trim();

        // Add to file list if not already there
        if (!fileList.includes(newFile)) {
          fileList.push(newFile);
          total = fileList.length;
          hasUpdate = true;
          console.log(`[gdown] Found file: ${newFile}, total: ${total}`);
        }

        // Update current file being processed (but don't increment current yet)
        if (newFile !== currentFile) {
          currentFile = newFile;
          lastFileProgress = 0; // Reset file progress for new file
          hasUpdate = true;
        }
      }

      // Pattern 3: Progress bar (e.g., "100%|████████| 1.23M/1.23M")
      // This shows the download progress of the current file
      const barMatch = output.match(/(\d+)%\|/);
      if (barMatch) {
        const fileProgress = parseInt(barMatch[1], 10);

        // If we see a progress bar, scanning must be complete
        // (gdown might not output "Building directory structure completed" for small folders)
        if (!scanningComplete) {
          console.log('[gdown] Progress bar detected, marking scanning as complete');
          scanningComplete = true;
          hasUpdate = true;
        }

        // Only update if progress changed
        if (fileProgress !== lastFileProgress) {
          lastFileProgress = fileProgress;
          hasUpdate = true;
          console.log(`[gdown] File progress: ${fileProgress}%`);
        }
      }

      // Pattern 4: "Done."
      // This indicates a file download completed successfully
      if (output.includes('Done.')) {
        console.log(`[gdown] File completed: ${currentFile}`);
        current++;
        lastFileProgress = 0; // Reset for next file
        hasUpdate = true;
      }

      // Calculate overall progress
      let percentage = 0;
      let status: 'scanning' | 'downloading' | 'completed' = 'downloading';

      if (!scanningComplete) {
        // Still scanning - don't calculate percentage yet
        percentage = 0;
        status = 'scanning';
      } else if (current === total && total > 0) {
        // All files completed
        percentage = 100;
        status = 'completed';
      } else if (total > 0) {
        // Downloading - calculate progress
        // Progress = (completed files + current file progress) / total files
        // Limit current file progress to 0.99 to avoid showing 100% prematurely
        const currentFileProgressFraction = Math.min(lastFileProgress / 100, 0.99);
        const overallProgress = (current + currentFileProgressFraction) / total;
        // Cap at 99% until all files are actually completed
        percentage = Math.min(Math.round(overallProgress * 100), 99);
        status = 'downloading';
      }

      // Only emit if there's an update
      if (hasUpdate || percentage !== lastPercentage) {
        lastPercentage = percentage;
        const progress: DownloadProgress = {
          current,
          total,
          currentFile,
          percentage,
          status
        };
        this.currentProgress = progress;  // Save current progress
        this.emit('progress', progress);
      }
    });

    // Handle errors and progress info (gdown outputs everything to stderr)
    let errorBuffer = '';

    this.process.stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString('utf8');
      console.error('[gdown stderr]', errorText);

      // Accumulate error messages
      errorBuffer += errorText;

      let hasUpdate = false;

      // Pattern: Progress bar (e.g., "21%|██▏       | 1.73G/8.09G")
      // gdown outputs progress bars to stderr, not stdout
      const barMatch = errorText.match(/(\d+)%\|/);
      if (barMatch) {
        const fileProgress = parseInt(barMatch[1], 10);

        // If we see a progress bar, scanning must be complete
        if (!scanningComplete) {
          console.log('[gdown] Progress bar detected, marking scanning as complete');
          scanningComplete = true;
          hasUpdate = true;
        }

        // Only update if progress changed
        if (fileProgress !== lastFileProgress) {
          lastFileProgress = fileProgress;
          hasUpdate = true;
          console.log(`[gdown] File progress: ${fileProgress}%`);
        }
      }

      // Pattern: "Skipping already downloaded file <path>"
      // This indicates a file was already downloaded and is being skipped
      const skippingMatch = errorText.match(/Skipping already downloaded file\s+(.+)/i);
      if (skippingMatch) {
        const filePath = skippingMatch[1].trim();
        const fileName = filePath.split(/[/\\]/).pop() || filePath;

        // Add to file list if not already there
        if (!fileList.includes(fileName)) {
          fileList.push(fileName);
          total = fileList.length;
        }

        // Mark as skipped and increment completed count
        if (fileName !== currentFile) {
          currentFile = `[已跳過] ${fileName}`;
          current++;
          lastFileProgress = 0; // Reset for next file
          hasUpdate = true;
          console.log(`[gdown] File skipped: ${fileName}, current: ${current}/${total}`);
        }
      }

      // Pattern: "Download completed"
      // This indicates all files have been processed
      if (errorText.includes('Download completed')) {
        console.log('[gdown] Download completed detected, current:', current, 'total:', total);
        // Ensure current matches total
        if (total > 0 && current < total) {
          current = total;
          hasUpdate = true;
        }
      }

      // Emit progress update if needed
      if (hasUpdate) {
        // Use consistent progress calculation
        let percentage = 0;
        let status: 'scanning' | 'downloading' | 'completed' = 'downloading';

        if (!scanningComplete) {
          percentage = 0;
          status = 'scanning';
        } else if (current === total && total > 0) {
          percentage = 100;
          status = 'completed';
        } else if (total > 0) {
          const currentFileProgressFraction = Math.min(lastFileProgress / 100, 0.99);
          const overallProgress = (current + currentFileProgressFraction) / total;
          percentage = Math.min(Math.round(overallProgress * 100), 99);
          status = 'downloading';
        }

        const progress: DownloadProgress = {
          current,
          total,
          currentFile,
          percentage,
          status
        };
        this.currentProgress = progress;  // Save current progress
        this.emit('progress', progress);
      }

      // Check for quota/rate limit errors (emit as warning, not error)
      // Don't stop the download - user might update cookies
      if (errorText.includes('Too many users have viewed or downloaded')) {
        this.emit('warning', 'QUOTA_EXCEEDED:Google Drive 流量限制：請更新 Cookie 或等待 24 小時後重試');
      }
      // Check for permission errors (emit as warning, not error)
      else if (errorText.includes('Failed to retrieve file url') ||
               errorText.includes('Cannot retrieve the public link')) {
        this.emit('warning', 'PERMISSION_DENIED:無法存取檔案：請檢查連結權限是否設為「知道連結的任何人」');
      }
    });

    // Handle completion
    this.process.on('close', (code: number | null) => {
      // If exit code is null, process was killed (cancelled)
      // Don't emit complete or error - just stop
      if (code === null) {
        console.log('[gdown] Process was cancelled');
        this.process = null;  // Clean up process reference
        return;
      }

      // Check if all files were downloaded successfully
      const allFilesDownloaded = total > 0 && current === total;

      // Check if there were quota or permission errors
      const hasQuotaError = errorBuffer.includes('Too many users have viewed or downloaded');
      const hasPermissionError = errorBuffer.includes('Failed to retrieve') ||
                                 errorBuffer.includes('Cannot retrieve the public link');

      // If all files downloaded AND no quota/permission errors, treat as success
      // If there were quota/permission errors, treat as error even if all files downloaded
      // (user might want to retry with updated cookies)
      if (code === 0 || (allFilesDownloaded && !hasQuotaError && !hasPermissionError)) {
        const progress: DownloadProgress = {
          current: total,
          total,
          currentFile: '',
          percentage: 100,
          status: 'completed'
        };
        this.emit('progress', progress);
        this.emit('complete');

        // Log if completed despite non-zero exit code
        if (code !== 0 && allFilesDownloaded) {
          console.log(`[gdown] All files downloaded successfully despite exit code ${code}`);
        }
      } else {
        const progress: DownloadProgress = {
          current,
          total,
          currentFile,
          percentage: 0,
          status: 'error'
        };
        this.emit('progress', progress);

        // Determine error type and message
        let errorMessage = `Process exited with code ${code}`;

        if (errorBuffer.includes('Too many users have viewed or downloaded')) {
          errorMessage = 'QUOTA_EXCEEDED:Google Drive 流量限制：請建立副本或等待 24 小時後重試';
        } else if (errorBuffer.includes('Failed to retrieve') ||
                   errorBuffer.includes('Cannot retrieve the public link')) {
          errorMessage = 'PERMISSION_DENIED:無法存取檔案：請檢查連結權限是否設為「知道連結的任何人」';
        } else if (errorBuffer) {
          errorMessage = errorBuffer;
        }

        this.emit('error', errorMessage);
      }

      // Clean up process reference after completion or error
      this.process = null;
      console.log('[gdown] Process reference cleaned up');
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
    this.currentProgress = null;  // Clear progress
    this.removeAllListeners();    // Clean up event listeners to prevent memory leaks
  }
}

