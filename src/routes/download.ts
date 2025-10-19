import { Router, type Request, type Response } from 'express';
import { GdownService } from '../services/gdown.js';
import { scanDirectory } from '../services/fileVerify.js';
import { TaskManager, type DownloadTask } from '../services/taskManager.js';
import { ConfigManager } from '../services/configManager.js';
import type { DownloadProgress } from '../types.js';

const router = Router();

// Global instances
const taskManager = new TaskManager();
const configManager = new ConfigManager();

// Store progress for SSE clients
const progressClients: Response[] = [];

// Download queue
const downloadQueue: string[] = [];
let isProcessingQueue = false;
const activeDownloads = new Set<string>(); // Track active download task IDs
const activeServices = new Map<string, GdownService>(); // Track active gdown services by task ID

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
 * POST /api/download/config
 * Set download configuration (e.g., max concurrent downloads)
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const { maxConcurrent }: { maxConcurrent?: number } = req.body;

    if (maxConcurrent !== undefined) {
      if (maxConcurrent < 1 || maxConcurrent > 8) {
        res.status(400).json({ error: 'maxConcurrent must be between 1 and 8' });
        return;
      }
      configManager.setMaxConcurrentDownloads(maxConcurrent);
    }

    res.json({
      status: 'success',
      config: {
        maxConcurrentDownloads: configManager.getMaxConcurrentDownloads()
      }
    });
  } catch (error) {
    console.error('Error setting config:', error);
    res.status(500).json({ error: 'Failed to set config' });
  }
});

/**
 * GET /api/download/config
 * Get current download configuration
 */
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    maxConcurrentDownloads: configManager.getMaxConcurrentDownloads()
  });
});

/**
 * POST /api/download/batch
 * Start batch downloading from multiple Google Drive URLs
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { urls, outputDir = './downloads' }: { urls: string[]; outputDir?: string } = req.body;

    if (!urls || urls.length === 0) {
      res.status(400).json({ error: 'URLs array is required' });
      return;
    }

    // Create tasks for all URLs
    const tasks: DownloadTask[] = [];

    for (const url of urls) {
      const task = taskManager.createTask(url, outputDir);
      tasks.push(task);
      // Add task to queue
      downloadQueue.push(task.id);
    }

    // Start processing queue (don't await, let it run in background)
    if (tasks.length > 0) {
      setTimeout(() => processDownloadQueue(), 500);
    }

    res.json({
      status: 'started',
      message: `Added ${tasks.length} tasks to queue`,
      tasks
    });
  } catch (error) {
    console.error('Error starting batch download:', error);
    res.status(500).json({
      error: 'Failed to start batch download',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Removed /api/download/start endpoint - use /api/download/batch instead

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
      const taskService = activeServices.get(currentTask.id);
      if (taskService) {
        const currentProgress = taskService.getCurrentProgress();
        if (currentProgress) {
          // Send full progress information from task's gdownService
          res.write(`data: ${JSON.stringify({
            type: 'progress',
            taskId: currentTask.id,
            progress: currentProgress
          })}\n\n`);
        } else if (currentTask.progress !== undefined) {
          // Fallback to task progress if service progress not available
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
        // Fallback if no active service
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
  // Cancel all active downloads
  if (activeServices.size > 0) {
    activeServices.forEach((service, taskId) => {
      service.cancel();
      console.log(`Cancelled task: ${taskId}`);
    });
    activeServices.clear();

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

    // Clear download queue and active downloads to prevent processing remaining tasks
    downloadQueue.length = 0;
    activeDownloads.clear();

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
    // Cancel all active downloads
    activeServices.forEach((service, taskId) => {
      service.cancel();
      console.log(`Cancelled task for restart: ${taskId}`);
    });
    activeServices.clear();

    // Reset queue processing flag
    isProcessingQueue = false;

    // Clear download queue and active downloads to prevent processing remaining tasks
    downloadQueue.length = 0;
    activeDownloads.clear();

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
 * Process download queue with concurrent downloads support
 */
async function processDownloadQueue(): Promise<void> {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (downloadQueue.length > 0 || activeDownloads.size > 0) {
      // Start new downloads if we have capacity
      const maxConcurrent = configManager.getMaxConcurrentDownloads();
      while (downloadQueue.length > 0 && activeDownloads.size < maxConcurrent) {
        const taskId = downloadQueue.shift();
        if (!taskId) continue;

        const task = taskManager.getTask(taskId);
        if (!task) continue;

        // Skip completed tasks
        if (task.status === 'completed') {
          console.log(`Task ${taskId} already completed, skipping`);
          continue;
        }

        // Skip if already downloading (prevent duplicate downloads)
        if (activeDownloads.has(taskId)) {
          console.log(`Task ${taskId} already downloading, skipping`);
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

        // Add to active downloads
        activeDownloads.add(taskId);

        // Download (don't await, let it run in parallel)
        downloadTask(task).finally(() => {
          activeDownloads.delete(taskId);
        });
      }

      // Wait a bit before checking again
      if (downloadQueue.length > 0 || activeDownloads.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('[processDownloadQueue] Error processing queue:', error);
  } finally {
    // Always reset the flag, even if an error occurred
    isProcessingQueue = false;
  }
}

/**
 * Download a single task
 */
function downloadTask(task: { id: string; url: string; outputDir: string }): Promise<void> {
  return new Promise((resolve) => {
    // Create new gdown service for this task (each task has its own service)
    const taskGdownService = new GdownService();

    // Add to active services
    activeServices.set(task.id, taskGdownService);

    // Calculate actual output directory (includes folder ID subdirectory)
    const actualOutputDir = `${task.outputDir}/${task.id}`;

    // Listen to progress events
    taskGdownService.on('progress', (progress: DownloadProgress) => {
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
    taskGdownService.on('complete', () => {
      console.log(`[downloadTask] Task ${task.id} completed, updating status...`);

      // Update task
      taskManager.updateTask(task.id, {
        status: 'completed',
        progress: 100,
        completedAt: Date.now()
      });

      console.log(`[downloadTask] Task ${task.id} status updated to completed`);

      progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify({
          type: 'task_complete',
          taskId: task.id,
          outputDir: actualOutputDir
        })}\n\n`);
      });

      // Remove from active services
      activeServices.delete(task.id);

      console.log(`[downloadTask] Task ${task.id} removed from active services`);

      resolve();
    });

    // Listen to warnings (non-fatal errors like QUOTA_EXCEEDED)
    taskGdownService.on('warning', (warning: string) => {
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
    taskGdownService.on('error', (error: string) => {
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

      // Remove from active services
      activeServices.delete(task.id);

      resolve();
    });

    // Start download
    taskGdownService.downloadFolder(task.url, task.outputDir);
  });
}

export default router;

