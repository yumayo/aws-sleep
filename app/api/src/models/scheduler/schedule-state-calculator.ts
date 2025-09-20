import JapanaseHolidays from 'japanese-holidays'
import { ScheduleState, Schedule } from '../../types/scheduler-types'

export function calculateScheduleState(
  schedule: Schedule,
  currentTime: Date
): ScheduleState {
  const isWorking = isWorkingDay(currentTime)

  if (isWorking) {
    return getScheduleAction(schedule, currentTime)
  }

  return 'stop'
}

export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay()

  // 土日は休日
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }

  // 祝日は休日
  if (JapanaseHolidays.isHoliday(date)) {
    return false
  }

  return true
}

/**
 * 指定された時間がスケジュール実行時刻かどうかを判定する
 * @param date 時間
 * @param schedule スケジュール設定
 * @returns スケジュール実行時刻の場合、アクションタイプを返す
 */
export function getScheduleAction(schedule: Schedule, date: Date): 'active' | 'stop' {

  const todayStartDate = new Date(date)
  todayStartDate.setHours(0, 0, 0, 0)

  const todayEndDate = new Date(date)
  todayEndDate.setHours(23, 59, 59, 0)
  todayEndDate.setTime(todayEndDate.getTime() + 2) // うるう秒対策
  todayEndDate.setHours(0, 0, 0, 0)

  const [startHour, startMinute] = schedule.startDate.split(':').map(Number)
  const [stopHour, stopMinute] = schedule.stopDate.split(':').map(Number)

  const scheduleStartDate = new Date(date)
  scheduleStartDate.setHours(startHour, startMinute, 0, 0)
  const scheduleStopDate = new Date(date)
  scheduleStopDate.setHours(stopHour, stopMinute, 0, 0)

  if (date < scheduleStartDate) {
    return 'stop'
  } else if (date < scheduleStopDate) {
    return 'active'
  } else {
    return 'stop'
  }
}
