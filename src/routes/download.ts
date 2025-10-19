import { Router, type Request, type Response } from 'express';
import { GdownService } from '../services/gdown.js';
import { scanDirectory } from '../services/fileVerify.js';
import { TaskManager } from '../services/taskManager.js';
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

    // Create tasks for all URLs
    const tasks = urls.map(url => taskManager.createTask(url, outputDir));

    // Add tasks to queue
    tasks.forEach(task => downloadQueue.push(task.id));

    // Start processing queue (don't await, let it run in background)
    setTimeout(() => processDownloadQueue(), 500);

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

    // Listen to errors
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
    
    progressClients.forEach(client => {
      client.write(`data: ${JSON.stringify({ status: 'cancelled' })}\n\n`);
    });

    res.json({ status: 'cancelled', message: 'Download cancelled' });
  } else {
    res.status(400).json({ error: 'No active download to cancel' });
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

    // Listen to progress events
    gdownService.on('progress', (progress: DownloadProgress) => {
      // Update task
      taskManager.updateTask(task.id, {
        progress: progress.percentage,
        currentFile: progress.currentFile
      });

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
      // Scan downloaded files
      const files = await scanDirectory(task.outputDir);

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
          files
        })}\n\n`);
      });

      resolve();
    });

    // Listen to errors
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

      resolve();
    });

    // Start download
    gdownService.downloadFolder(task.url, task.outputDir);
  });
}

export default router;

