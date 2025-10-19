import { Router, type Request, type Response } from 'express';
import { GdownService } from '../services/gdown.js';
import { scanDirectory } from '../services/fileVerify.js';
import { TaskManager, type DownloadTask } from '../services/taskManager.js';
import type { DownloadRequest, DownloadProgress } from '../types.js';

const router = Router();

// Global instances
let gdownService: GdownService | null = null;
const taskManager = new TaskManager();

// Store progress for SSE clients
const progressClients: Response[] = [];

// Download queue
const downloadQueue: string[] = [];
let isProcessingQueue = false;

// Auto-resume pending tasks on startup
function autoResumeTasks(): void {
  const pendingTasks = taskManager.getPendingTasks();
  if (pendingTasks.length > 0) {
    console.log(`Found ${pendingTasks.length} pending tasks, resuming...`);
    pendingTasks.forEach(task => {
      downloadQueue.push(task.id);
    });
    processDownloadQueue();
  }
}

// Start auto-resume after 2 seconds (allow server to fully start)
setTimeout(autoResumeTasks, 2000);

/**
 * POST /api/download/batch
 * Start batch downloading from multiple Google Drive URLs
 */
router.post('/batch', (req: Request, res: Response) => {
  try {
    const { urls, outputDir = './downloads' }: { urls: string[]; outputDir?: string } = req.body;

    if (!urls || urls.length === 0) {
      res.status(400).json({ error: 'URLs array is required' });
      return;
    }

    // Create tasks for all URLs, but skip already completed tasks
    const tasks: DownloadTask[] = [];
    const skippedTasks: DownloadTask[] = [];

    for (const url of urls) {
      const task = taskManager.createTask(url, outputDir);

      // Check if task already exists and is completed
      if (task.status === 'completed') {
        console.log(`Skipping already completed task: ${task.id}`);
        skippedTasks.push(task);
      } else {
        tasks.push(task);
        // Add task to queue
        downloadQueue.push(task.id);
      }
    }

    // Start processing queue (don't await, let it run in background)
    if (tasks.length > 0) {
      setTimeout(() => processDownloadQueue(), 500);
    }

    res.json({
      status: 'started',
      message: `Added ${tasks.length} tasks to queue, skipped ${skippedTasks.length} completed tasks`,
      tasks,
      skippedTasks
    });
  } catch (error) {
    console.error('Error starting batch download:', error);
    res.status(500).json({
      error: 'Failed to start batch download',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/download/start
 * Start downloading from Google Drive (single URL)
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { url, outputDir = './downloads' }: DownloadRequest = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Cancel existing download if any
    if (gdownService) {
      gdownService.cancel();
    }

    // Create new gdown service
    gdownService = new GdownService();

    // Listen to progress events
    gdownService.on('progress', (progress: DownloadProgress) => {
      // Broadcast to all SSE clients
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify(progress)}\n\n`);
      });
    });

    // Listen to completion
    gdownService.on('complete', async () => {
      // Scan downloaded files
      const files = await scanDirectory(outputDir);
      
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({ 
          status: 'completed', 
          files 
        })}\n\n`);
      });
    });

    // Listen to warnings (non-fatal errors like QUOTA_EXCEEDED)
    gdownService.on('warning', (warning: string) => {
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'warning',
          warning
        })}\n\n`);
      });
    });

    // Listen to errors (fatal errors)
    gdownService.on('error', (error: string) => {
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          status: 'error',
          error
        })}\n\n`);
      });
    });

    // Start download
    gdownService.downloadFolder(url, outputDir);

    res.json({ 
      status: 'started', 
      message: 'Download started successfully' 
    });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({ 
      error: 'Failed to start download',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/download/progress
 * Server-Sent Events endpoint for real-time progress
 */
router.get('/progress', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add client to list
  progressClients.push(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);

  // If there are pending tasks, send current status
  const pendingTasks = taskManager.getPendingTasks();
  if (pendingTasks.length > 0) {
    const currentTask = pendingTasks.find(t => t.status === 'downloading');
    if (currentTask) {
      // Send task start event
      res.write(`data: ${JSON.stringify({
        type: 'task_start',
        taskId: currentTask.id,
        task: currentTask
      })}\n\n`);

      // Send current progress if available
      if (gdownService) {
        const currentProgress = gdownService.getCurrentProgress();
        if (currentProgress) {
          // Send full progress information from gdownService
          res.write(`data: ${JSON.stringify({
            type: 'progress',
            taskId: currentTask.id,
            progress: currentProgress
          })}\n\n`);
        } else if (currentTask.progress !== undefined) {
          // Fallback to task progress if gdownService progress not available
          res.write(`data: ${JSON.stringify({
            type: 'progress',
            taskId: currentTask.id,
            progress: {
              percentage: currentTask.progress,
              current: 0,
              total: 0,
              currentFile: currentTask.currentFile || '',
              status: 'downloading'
            }
          })}\n\n`);
        }
      } else if (currentTask.progress !== undefined) {
        // Fallback if no gdownService
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          taskId: currentTask.id,
          progress: {
            percentage: currentTask.progress,
            current: 0,
            total: 0,
            currentFile: currentTask.currentFile || '',
            status: 'downloading'
          }
        })}\n\n`);
      }
    }
  }

  // Remove client on disconnect
  req.on('close', () => {
    const index = progressClients.indexOf(res);
    if (index !== -1) {
      progressClients.splice(index, 1);
    }
  });
});

/**
 * POST /api/download/cancel
 * Cancel ongoing download
 */
router.post('/cancel', (_req: Request, res: Response) => {
  if (gdownService) {
    gdownService.cancel();
    gdownService = null;

    // Update all downloading tasks to cancelled
    const allTasks = taskManager.getAllTasks();
    for (const task of allTasks) {
      if (task.status === 'downloading') {
        taskManager.updateTask(task.id, {
          status: 'cancelled',
          error: 'Download cancelled by user'
        });
      }
    }

    // Reset queue processing flag
    isProcessingQueue = false;

    // Clear download queue to prevent processing remaining tasks
    downloadQueue.length = 0;

    progressClients.forEach(client => {
      client.write(`data: ${JSON.stringify({ status: 'cancelled' })}\n\n`);
    });

    res.json({ status: 'cancelled', message: 'Download cancelled' });
  } else {
    res.status(400).json({ error: 'No active download to cancel' });
  }
});

/**
 * POST /api/download/restart
 * Restart all error/downloading tasks
 */
router.post('/restart', (_req: Request, res: Response) => {
  try {
    // Cancel current download
    if (gdownService) {
      gdownService.cancel();
      gdownService = null;
    }

    // Get all tasks
    const allTasks = taskManager.getAllTasks();

    // Reset error/cancelled tasks to pending and add to queue
    let restartedCount = 0;
    for (const task of allTasks) {
      if (task.status === 'error' || task.status === 'downloading' || task.status === 'cancelled') {
        taskManager.updateTask(task.id, {
          status: 'pending',
          error: undefined
          // Don't reset progress - preserve for resume download
        });
        // Add task to download queue
        downloadQueue.push(task.id);
        restartedCount++;
      }
    }

    // Start processing tasks
    if (restartedCount > 0) {
      setTimeout(() => processDownloadQueue(), 500);
    }

    res.json({
      status: 'restarted',
      message: `Restarted ${restartedCount} tasks`,
      count: restartedCount
    });
  } catch (error) {
    console.error('Error restarting tasks:', error);
    res.status(500).json({
      error: 'Failed to restart tasks',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/download/files
 * Get list of downloaded files
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const outputDir = (req.query.dir as string) || './downloads';
    const files = await scanDirectory(outputDir);
    res.json({ files });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ 
      error: 'Failed to get files',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/download/tasks
 * Get all tasks
 */
router.get('/tasks', (_req: Request, res: Response) => {
  const tasks = taskManager.getAllTasks();
  res.json({ tasks });
});

/**
 * GET /api/download/status
 * Get current download status
 */
router.get('/status', (_req: Request, res: Response) => {
  const pendingTasks = taskManager.getPendingTasks();
  const allTasks = taskManager.getAllTasks();
  const isDownloading = isProcessingQueue || pendingTasks.length > 0;

  res.json({
    isDownloading,
    queueLength: downloadQueue.length,
    pendingTasks: allTasks, // Return all tasks including error tasks
    currentTask: pendingTasks.find(t => t.status === 'downloading')
  });
});

/**
 * DELETE /api/download/tasks/:id
 * Delete a task
 */
router.delete('/tasks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = taskManager.deleteTask(id);

  if (deleted) {
    res.json({ status: 'deleted', message: 'Task deleted successfully' });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

/**
 * Process download queue
 */
async function processDownloadQueue(): Promise<void> {
  if (isProcessingQueue || downloadQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (downloadQueue.length > 0) {
    const taskId = downloadQueue.shift();
    if (!taskId) continue;

    const task = taskManager.getTask(taskId);
    if (!task) continue;

    // Skip completed tasks
    if (task.status === 'completed') {
      console.log(`Task ${taskId} already completed, skipping`);
      continue;
    }

    // Update task status
    taskManager.updateTask(taskId, { status: 'downloading' });

    // Broadcast task start
    progressClients.forEach(client => {
      client.write(`data: ${JSON.stringify({
        type: 'task_start',
        task
      })}\n\n`);
    });

    // Download
    await downloadTask(task);
  }

  isProcessingQueue = false;
}

/**
 * Download a single task
 */
function downloadTask(task: { id: string; url: string; outputDir: string }): Promise<void> {
  return new Promise((resolve) => {
    // Cancel existing download if any
    if (gdownService) {
      gdownService.cancel();
    }

    // Create new gdown service
    gdownService = new GdownService();

    // Calculate actual output directory (includes folder ID subdirectory)
    const actualOutputDir = `${task.outputDir}/${task.id}`;

    // Listen to progress events
    gdownService.on('progress', (progress: DownloadProgress) => {
      // Update task (don't save to file for every progress update)
      taskManager.updateTask(task.id, {
        progress: progress.percentage,
        currentFile: progress.currentFile
      }, false);

      // Broadcast to all SSE clients
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'progress',
          taskId: task.id,
          progress
        })}\n\n`);
      });
    });

    // Listen to completion
    gdownService.on('complete', async () => {
      // Scan downloaded files from the actual output directory
      const files = await scanDirectory(actualOutputDir);

      // Update task
      taskManager.updateTask(task.id, {
        status: 'completed',
        progress: 100,
        completedAt: Date.now()
      });

      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'task_complete',
          taskId: task.id,
          outputDir: actualOutputDir,
          files
        })}\n\n`);
      });

      // Release gdown service to free resources
      gdownService = null;

      resolve();
    });

    // Listen to warnings (non-fatal errors like QUOTA_EXCEEDED)
    gdownService.on('warning', (warning: string) => {
      // Don't update task status - just send warning to client
      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'warning',
          taskId: task.id,
          warning
        })}\n\n`);
      });
      // Don't resolve - let the download continue
    });

    // Listen to errors (fatal errors)
    gdownService.on('error', (error: string) => {
      // Update task
      taskManager.updateTask(task.id, {
        status: 'error',
        error
      });

      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'task_error',
          taskId: task.id,
          error
        })}\n\n`);
      });

      // Release gdown service to free resources
      gdownService = null;

      resolve();
    });

    // Start download
    gdownService.downloadFolder(task.url, task.outputDir);
  });
}

export default router;

