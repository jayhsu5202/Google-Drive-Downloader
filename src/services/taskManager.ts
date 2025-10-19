import fs from 'fs';

export interface DownloadTask {
  id: string;
  url: string;
  outputDir: string;
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';
  progress: number;
  currentFile: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

const TASKS_FILE = './tasks.json';

export class TaskManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private saveTimer: NodeJS.Timeout | null = null;
  private needsSave: boolean = false;

  constructor() {
    this.loadTasks();
    // Auto-save every 5 seconds if there are unsaved changes
    this.startAutoSave();
  }

  /**
   * Load tasks from file
   * Only load tasks that need to be resumed (pending, downloading, error)
   * Ignore completed and cancelled tasks
   */
  private loadTasks(): void {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const data = fs.readFileSync(TASKS_FILE, 'utf-8');
        const tasksArray: DownloadTask[] = JSON.parse(data);

        // Only load tasks that need to be resumed
        const resumableTasks = tasksArray.filter(task =>
          task.status === 'pending' ||
          task.status === 'downloading' ||
          task.status === 'error'
        );

        resumableTasks.forEach(task => {
          this.tasks.set(task.id, task);
        });

        console.log(`Loaded ${this.tasks.size} resumable tasks from file (filtered from ${tasksArray.length} total)`);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      if (this.needsSave) {
        this.saveTasks();
        this.needsSave = false;
      }
    }, 5000); // Save every 5 seconds if needed
  }

  /**
   * Save tasks to file
   * Save all tasks except cancelled ones
   */
  private saveTasks(): void {
    try {
      // Save all tasks except cancelled ones
      const tasksToSave = Array.from(this.tasks.values()).filter(task =>
        task.status !== 'cancelled'
      );

      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksToSave, null, 2));
    } catch (error) {
      console.error('Error saving tasks:', error);
    }
  }

  /**
   * Force save tasks immediately
   */
  public forceSave(): void {
    this.saveTasks();
    this.needsSave = false;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    // Save any pending changes
    if (this.needsSave) {
      this.saveTasks();
    }
  }

  /**
   * Create a new task
   */
  createTask(url: string, outputDir: string): DownloadTask {
    const id = this.generateTaskId(url);
    const task: DownloadTask = {
      id,
      url,
      outputDir,
      status: 'pending',
      progress: 0,
      currentFile: '',
      createdAt: Date.now()
    };
    this.tasks.set(id, task);
    this.saveTasks();
    return task;
  }

  /**
   * Update task status
   * @param saveToFile - Whether to save to file immediately (default: true for status changes, false for progress updates)
   */
  updateTask(id: string, updates: Partial<DownloadTask>, saveToFile: boolean = true): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);

      // Delete error field if it's explicitly set to undefined
      if ('error' in updates && updates.error === undefined) {
        delete task.error;
      }

      // Auto-cleanup: Only remove cancelled tasks from memory
      // Keep completed tasks to prevent duplicate downloads
      if (task.status === 'cancelled') {
        console.log(`Auto-removing ${task.status} task ${id} from memory`);
        this.tasks.delete(id);
        this.saveTasks(); // Save to update the file
        return;
      }

      // Only save to file if explicitly requested or if status changed
      if (saveToFile || updates.status !== undefined) {
        this.saveTasks();
      } else {
        // Mark as needing save (will be saved by auto-save timer)
        this.needsSave = true;
      }
    }
  }

  /**
   * Get task by ID
   */
  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get pending tasks (not completed)
   */
  getPendingTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status !== 'completed'
    );
  }

  /**
   * Delete task
   */
  deleteTask(id: string): boolean {
    const deleted = this.tasks.delete(id);
    if (deleted) {
      this.saveTasks();
    }
    return deleted;
  }

  /**
   * Generate task ID from URL
   */
  private generateTaskId(url: string): string {
    // Extract folder/file ID from URL
    const match = url.match(/[\/=]([a-zA-Z0-9_-]{20,})/);
    if (match) {
      return match[1];
    }
    // Fallback: use timestamp + random
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

