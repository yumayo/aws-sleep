import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ManualModeStorage } from '../src/models/manual-mode/manual-mode-storage'
import { Scheduler } from '../src/models/scheduler/scheduler'
import { ScheduleAction, ScheduleState } from '../src/types/scheduler-types'

const tempDirs: string[] = []

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aws-sleep-test-'))
  tempDirs.push(tempDir)
  return tempDir
}

const createAction = (groupName: string, calls: Array<{ groupName: string, state: ScheduleState }>): ScheduleAction => ({
  getSchedule: () => ({
    startDate: '09:00',
    stopDate: '21:00'
  }),
  getGroupName: () => groupName,
  invoke: async (state: ScheduleState) => {
    calls.push({ groupName, state })
  }
})

describe('Scheduler manual mode', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(tempDir => rm(tempDir, { recursive: true, force: true })))
  })

  it('applies manual states per resource group', async () => {
    const dataDir = await createTempDir()
    const storage = new ManualModeStorage(dataDir)
    const calls: Array<{ groupName: string, state: ScheduleState }> = []
    const scheduler = new Scheduler([
      createAction('app', calls),
      createAction('batch', calls)
    ], storage)

    await storage.save({
      requestTime: new Date('2026-05-15T00:00:00.000Z'),
      scheduleState: 'active',
      groupStates: {
        app: 'active',
        batch: 'stop'
      }
    })

    await scheduler.updateManualMode(new Date('2026-05-15T01:00:00.000Z'))

    expect(calls).toEqual([
      { groupName: 'app', state: 'active' },
      { groupName: 'batch', state: 'stop' }
    ])
  })

  it('keeps indefinite manual mode active', async () => {
    const dataDir = await createTempDir()
    const storage = new ManualModeStorage(dataDir)
    const calls: Array<{ groupName: string, state: ScheduleState }> = []
    const scheduler = new Scheduler([
      createAction('app', calls)
    ], storage)

    await storage.save({
      requestTime: new Date('2026-05-15T00:00:00.000Z'),
      scheduleState: 'active'
    })

    await scheduler.updateManualMode(new Date('2026-05-16T00:00:00.000Z'))

    expect(calls).toEqual([
      { groupName: 'app', state: 'active' }
    ])
  })
})
