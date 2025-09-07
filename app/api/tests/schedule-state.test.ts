import { describe, it, expect } from 'vitest'
import { Schedule } from '../src/types/scheduler-types'
import { ScheduleStateCalculator } from '../src/models/schedule-state-calculator'

describe('スケジュール', () => {
  it('スケジュールはbeginDateを含みendDateを含まない', () => {
    const schedule: Schedule = {
      startHour: 9,
      stopHour: 21,
    }
    const actions = ScheduleStateCalculator.calculateScheduleState(schedule, new Date("2025-09-05 20:59"), new Date("2025-09-05 21:01"))
    expect(2).toEqual(actions.length)
    expect('active').toEqual(actions[0])
    expect('stop').toEqual(actions[1])
  }),
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startHour: 9,
      stopHour: 21,
    }
    const actions = ScheduleStateCalculator.calculateScheduleState(schedule, new Date("2025-09-15 20:59"), new Date("2025-09-15 21:01"))
    expect(2).toEqual(actions.length)
    expect('stop').toEqual(actions[0])
    expect('stop').toEqual(actions[1])
  })
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startHour: 9,
      stopHour: 21,
    }
    const actions = ScheduleStateCalculator.calculateScheduleState(schedule, new Date("2025-09-15 08:59"), new Date("2025-09-15 09:01"))
    expect(2).toEqual(actions.length)
    expect('stop').toEqual(actions[0])
    expect('stop').toEqual(actions[1])
  })
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startHour: 9,
      stopHour: 21,
    }
    const actions = ScheduleStateCalculator.calculateScheduleState(schedule, new Date("2025-09-15 23:59"), new Date("2025-09-16 00:01"))
    expect(2).toEqual(actions.length)
    expect('stop').toEqual(actions[0])
    expect('stop').toEqual(actions[1])
  })
})

