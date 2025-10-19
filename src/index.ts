import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import downloadRouter from './routes/download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/download', downloadRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🐾 Server running on http://localhost:${PORT}`);
});

