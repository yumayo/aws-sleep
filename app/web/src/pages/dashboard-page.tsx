import { useState, useEffect } from 'react'
import { ConfigEditor } from '../components/config-editor'
import { TimePickerInput } from '../components/time-picker-input'
import { fetchWithCsrf } from '../api-client'

type ScheduleState = 'active' | 'stop'

interface EcsService {
  accountId: string
  accountName: string
  groupName: string
  clusterName: string
  serviceName: string
  desiredCount: number
  runningCount: number
  pendingCount: number
  status: string
  startDate: string
  stopDate: string
  scheduleState: ScheduleState
}

interface RdsCluster {
  accountId: string
  accountName: string
  groupName: string
  clusterName: string
  clusterStatus: string
  startDate: string
  stopDate: string
  scheduleState: ScheduleState
}

interface EcsStatusResponse {
  status: string
  services: EcsService[]
}

interface RdsStatusResponse {
  status: string
  clusters: RdsCluster[]
}

interface ResourceStatus {
  resourceType: 'ECS' | 'RDS'
  accountId: string
  groupName: string
  clusterName: string
  serviceName: string
  desiredCount: number | ''
  runningCount: number | ''
  pendingCount: number | ''
  status: string
  startDate: string
  stopDate: string
  scheduleState: ScheduleState
}

interface ResourceGroup {
  groupName: string
  resourceCount: number
}

interface ResourceGroupsResponse {
  status: string
  groups: ResourceGroup[]
}

interface ManualModeStatusResponse {
  status: string
  isActive: boolean
  requester?: string
  requestedAt?: string
  scheduledStopAt?: string
  manualScheduleState?: ScheduleState
  manualGroupStates?: Record<string, ScheduleState>
}

interface NextScheduleExecutionResponse {
  status: string
  lastExecutionTime: string | null
  nextExecutionTime: string | null
}

interface DashboardPageProps {
  user: { username: string, isAdmin: boolean }
  logout: () => void
}

interface ManualModeFormData {
  scheduledDate: string
  scheduledTime: string
  isIndefinite: boolean
  groupStates: Record<string, ScheduleState>
}

type ManualDateField = 'scheduledDate' | 'scheduledTime'

const formatScheduleState = (state?: ScheduleState): string => {
  if (!state) {
    return '-'
  }

  return state === 'active' ? '起動' : '停止'
}

const getScheduleBadgeClassName = (state?: ScheduleState): string => {
  if (state === 'active') {
    return 'status-badge status-badge-active'
  }

  if (state === 'stop') {
    return 'status-badge status-badge-stop'
  }

  return 'status-badge status-badge-neutral'
}

const padDatePart = (value: number): string => String(value).padStart(2, '0')

const getManualDateInputValue = (date: Date): string => (
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
)

