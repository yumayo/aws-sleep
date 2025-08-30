import { describe, it, expect, vi } from 'vitest'
import { isWorkingDay, calculateScheduleActions } from '../src/controllers/scheduler-controller'

describe('SchedulerController pure functions', () => {
  describe('isWorkingDay', () => {
    it('should return true for weekdays that are not holidays', () => {
      // 2024年1月9日 (火曜日、祝日ではない)
      const tuesday = new Date('2024-01-09')
      expect(isWorkingDay(tuesday)).toBe(true)
    })

    it('should return false for Saturday', () => {
      // 2024年1月6日 (土曜日)
      const saturday = new Date('2024-01-06')
      expect(isWorkingDay(saturday)).toBe(false)
    })

    it('should return false for Sunday', () => {
      // 2024年1月7日 (日曜日)
      const sunday = new Date('2024-01-07')
      expect(isWorkingDay(sunday)).toBe(false)
    })

    it('should return false for holidays', () => {
      // 2024年1月1日 (元日、月曜日だが祝日)
      const newYear = new Date('2024-01-01')
      expect(isWorkingDay(newYear)).toBe(false)
    })
  })

  describe('calculateScheduleActions', () => {
    it('should return start action at 9:00 on working day', () => {
      // 2024年1月9日 9:00 (火曜日)
      const startTime = new Date('2024-01-09T08:59:00')
      const endTime = new Date('2024-01-09T09:01:00')

      const actions = calculateScheduleActions(startTime, endTime)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'start',
        time: new Date('2024-01-09T09:00:00'),
        reason: 'Working day start (9:00)'
      })
    })

    it('should return stop action at 21:00 on working day without delayed stop', () => {
      // 2024年1月9日 21:00 (火曜日)
      const startTime = new Date('2024-01-09T20:59:00')
      const endTime = new Date('2024-01-09T21:01:00')

      const actions = calculateScheduleActions(startTime, endTime)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'stop',
        time: new Date('2024-01-09T21:00:00'),
        reason: 'Working day end (21:00)'
      })
    })

    it('should skip regular stop when delayed stop is scheduled', () => {
      // 2024年1月9日 21:00 (火曜日)
      const startTime = new Date('2024-01-09T20:59:00')
      const endTime = new Date('2024-01-09T21:01:00')
      const delayedStop = {
        requestTime: new Date('2024-01-09T20:00:00'),
        scheduledTime: new Date('2024-01-09T22:00:00'),
        requester: 'test-user'
      }

      const actions = calculateScheduleActions(startTime, endTime, delayedStop)

      expect(actions).toHaveLength(0)
    })

    it('should return stop action at 21:00 on weekend', () => {
      // 2024年1月6日 21:00 (土曜日)
      const startTime = new Date('2024-01-06T20:59:00')
      const endTime = new Date('2024-01-06T21:01:00')

      const actions = calculateScheduleActions(startTime, endTime)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'stop',
        time: new Date('2024-01-06T21:00:00'),
        reason: 'Holiday/weekend stop (21:00)'
      })
    })

    it('should execute delayed stop at scheduled time', () => {
      // 2024年1月9日 22:00に遅延停止が予定されている
      const startTime = new Date('2024-01-09T21:59:00')
      const endTime = new Date('2024-01-09T22:01:00')
      const delayedStop = {
        requestTime: new Date('2024-01-09T21:00:00'),
        scheduledTime: new Date('2024-01-09T22:00:00'),
        requester: 'test-user'
      }

      const actions = calculateScheduleActions(startTime, endTime, delayedStop)

      expect(actions).toHaveLength(1)
      expect(actions[0]).toEqual({
        type: 'stop',
        time: new Date('2024-01-09T22:00:00'),
        reason: 'Delayed stop request by test-user'
      })
    })

    it('should return multiple actions for longer time range', () => {
      // 2024年1月9日 8:59 から 21:01 (火曜日、開始と終了両方)
      const startTime = new Date('2024-01-09T08:59:00')
      const endTime = new Date('2024-01-09T21:01:00')

      const actions = calculateScheduleActions(startTime, endTime)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual({
        type: 'start',
        time: new Date('2024-01-09T09:00:00'),
        reason: 'Working day start (9:00)'
      })
      expect(actions[1]).toEqual({
        type: 'stop',
        time: new Date('2024-01-09T21:00:00'),
        reason: 'Working day end (21:00)'
      })
    })

    it('should return empty array when no actions are scheduled', () => {
      // 2024年1月9日 10:00-11:00 (作業時間中、アクションなし)
      const startTime = new Date('2024-01-09T10:00:00')
      const endTime = new Date('2024-01-09T11:00:00')

      const actions = calculateScheduleActions(startTime, endTime)

      expect(actions).toHaveLength(0)
    })
  })
})