import fs from 'fs';

export interface AppConfig {
  maxConcurrentDownloads: number;
}

const CONFIG_FILE = './config.json';
const DEFAULT_CONFIG: AppConfig = {
  maxConcurrentDownloads: 1  // Match frontend default value
};

export class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load config from file
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loadedConfig = JSON.parse(data);
        console.log('[ConfigManager] Loaded config from file:', loadedConfig);
        return { ...DEFAULT_CONFIG, ...loadedConfig };
      }
    } catch (error) {
      console.error('[ConfigManager] Error loading config:', error);
    }
    console.log('[ConfigManager] Using default config:', DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Save config to file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      console.log('[ConfigManager] Config saved successfully to', CONFIG_FILE);
    } catch (error) {
      console.error('[ConfigManager] Error saving config:', error);
    }
  }

  /**
   * Get max concurrent downloads
   */
  getMaxConcurrentDownloads(): number {
    return this.config.maxConcurrentDownloads;
  }

  /**
   * Set max concurrent downloads
   */
  setMaxConcurrentDownloads(value: number): void {
    this.config.maxConcurrentDownloads = value;
    this.saveConfig();
    console.log('[ConfigManager] Max concurrent downloads set to', value);
  }

  /**
   * Get all config
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }
}