const getManualTimeInputValue = (date: Date): string => (
  `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
)

const getMonthStart = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1)

const parseManualDateInputValue = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

const isSameCalendarDate = (dateA: Date, dateB: Date): boolean => (
  dateA.getFullYear() === dateB.getFullYear() &&
  dateA.getMonth() === dateB.getMonth() &&
  dateA.getDate() === dateB.getDate()
)

const isCalendarDateBefore = (dateA: Date, dateB: Date): boolean => (
  new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime() <
  new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime()
)

const isCalendarMonthBefore = (dateA: Date, dateB: Date): boolean => (
  dateA.getFullYear() < dateB.getFullYear() ||
  (dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() < dateB.getMonth())
)

const getManualDateParts = (date: Date): Pick<ManualModeFormData, ManualDateField> => ({
  scheduledDate: getManualDateInputValue(date),
  scheduledTime: getManualTimeInputValue(date)
})

const getEmptyManualModeFormData = (): ManualModeFormData => ({
  scheduledDate: '',
  scheduledTime: '',
  isIndefinite: false,
  groupStates: {}
})

const buildManualScheduledDate = (formData: ManualModeFormData): Date | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formData.scheduledDate)
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(formData.scheduledTime)

  if (!dateMatch || !timeMatch) {
    return null
  }

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const scheduledDate = new Date(year, month - 1, day, hour, minute, 0, 0)

  if (
    scheduledDate.getFullYear() !== year ||
    scheduledDate.getMonth() !== month - 1 ||
    scheduledDate.getDate() !== day ||
    scheduledDate.getHours() !== hour ||
    scheduledDate.getMinutes() !== minute
  ) {
    return null
  }

  return scheduledDate
}

const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土']

interface ManualDateCalendarProps {
  selectedDateValue: string
  displayMonth: Date
  minDate: Date
  onDisplayMonthChange: (date: Date) => void
  onDateSelect: (date: Date) => void
}

function ManualDateCalendar({
  selectedDateValue,
  displayMonth,
  minDate,
  onDisplayMonthChange,
  onDateSelect
}: ManualDateCalendarProps) {
  const selectedDate = parseManualDateInputValue(selectedDateValue)
  const today = new Date()
  const monthStart = getMonthStart(displayMonth)
  const minMonthStart = getMonthStart(minDate)
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + offset, 1)
    if (isCalendarMonthBefore(nextMonth, minMonthStart)) {
      return
    }

    onDisplayMonthChange(nextMonth)
  }

  return (
    <div className="manual-calendar">
      <div className="manual-calendar-header">
        <button
          type="button"
          className="manual-calendar-nav"
          onClick={() => moveMonth(-1)}
          disabled={!isCalendarMonthBefore(minMonthStart, monthStart)}
          aria-label="前の月"
        >
          &lt;
        </button>
        <div className="manual-calendar-title" aria-live="polite">
          {monthStart.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}
        </div>
        <button
          type="button"
          className="manual-calendar-nav"
          onClick={() => moveMonth(1)}
          aria-label="次の月"
        >
          &gt;
        </button>
      </div>
      <div className="manual-calendar-grid">
        {weekdayLabels.map(label => (
          <div key={label} className="manual-calendar-weekday">
            {label}
          </div>
        ))}
        {days.map(date => {
          const isCurrentMonth = date.getMonth() === monthStart.getMonth()
          const isSelected = selectedDate ? isSameCalendarDate(date, selectedDate) : false
          const isToday = isSameCalendarDate(date, today)
          const isPast = isCalendarDateBefore(date, minDate)
          const className = [
            'manual-calendar-day',
            isCurrentMonth ? '' : 'manual-calendar-day-outside',
            isToday ? 'manual-calendar-day-today' : '',
            isSelected ? 'manual-calendar-day-selected' : ''
          ].filter(Boolean).join(' ')

          return (
            <button
              key={getManualDateInputValue(date)}
              type="button"
              className={className}
              onClick={() => onDateSelect(date)}
              disabled={isPast}
              aria-pressed={isSelected}
              aria-label={`${date.toLocaleDateString('ja-JP')}を選択`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DashboardPage({ user, logout }: DashboardPageProps) {
  const isAdmin = user.isAdmin
  const [ecsServices, setEcsServices] = useState<EcsService[]>([])
  const [rdsClusters, setRdsClusters] = useState<RdsCluster[]>([])
  const [error, setError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  const [manualModeStatus, setManualModeStatus] = useState<ManualModeStatusResponse | null>(null)
  const [resourceGroups, setResourceGroups] = useState<ResourceGroup[]>([])
  const [showManualModeForm, setShowManualModeForm] = useState(false)
  const [manualModeFormData, setManualModeFormData] = useState<ManualModeFormData>(getEmptyManualModeFormData)
  const [manualCalendarMonth, setManualCalendarMonth] = useState<Date>(() => getMonthStart(new Date()))
  const [lastScheduleExecution, setLastScheduleExecution] = useState<string | null>(null)
  const [nextScheduleExecution, setNextScheduleExecution] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setError(null)

      const [ecsResponse, rdsResponse, manualModeStatusResponse, nextScheduleResponse, resourceGroupsResponse] = await Promise.all([
        fetch('/server-monitoring-api/ecs/status'),
        fetch('/server-monitoring-api/rds/status'),
        fetch('/server-monitoring-api/manual-mode-status'),
        fetch('/server-monitoring-api/next-schedule-execution'),
        fetch('/server-monitoring-api/resource-groups')
      ])

      const errorDetails = []

      if (ecsResponse.ok) {
        const ecsData: EcsStatusResponse = await ecsResponse.json()
        setEcsServices(ecsData.services)
      } else {
        const errorText = await ecsResponse.text()
        errorDetails.push(`ECS Status API (${ecsResponse.status}): ${errorText}`)
      }

      if (rdsResponse.ok) {
        const rdsData: RdsStatusResponse = await rdsResponse.json()
        setRdsClusters(rdsData.clusters)
      } else {
        const errorText = await rdsResponse.text()
        errorDetails.push(`RDS Status API (${rdsResponse.status}): ${errorText}`)
      }

      if (manualModeStatusResponse.ok) {
        const manualModeStatus: ManualModeStatusResponse = await manualModeStatusResponse.json()
        setManualModeStatus(manualModeStatus)
      } else {
        const errorText = await manualModeStatusResponse.text()
        errorDetails.push(`Manual Mode Status API (${manualModeStatusResponse.status}): ${errorText}`)
      }

      if (nextScheduleResponse.ok) {
        const nextScheduleData: NextScheduleExecutionResponse = await nextScheduleResponse.json()
        setLastScheduleExecution(nextScheduleData.lastExecutionTime)
        setNextScheduleExecution(nextScheduleData.nextExecutionTime)
      } else {
        const errorText = await nextScheduleResponse.text()
        errorDetails.push(`Next Schedule API (${nextScheduleResponse.status}): ${errorText}`)
      }

      if (resourceGroupsResponse.ok) {
        const resourceGroupsData: ResourceGroupsResponse = await resourceGroupsResponse.json()
        setResourceGroups(resourceGroupsData.groups)
      } else {
        const errorText = await resourceGroupsResponse.text()
        errorDetails.push(`Resource Groups API (${resourceGroupsResponse.status}): ${errorText}`)
      }

      if (errorDetails.length > 0) {
        setApiError(`APIサーバーエラーが発生しました:\n\n${errorDetails.join('\n\n')}`)
      } else {
        setApiError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const setupManualModeStartForm = () => {
    const now = new Date()
    const defaultTime = new Date(now.getTime() + 60 * 60 * 1000)

    setManualModeFormData({
      ...getManualDateParts(defaultTime),
      isIndefinite: false,
      groupStates: Object.fromEntries(resourceGroups.map(group => [group.groupName, 'active' as ScheduleState]))
    })
    setManualCalendarMonth(getMonthStart(defaultTime))
    setShowManualModeForm(true)
  }

  const submitManualModeStartRequest = async (e: React.FormEvent) => {
    e.preventDefault()

    const now = new Date()
    let scheduledDate: Date | null = null

    if (!manualModeFormData.isIndefinite) {
      scheduledDate = buildManualScheduledDate(manualModeFormData)
      if (!scheduledDate || scheduledDate <= now) {
        alert('有効な未来の日時を入力してください')
        return
      }
    }

    const activeGroupNames = resourceGroups
      .filter(group => manualModeFormData.groupStates[group.groupName] === 'active')
      .map(group => group.groupName)
    const stopGroupNames = resourceGroups
      .filter(group => manualModeFormData.groupStates[group.groupName] !== 'active')
      .map(group => group.groupName)

    if (resourceGroups.length > 0 && activeGroupNames.length === 0) {
      alert('起動するグループを1つ以上選択してください')
      return
    }

    const groupMessage = resourceGroups.length > 0
      ? `\n起動するグループ: ${activeGroupNames.join(', ')}\n起動しないグループ: ${stopGroupNames.length > 0 ? stopGroupNames.join(', ') : '-'}`
      : ''
    const confirmMessage = manualModeFormData.isIndefinite
      ? `無期限起動申請を行いますか？\n起動申請を行うと選択したグループが起動され、手動で解除するまで選択した状態を維持します。${groupMessage}`
      : `${scheduledDate!.toLocaleString('ja-JP')} まで起動申請を行いますか？\n起動申請を行うと選択したグループが起動され、指定した時刻まで選択した状態を維持します。${groupMessage}`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetchWithCsrf('/server-monitoring-api/start-manual-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduledDate: scheduledDate ? scheduledDate.toISOString() : null,
          scheduleState: 'active',
          groupStates: manualModeFormData.groupStates
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        setApiError(`起動申請に失敗しました (${response.status}):\n\n${errorText}`)
        return
      }

      setShowManualModeForm(false)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const submitManualModeStopRequest = async () => {
    if (!confirm('全サーバーを停止してマニュアルモードに変更しますか？\n停止申請を行うとサーバーが停止され、手動で解除するまで停止状態を維持します。')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetchWithCsrf('/server-monitoring-api/start-manual-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduleState: 'stop'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        setApiError(`停止申請に失敗しました (${response.status}):\n\n${errorText}`)
        return
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const cancelManualModeForm = () => {
    setShowManualModeForm(false)
    setManualModeFormData(getEmptyManualModeFormData())
    setManualCalendarMonth(getMonthStart(new Date()))
  }

  const cancelManualMode = async () => {
    if (!confirm('マニュアルモードを解除してスケジューラーモードに戻しますか？')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetchWithCsrf('/server-monitoring-api/cancel-manual-mode', {
        method: 'POST'
      })

      if (!response.ok) {
        const errorText = await response.text()
        setApiError(`マニュアルモード解除に失敗しました (${response.status}):\n\n${errorText}`)
        return
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const handleManualModeFormDataChange = (field: ManualDateField | 'isIndefinite', value: string | boolean) => {
    setManualModeFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleManualDateSelect = (date: Date) => {
    setManualModeFormData(prev => ({ ...prev, scheduledDate: getManualDateInputValue(date) }))
    setManualCalendarMonth(getMonthStart(date))
  }

  const applyManualTimePreset = (hour: number, minute: number, shouldUseToday = false) => {
    const now = new Date()
    const baseDate = shouldUseToday ? now : buildManualScheduledDate(manualModeFormData) ?? now
    const presetDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0)

    if (!shouldUseToday && presetDate <= now) {
      presetDate.setDate(presetDate.getDate() + 1)
    }

    setManualModeFormData(prev => ({ ...prev, ...getManualDateParts(presetDate) }))
    setManualCalendarMonth(getMonthStart(presetDate))
  }

  const handleManualGroupStateChange = (groupName: string, shouldStart: boolean) => {
    setManualModeFormData(prev => ({
      ...prev,
      groupStates: {
        ...prev.groupStates,
        [groupName]: shouldStart ? 'active' : 'stop'
      }
    }))
  }

  const getManualModeStateForGroup = (groupName: string): ScheduleState | undefined => {
    if (!manualModeStatus?.isActive) {
      return undefined
    }

    return manualModeStatus.manualGroupStates?.[groupName] ?? manualModeStatus.manualScheduleState
  }

  const formatManualGroupStates = (groupStates?: Record<string, ScheduleState>): string => {
    if (!groupStates) {
      return '-'
    }

    return Object.entries(groupStates)
      .map(([groupName, state]) => `${groupName}: ${formatScheduleState(state)}`)
      .join(', ')
  }

  const resourceStatuses = [
    ...ecsServices.map<ResourceStatus>(service => ({
      resourceType: 'ECS',
      accountId: service.accountId,
      groupName: service.groupName,
      clusterName: service.clusterName,
      serviceName: service.serviceName,
      desiredCount: service.desiredCount,
      runningCount: service.runningCount,
      pendingCount: service.pendingCount,
      status: service.status,
      startDate: service.startDate,
      stopDate: service.stopDate,
      scheduleState: service.scheduleState
    })),
    ...rdsClusters.map<ResourceStatus>(cluster => ({
      resourceType: 'RDS',
      accountId: cluster.accountId,
      groupName: cluster.groupName,
      clusterName: cluster.clusterName,
      serviceName: '',
      desiredCount: '',
      runningCount: '',
      pendingCount: '',
      status: cluster.clusterStatus,
      startDate: cluster.startDate,
      stopDate: cluster.stopDate,
      scheduleState: cluster.scheduleState
    }))
  ].sort((a, b) => (
    a.groupName.localeCompare(b.groupName)
    || a.resourceType.localeCompare(b.resourceType)
    || a.clusterName.localeCompare(b.clusterName)
    || a.serviceName.localeCompare(b.serviceName)
  ))

  const resourceStatusGroups = Array.from(
    resourceStatuses.reduce((groups, resource) => {
      const groupedResources = groups.get(resource.groupName)
      if (groupedResources) {
        groupedResources.push(resource)
      } else {
        groups.set(resource.groupName, [resource])
      }
      return groups
    }, new Map<string, ResourceStatus[]>()).entries()
  ).map(([groupName, resources]) => ({ groupName, resources }))

  const scheduleCellClassName = manualModeStatus?.isActive ? 'inactive-schedule' : undefined

  const renderWeeklyMark = (isActive: boolean) => (
    <span className={`schedule-mark ${isActive ? 'schedule-mark-on' : 'schedule-mark-off'}`}>
      {isActive ? 'ON' : 'OFF'}
    </span>
  )

  const renderScheduleCells = (resource: ResourceStatus) => (
    <>
      <td className={scheduleCellClassName}>{renderWeeklyMark(false)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(true)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(true)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(true)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(true)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(true)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(false)}</td>
      <td className={scheduleCellClassName}>{renderWeeklyMark(false)}</td>
      <td className={scheduleCellClassName}>{resource.startDate || '-'}</td>
      <td className={scheduleCellClassName}>{resource.stopDate || '-'}</td>
      <td>
        <span className={getScheduleBadgeClassName(resource.scheduleState)}>
          {formatScheduleState(resource.scheduleState)}
        </span>
      </td>
      <td>
        <span className={getScheduleBadgeClassName(getManualModeStateForGroup(resource.groupName))}>
          {formatScheduleState(getManualModeStateForGroup(resource.groupName))}
        </span>
      </td>
    </>
  )

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <main className="error-page">
        <div className="app-container">
          <header className="dashboard-header">
            <div>
              <h1 className="dashboard-title">エラー</h1>
              <p className="dashboard-subtitle">ステータス情報の取得に失敗しました。</p>
            </div>
            <div className="user-menu">
              <span className="user-pill">ログイン中: {user.username}</span>
              <button onClick={logout}>
                ログアウト
              </button>
            </div>
          </header>
          <div className="notice notice-danger">
            <p><strong>エラー内容:</strong> {error}</p>
          </div>
          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button onClick={fetchStatus} className="button-primary">再試行</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="dashboard-header">
          <div>
            <h1 className="dashboard-title">AWS リソース ダッシュボード</h1>
            <p className="dashboard-subtitle">
              <span>ECSとRDSの稼働状態、スケジュール、マニュアルモードを確認できます。</span>
              <span>平日は指定された時刻に自動的に起動し、夜間に停止されます。土日・祝は終日サーバーを自動的に停止します。ECSは起動に3分程度、RDSは起動に15分程度掛かります。</span>
            </p>
          </div>
          <div className="user-menu">
            <span className="user-pill">ログイン中: {user.username}</span>
            <button onClick={logout}>
              ログアウト
            </button>
          </div>
        </header>

        {apiError && (
          <div className="notice notice-danger">
            <h3 className="panel-title">API接続エラー</h3>
            <p><strong>エラー内容:</strong></p>
            <pre className="error-pre">{apiError}</pre>
            <p>APIサーバーでエラーが発生しています。管理者に連絡してください。</p>
          </div>
        )}

        {isAdmin && <ConfigEditor onConfigSaved={fetchStatus} />}

        <section className="panel">
          <div className="panel-inner">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">マニュアルモード</h2>
                <p className="panel-caption">
                  早朝勤務、残業、休日対応などでスケジューラーを一時的に止めて稼働状態を指定します。
                </p>
              </div>
              <span className={manualModeStatus?.isActive ? 'status-badge status-badge-active' : 'status-badge status-badge-neutral'}>
                {manualModeStatus?.isActive ? 'マニュアルモード中' : 'スケジューラーモード'}
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>マニュアルモード設定状態</th>
                    <th>申請者</th>
                    <th>申請日時</th>
                    <th>解除予定日時</th>
                    <th>グループ状態</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className={getScheduleBadgeClassName(manualModeStatus?.manualScheduleState)}>
                        {formatScheduleState(manualModeStatus?.manualScheduleState)}
                      </span>
                    </td>
                    <td>{manualModeStatus?.requester || '-'}</td>
                    <td>{manualModeStatus?.requestedAt ? new Date(manualModeStatus.requestedAt).toLocaleString('ja-JP') : '-'}</td>
                    <td>{manualModeStatus?.scheduledStopAt ? new Date(manualModeStatus.scheduledStopAt).toLocaleString('ja-JP') : '-'}</td>
                    <td>{formatManualGroupStates(manualModeStatus?.manualGroupStates)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="manual-actions">
              <button className="button-success" onClick={setupManualModeStartForm} disabled={operationLoading || showManualModeForm}>
                サーバーを起動する
              </button>
              <button className="button-danger" onClick={submitManualModeStopRequest} disabled={operationLoading}>
                サーバーを停止する
              </button>
              <button onClick={cancelManualMode} disabled={operationLoading || !manualModeStatus?.isActive}>
                マニュアルモードを解除する
              </button>
            </div>

          {showManualModeForm && (
            <div className="manual-form">
              <h3>起動申請</h3>
              <form onSubmit={submitManualModeStartRequest} className="form-stack">
                <fieldset className="manual-date-fieldset" disabled={operationLoading || manualModeFormData.isIndefinite}>
                  <legend>停止日時</legend>
                  <div className="manual-date-grid">
                    <div className="manual-date-field">
                      <span className="manual-date-label">日付</span>
                      <ManualDateCalendar
                        selectedDateValue={manualModeFormData.scheduledDate}
                        displayMonth={manualCalendarMonth}
                        minDate={new Date()}
                        onDisplayMonthChange={setManualCalendarMonth}
                        onDateSelect={handleManualDateSelect}
                      />
                    </div>
                    <label className="date-part-field time-field">
                      <span>時刻</span>
                      <TimePickerInput
                        ariaLabel="停止時刻"
                        value={manualModeFormData.scheduledTime}
                        onValueChange={(value) => handleManualModeFormDataChange('scheduledTime', value)}
                      />
                    </label>
                  </div>
                  <div className="manual-time-presets">
                    <button type="button" onClick={() => applyManualTimePreset(22, 0, true)}>
                      22時
                    </button>
                    <button type="button" onClick={() => applyManualTimePreset(23, 0, true)}>
                      23時
                    </button>
                    <button type="button" className="button-night" onClick={() => applyManualTimePreset(0, 10)}>
                      終電
                    </button>
                  </div>
                </fieldset>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={manualModeFormData.isIndefinite}
                    onChange={(e) => handleManualModeFormDataChange('isIndefinite', e.target.checked)}
                    disabled={operationLoading}
                  />
                  停止しない（手動解除まで起動状態を維持）
                </label>
                <fieldset className="group-fieldset">
                  <legend>起動するグループ</legend>
                  {resourceGroups.length === 0 ? (
                    <p className="empty-state">グループ情報を取得中...</p>
                  ) : (
                    resourceGroups.map(group => (
                      <label key={group.groupName} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={manualModeFormData.groupStates[group.groupName] === 'active'}
                          onChange={(e) => handleManualGroupStateChange(group.groupName, e.target.checked)}
                          disabled={operationLoading}
                        />
                        {group.groupName}（{group.resourceCount}件）
                      </label>
                    ))
                  )}
                </fieldset>
                <div className="button-row">
                  <button type="submit" className="button-primary" disabled={operationLoading}>
                    申請する
                  </button>
                  <button type="button" onClick={cancelManualModeForm} disabled={operationLoading}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-inner">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">リソース状態（グループ別）</h2>
                <p className="panel-caption">スケジュールと現在の実行状態をグループごとに表示します。</p>
              </div>
              <span className="status-badge status-badge-neutral">{resourceStatuses.length} resources</span>
            </div>

            {resourceStatusGroups.length === 0 ? (
              <p className="empty-state">リソース情報を取得中...</p>
            ) : (
              <div className="section-stack">
                {resourceStatusGroups.map(group => (
                  <div key={group.groupName} className="resource-group">
                    <div className="resource-group-header">
                      <h3 className="resource-group-title">グループ: {group.groupName}</h3>
                      <span className="status-badge status-badge-neutral">{group.resources.length}件</span>
                    </div>
                    <div className="table-wrap">
                      <table className="resource-status-table">
                        <colgroup>
                          <col className="resource-col-type" />
                          <col className="resource-col-name" />
                          <col className="resource-col-name" />
                          <col className="resource-col-count" />
                          <col className="resource-col-count" />
                          <col className="resource-col-count" />
                          <col className="resource-col-status" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-day" />
                          <col className="resource-col-time" />
                          <col className="resource-col-time" />
                          <col className="resource-col-state" />
                          <col className="resource-col-manual" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>種別</th>
                            <th>クラスター名</th>
                            <th>サービス名</th>
                            <th>希望台数</th>
                            <th>実行中</th>
                            <th>開始中</th>
                            <th>状態</th>
                            <th>日</th>
                            <th>月</th>
                            <th>火</th>
                            <th>水</th>
                            <th>木</th>
                            <th>金</th>
                            <th>土</th>
                            <th>祝</th>
                            <th>開始時刻</th>
                            <th>停止時刻</th>
                            <th>スケジュール状態</th>
                            <th>マニュアルモード状態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.resources.map(resource => (
                            <tr key={`${resource.resourceType}/${resource.accountId}/${resource.groupName}/${resource.clusterName}/${resource.serviceName}`}>
                              <td>
                                <span className="status-badge status-badge-neutral">{resource.resourceType}</span>
                              </td>
                              <td className="resource-name-cell">{resource.clusterName}</td>
                              <td className="resource-name-cell">{resource.serviceName || '-'}</td>
                              <td>{resource.desiredCount}</td>
                              <td>{resource.runningCount}</td>
                              <td>{resource.pendingCount}</td>
                              <td>{resource.status}</td>
                              {renderScheduleCells(resource)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="footer-bar">
          <div className="footer-meta">
            <p>最終更新: {new Date().toLocaleString('ja-JP')}</p>
            <p>最終スケジュール実行時刻: {lastScheduleExecution ? new Date(lastScheduleExecution).toLocaleString('ja-JP') : '-'}</p>
            <p>次のスケジュール実行時刻: {nextScheduleExecution ? new Date(nextScheduleExecution).toLocaleString('ja-JP') : '-'}</p>
          </div>
          <button onClick={fetchStatus} className="button-primary">更新</button>
        </footer>
      </div>
    </main>
  )
}
