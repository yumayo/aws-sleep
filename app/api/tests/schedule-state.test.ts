import { describe, it, expect } from 'vitest'
import { Schedule } from '../src/types/scheduler-types'
import { calculateScheduleState } from '../src/models/schedule-state-calculator'

describe('スケジュール', () => {
  it('スケジュールはbeginDateを含みendDateを含まない', () => {
    const schedule: Schedule = {
      startDate: '09:00',
      stopDate: '21:00',
    }
    const action1 = calculateScheduleState(schedule, new Date("2025-09-05 20:59"))
    const action2 = calculateScheduleState(schedule, new Date("2025-09-05 21:00"))
    expect('active').toEqual(action1)
    expect('stop').toEqual(action2)
  }),
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startDate: '09:00',
      stopDate: '21:00',
    }
    const action1 = calculateScheduleState(schedule, new Date("2025-09-15 20:59"))
    const action2 = calculateScheduleState(schedule, new Date("2025-09-15 21:00"))
    expect('stop').toEqual(action1)
    expect('stop').toEqual(action2)
  })
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startDate: '09:00',
      stopDate: '21:00',
    }
    const action1 = calculateScheduleState(schedule, new Date("2025-09-15 08:59"))
    const action2 = calculateScheduleState(schedule, new Date("2025-09-15 09:00"))
    expect('stop').toEqual(action1)
    expect('stop').toEqual(action2)
  })
  it('祝日は終日stop', () => {
    const schedule: Schedule = {
      startDate: '09:00',
      stopDate: '21:00',
    }
    const action1 = calculateScheduleState(schedule, new Date("2025-09-15 23:59"))
    const action2 = calculateScheduleState(schedule, new Date("2025-09-16 00:00"))
    expect('stop').toEqual(action1)
    expect('stop').toEqual(action2)
  })
})

