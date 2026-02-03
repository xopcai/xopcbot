import { CronService } from './service.js';

export interface HeartbeatConfig {
  intervalMs: number;
  enabled: boolean;
}

export class HeartbeatService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private cronService: CronService;

  constructor(cronService: CronService) {
    this.cronService = cronService;
  }

  start(config: HeartbeatConfig): void {
    if (!config.enabled) {
      console.log('[Heartbeat] Disabled');
      return;
    }

    console.log(`[Heartbeat] Starting with interval ${config.intervalMs}ms`);

    this.intervalId = setInterval(async () => {
      await this.checkAndWake();
    }, config.intervalMs);
  }

  private async checkAndWake(): Promise<void> {
    try {
      // Check for scheduled jobs that might need to be triggered
      const jobs = this.cronService.listJobs();
      
      // Log status
      const runningJobs = this.cronService.getRunningCount();
      console.log(`[Heartbeat] Active - ${runningJobs} cron jobs running`);
    } catch (error) {
      console.error('[Heartbeat] Error:', error);
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Heartbeat] Stopped');
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
