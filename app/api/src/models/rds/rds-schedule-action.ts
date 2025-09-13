import { Schedule, ScheduleAction, ScheduleConfigRdsItem } from "../../types/scheduler-types"
import { RdsService } from "./rds-service"

export class RdsScheduleAction implements ScheduleAction {
  private readonly rdsService: RdsService
  private readonly config: ScheduleConfigRdsItem

  constructor(rdsService: RdsService, config: ScheduleConfigRdsItem) {
    this.rdsService = rdsService
    this.config = config
  }

  getSchedule(): Schedule {
    return this.config
  }

  async invoke(state: 'active' | 'stop'): Promise<void> {
    if (state === 'active') {
      await this.rdsService.startCluster(this.config.clusterName)
    } else if (state === 'stop') {
      await this.rdsService.stopCluster(this.config.clusterName)
    } else {
        console.error(`未定義のstateです。${state}`);
    }
  }
}