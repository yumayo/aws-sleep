import { Scheduler } from '../models/scheduler/scheduler'

export class SchedulerController {
  private readonly scheduler: Scheduler

  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler
  }

  getNextScheduleExecution(): { lastExecutionTime: string | null, nextExecutionTime: string | null } {
    const lastExecution = this.scheduler.getLastExecutionTime()
    const nextExecution = this.scheduler.getNextExecutionTime()

    return {
      lastExecutionTime: lastExecution ? lastExecution.toISOString() : null,
      nextExecutionTime: nextExecution ? nextExecution.toISOString() : null
    }
  }
}