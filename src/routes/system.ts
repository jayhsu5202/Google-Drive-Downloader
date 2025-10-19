import { Router, type Request, type Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

/**
 * GET /api/system/status
 * Check system environment status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = {
      python: await checkPython(),
      gdown: await checkGdown(),
      timestamp: Date.now()
    };
    res.json(status);
  } catch (error) {
    console.error('Error checking system status:', error);
    res.status(500).json({ 
      error: 'Failed to check system status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/system/install-gdown
 * Install gdown via pip
 */
router.post('/install-gdown', async (_req: Request, res: Response) => {
  try {
    const result = await installGdown();
    res.json(result);
  } catch (error) {
    console.error('Error installing gdown:', error);
    res.status(500).json({
      error: 'Failed to install gdown',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/system/cookies
 * Get current cookies.txt content
 */
router.get('/cookies', async (_req: Request, res: Response) => {
  try {
    const cookiesPath = getCookiesPath();

    if (fs.existsSync(cookiesPath)) {
      const content = fs.readFileSync(cookiesPath, 'utf-8');
      res.json({
        exists: true,
        content,
        path: cookiesPath
      });
    } else {
      res.json({
        exists: false,
        path: cookiesPath
      });
    }
  } catch (error) {
    console.error('Error reading cookies:', error);
    res.status(500).json({
      error: 'Failed to read cookies',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/system/cookies
 * Update cookies.txt content
 */
router.post('/cookies', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Invalid cookies content' });
      return;
    }

    const cookiesPath = getCookiesPath();
    const cookiesDir = path.dirname(cookiesPath);

    // Create directory if not exists
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }

    // Write cookies file
    fs.writeFileSync(cookiesPath, content, 'utf-8');

    res.json({
      success: true,
      message: 'Cookies updated successfully',
      path: cookiesPath
    });
  } catch (error) {
    console.error('Error updating cookies:', error);
    res.status(500).json({
      error: 'Failed to update cookies',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get gdown cookies.txt path
 */
function getCookiesPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.cache', 'gdown', 'cookies.txt');
}

/**
 * Check if Python is installed
 */
function checkPython(): Promise<{ installed: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const process = spawn('python', ['--version']);
    let output = '';

    process.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        const versionMatch = output.match(/Python\s+([\d.]+)/);
        resolve({
          installed: true,
          version: versionMatch ? versionMatch[1] : 'Unknown'
        });
      } else {
        resolve({
          installed: false,
          error: 'Python not found in PATH'
        });
      }
    });

    process.on('error', () => {
      resolve({
        installed: false,
        error: 'Python not found'
      });
    });
  });
}

/**
 * Check if gdown is installed
 */
function checkGdown(): Promise<{ installed: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const process = spawn('python', ['-m', 'gdown', '--version']);
    let output = '';

    process.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        const versionMatch = output.match(/gdown\s+([\d.]+)/);
        resolve({
          installed: true,
          version: versionMatch ? versionMatch[1] : 'Unknown'
        });
      } else {
        resolve({
          installed: false,
          error: 'gdown not installed'
        });
      }
    });

    process.on('error', () => {
      resolve({
        installed: false,
        error: 'Failed to check gdown'
      });
    });
  });
}

/**
 * Install gdown via pip
 */
function installGdown(): Promise<{ success: boolean; message: string; output?: string }> {
  return new Promise((resolve) => {
    const process = spawn('pip', ['install', 'gdown']);
    let output = '';

    process.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      console.log('[pip install]', data.toString());
    });

    process.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
      console.error('[pip install error]', data.toString());
    });

    process.on('close', (code: number) => {
      if (code === 0) {
        resolve({
          success: true,
          message: 'gdown installed successfully',
          output
        });
      } else {
        resolve({
          success: false,
          message: 'Failed to install gdown',
          output
        });
      }
    });

    process.on('error', (error: Error) => {
      resolve({
        success: false,
        message: `Failed to run pip: ${error.message}`
      });
    });
  });
}

export default router;

