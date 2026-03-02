// 配置加载器 - 支持JSON/YAML/JS配置文件
import { LEPConfig, ModelConfig, TaskConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigLoader {
  private configPath: string;
  private config: LEPConfig | null = null;
  private watchers: Set<() => void> = new Set();

  constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigPath();
    this.watchConfig();
  }

  private findConfigPath(): string {
    const possiblePaths = [
      './lep.config.js',
      './lep.config.json',
      './config/lep.json',
      './config/lep.js',
      process.env.LEP_CONFIG_PATH || ''
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return path.resolve(p);
      }
    }

    return path.resolve('./lep.config.json');
  }

  async load(): Promise<LEPConfig> {
    if (!fs.existsSync(this.configPath)) {
      console.warn(`[LEP] Config file not found: ${this.configPath}, using defaults`);
      this.config = this.getDefaultConfig();
      return this.config;
    }

    try {
      const ext = path.extname(this.configPath);
      let config: LEPConfig;

      if (ext === '.js' || ext === '.cjs') {
        delete require.cache[require.resolve(this.configPath)];
        config = require(this.configPath);
        if (config.default) config = config.default;
      } else {
        const content = fs.readFileSync(this.configPath, 'utf8');
        config = JSON.parse(content);
      }

      this.config = this.validateAndFillDefaults(config);
      console.log(`[LEP] Config loaded from: ${this.configPath}`);
      return this.config;
    } catch (error) {
      console.error(`[LEP] Failed to load config: ${error.message}`);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  private validateAndFillDefaults(config: Partial<LEPConfig>): LEPConfig {
    const defaults = this.getDefaultConfig();
    
    return {
      models: { ...defaults.models, ...config.models },
      tasks: { ...defaults.tasks, ...config.tasks },
      routing: { ...defaults.routing, ...config.routing },
      executionPool: { ...defaults.executionPool, ...config.executionPool },
      healthCheck: { ...defaults.healthCheck, ...config.healthCheck },
      tokenMonitor: { ...defaults.tokenMonitor, ...config.tokenMonitor }
    };
  }

  getDefaultConfig(): LEPConfig {
    return {
      models: {
        kimi: {
          name: 'kimi-coding/k2p5',
          timeout: { short: 180, medium: 600, long: 1200 },
          maxTokens: 262144,
          priority: 1,
          enabled: true
        },
        glm5: {
          name: 'glm-5',
          timeout: { short: 180, medium: 600, long: 1200 },
          maxTokens: 200000,
          priority: 2,
          enabled: true
        }
      },
      tasks: {
        default: {
          type: 'default',
          defaultModel: 'kimi',
          timeout: 'medium',
          priority: 'medium',
          retryPolicy: {
            maxRetries: 3,
            backoff: 'exponential',
            baseDelay: 1000,
            maxDelay: 30000,
            retryableErrors: ['timeout', 'connection_error', 'rate_limit']
          }
        },
        coding: {
          type: 'coding',
          defaultModel: 'glm5',
          timeout: 'long',
          priority: 'high',
          routingStrategy: 'least_load'
        },
        chat: {
          type: 'chat',
          defaultModel: 'kimi',
          timeout: 'short',
          priority: 'low'
        }
      },
      routing: {
        type: 'priority'
      },
      executionPool: {
        maxConcurrency: 5,
        queueSize: 100,
        defaultPriority: 'medium'
      },
      healthCheck: {
        interval: 30000,
        timeout: 10000,
        failureThreshold: 3
      },
      tokenMonitor: {
        warningThreshold: 0.8,
        alertThreshold: 0.95
      }
    };
  }

  async reload(): Promise<LEPConfig> {
    console.log('[LEP] Reloading configuration...');
    return this.load();
  }

  getConfig(): LEPConfig {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }

  getModelConfig(modelId: string): ModelConfig | undefined {
    return this.config?.models[modelId];
  }

  getTaskConfig(taskType: string): TaskConfig | undefined {
    return this.config?.tasks[taskType] || this.config?.tasks['default'];
  }

  addModel(modelId: string, config: ModelConfig): void {
    if (!this.config) return;
    this.config.models[modelId] = config;
    this.notifyWatchers();
  }

  updateModel(modelId: string, config: Partial<ModelConfig>): void {
    if (!this.config || !this.config.models[modelId]) return;
    this.config.models[modelId] = { ...this.config.models[modelId], ...config };
    this.notifyWatchers();
  }

  removeModel(modelId: string): void {
    if (!this.config) return;
    delete this.config.models[modelId];
    this.notifyWatchers();
  }

  onChange(handler: () => void): () => void {
    this.watchers.add(handler);
    return () => this.watchers.delete(handler);
  }

  private notifyWatchers(): void {
    this.watchers.forEach(handler => {
      try { handler(); } catch (e) { /* ignore */ }
    });
  }

  private watchConfig(): void {
    if (!fs.existsSync(this.configPath)) return;
    
    fs.watchFile(this.configPath, { interval: 5000 }, () => {
      console.log('[LEP] Config file changed, reloading...');
      this.reload();
    });
  }

  saveConfig(config: LEPConfig): void {
    const ext = path.extname(this.configPath);
    
    if (ext === '.js' || ext === '.cjs') {
      const content = `module.exports = ${JSON.stringify(config, null, 2)};`;
      fs.writeFileSync(this.configPath, content, 'utf8');
    } else {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    }
    
    this.config = config;
  }
}

export default ConfigLoader;
