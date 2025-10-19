import fs from 'fs';

export interface DownloadTask {
  id: string;
  url: string;
  outputDir: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  currentFile: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

const TASKS_FILE = './tasks.json';

export class TaskManager {
  private tasks: Map<string, DownloadTask> = new Map();

  constructor() {
    this.loadTasks();
  }

  /**
   * Load tasks from file
   */
  private loadTasks(): void {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const data = fs.readFileSync(TASKS_FILE, 'utf-8');
        const tasksArray: DownloadTask[] = JSON.parse(data);
        tasksArray.forEach(task => {
          this.tasks.set(task.id, task);
        });
        console.log(`Loaded ${this.tasks.size} tasks from file`);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  /**
   * Save tasks to file
   */
  private saveTasks(): void {
    try {
      const tasksArray = Array.from(this.tasks.values());
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksArray, null, 2));
    } catch (error) {
      console.error('Error saving tasks:', error);
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
   */
  updateTask(id: string, updates: Partial<DownloadTask>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      this.saveTasks();
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
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

