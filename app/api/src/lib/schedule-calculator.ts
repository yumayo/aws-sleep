import { isHoliday } from 'japanese-holidays'
import { ScheduleAction, DelayedStopData } from '../types/scheduler-types'

export const isWorkingDay = (date: Date): boolean => {
  const dayOfWeek = date.getDay()
  
  // 土日は休日
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }
  
  // 祝日は休日
  if (isHoliday(date)) {
    return false
  }
  
  return true
}

export const calculateScheduleActions = (
  startTime: Date,
  endTime: Date,
  delayedStop: DelayedStopData | null = null
): ScheduleAction[] => {
  const actions: ScheduleAction[] = []
  const current = new Date(startTime)

  while (current <= endTime) {
    const hour = current.getHours()
    const isWorking = isWorkingDay(current)
    
    // 遅延停止がある場合の処理（未来の日付のみ）
    if (delayedStop && 
        delayedStop.scheduledTime.getTime() >= startTime.getTime() &&
        current.getTime() <= delayedStop.scheduledTime.getTime() && 
        delayedStop.scheduledTime.getTime() < current.getTime() + 60 * 1000) {
      actions.push({
        type: 'stop',
        time: new Date(delayedStop.scheduledTime),
        reason: `Delayed stop request by ${delayedStop.requester || 'anonymous'}`
      })
    }
    // 平日の通常スケジュール
    else if (isWorking) {
      if (hour === 9 && current.getMinutes() === 0) {
        // 遅延停止申請がある場合はスキップしない（通常起動は行う）
        actions.push({
          type: 'start',
          time: new Date(current),
          reason: 'Working day start (9:00)'
        })
      } else if (hour === 21 && current.getMinutes() === 0) {
        // 遅延停止申請がある場合は通常停止をスキップ
        if (!delayedStop) {
          actions.push({
            type: 'stop',
            time: new Date(current),
            reason: 'Working day end (21:00)'
          })
        }
      }
    }
    // 休日の停止スケジュール
    else if (hour === 21 && current.getMinutes() === 0) {
      actions.push({
        type: 'stop',
        time: new Date(current),
        reason: 'Holiday/weekend stop (21:00)'
      })
    }
    
    // 1分進める
    current.setTime(current.getTime() + 60 * 1000)
  }
  
  return actions
}