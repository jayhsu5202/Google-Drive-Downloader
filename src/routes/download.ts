import { Router, type Request, type Response } from 'express';
import { GdownService } from '../services/gdown.js';
import { scanDirectory } from '../services/fileVerify.js';
import type { DownloadRequest, DownloadProgress } from '../types.js';

const router = Router();

// Global gdown service instance
let gdownService: GdownService | null = null;

// Store progress for SSE clients
const progressClients: Response[] = [];

/**
 * POST /api/download/start
 * Start downloading from Google Drive
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

export default router;

