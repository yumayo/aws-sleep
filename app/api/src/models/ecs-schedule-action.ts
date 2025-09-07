import { Schedule, ScheduleAction, ScheduleConfigEcsItem } from "../types/scheduler-types"
import { EcsService } from "./ecs-service"

export class EcsScheduleAction implements ScheduleAction {
  private readonly ecsService: EcsService
  private readonly config: ScheduleConfigEcsItem

  constructor(ecsService: EcsService, config: ScheduleConfigEcsItem) {
    this.ecsService = ecsService
    this.config = config
  }

  getSchedule(): Schedule {
    return this.config
  }

  async invoke(state: 'active' | 'stop'): Promise<void> {
    if (state === 'active') {
      await this.ecsService.startService(this.config.clusterName, this.config.serviceName)
    } else if (state === 'stop') {
      await this.ecsService.stopService(this.config.clusterName, this.config.serviceName)
    } else {
        console.error(`未定義のstateです。${state}`);
    }
  }
}