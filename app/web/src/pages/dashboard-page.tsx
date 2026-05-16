import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { ConfigEditor } from '../components/config-editor'
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
  const [manualModeFormData, setManualModeFormData] = useState({
    scheduledDate: '',
    isIndefinite: false,
    groupStates: {} as Record<string, ScheduleState>
  })
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

    const year = defaultTime.getFullYear()
    const month = String(defaultTime.getMonth() + 1).padStart(2, '0')
    const day = String(defaultTime.getDate()).padStart(2, '0')
    const hours = String(defaultTime.getHours()).padStart(2, '0')
    const minutes = String(defaultTime.getMinutes()).padStart(2, '0')
    const defaultTimeString = `${year}-${month}-${day}T${hours}:${minutes}`

    setManualModeFormData({
      scheduledDate: defaultTimeString,
      isIndefinite: false,
      groupStates: Object.fromEntries(resourceGroups.map(group => [group.groupName, 'active' as ScheduleState]))
    })
    setShowManualModeForm(true)
  }

  const submitManualModeStartRequest = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!manualModeFormData.isIndefinite && !manualModeFormData.scheduledDate) {
      alert('サーバーの停止日時を入力してください')
      return
    }

    const now = new Date()
    let scheduledDate: Date | null = null

    if (!manualModeFormData.isIndefinite) {
      scheduledDate = new Date(manualModeFormData.scheduledDate)
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= now) {
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
    setManualModeFormData({ scheduledDate: '', isIndefinite: false, groupStates: {} })
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

  const handleManualModeFormDataChange = (field: 'scheduledDate' | 'isIndefinite', value: string | boolean) => {
    setManualModeFormData(prev => ({ ...prev, [field]: value }))
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
      .map(([groupName, state]) => `${groupName}: ${state}`)
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

  const inactiveScheduleStyle: CSSProperties = manualModeStatus?.isActive
    ? { textDecoration: 'line-through', color: '#000' }
    : {}

  const renderScheduleCells = (resource: ResourceStatus) => (
    <>
      <td style={inactiveScheduleStyle}>❌️</td>
      <td style={inactiveScheduleStyle}>✅</td>
      <td style={inactiveScheduleStyle}>✅</td>
      <td style={inactiveScheduleStyle}>✅</td>
      <td style={inactiveScheduleStyle}>✅</td>
      <td style={inactiveScheduleStyle}>✅</td>
      <td style={inactiveScheduleStyle}>❌️</td>
      <td style={inactiveScheduleStyle}>❌️</td>
      <td style={inactiveScheduleStyle}>{resource.startDate || '-'}</td>
      <td style={inactiveScheduleStyle}>{resource.stopDate || '-'}</td>
      <td><strong style={inactiveScheduleStyle}>{resource.scheduleState}</strong></td>
      <td><strong style={{ color: manualModeStatus?.isActive ? '#ff6b6b' : '#000' }}>{getManualModeStateForGroup(resource.groupName) || '-'}</strong></td>
    </>
  )

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>エラー</h1>
          <div>
            <span>ログイン中: {user.username}</span>
            <button onClick={logout} style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}>
              ログアウト
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: '#ffebee', padding: '1rem', marginBottom: '1rem', borderRadius: '4px' }}>
          <p><strong>エラー内容:</strong> {error}</p>
        </div>
        <button onClick={fetchStatus} style={{ padding: '0.5rem 1rem' }}>再試行</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>AWS リソース ダッシュボード</h1>
        <div>
          <span>ログイン中: {user.username}</span>
          <button
            onClick={logout}
            style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {apiError && (
        <div style={{ backgroundColor: '#ffebee', padding: '1rem', marginBottom: '1rem', borderRadius: '4px', border: '2px solid #f44336' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#d32f2f' }}>API接続エラー</h3>
          <div style={{ margin: '0 0 0.5rem 0' }}>
            <strong>エラー内容:</strong>
            <pre style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {apiError}
            </pre>
          </div>
          <p style={{ margin: '0', fontSize: '0.9em', color: '#666' }}>
            APIサーバーでエラーが発生しています。管理者に連絡してください。
          </p>
        </div>
      )}

      <section>
        <div style={{ backgroundColor: '#ccffff', padding: '10px', margin: '10px 0', border: '2px solid #00cccc', borderRadius: '4px' }}>
          <p>
            平日は指定された時刻に自動的に起動し、夜間に停止されます。<br />
            土日・祝は終日サーバーを自動的に停止します。<br />
            ECSは起動に3分程度、RDSは起動に15分程度掛かります。<br />
          </p>
        </div>
      </section>

      {isAdmin && <ConfigEditor onConfigSaved={fetchStatus} />}

      <section>
        <div style={{ backgroundColor: '#ffffcc', padding: '10px', margin: '10px 0', border: '2px solid #cccc00', borderRadius: '4px' }}>
          <h2>マニュアルモード</h2>
          <p>
            マニュアルモード中はサーバーの自動起動と自動停止を行わなくなります。<br />
            早朝の勤務や残業、休日に出勤された場合に使用することを想定しています。<br />
          </p>
          <strong>{manualModeStatus?.isActive ? '現在はマニュアルモード中です。' : '現在はマニュアルモードではありません。'}</strong>
          <table border={1}>
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
                <td>{manualModeStatus?.manualScheduleState || '-'}</td>
                <td>{manualModeStatus?.requester || '-'}</td>
                <td>{manualModeStatus?.requestedAt ? new Date(manualModeStatus.requestedAt).toLocaleString('ja-JP') : '-'}</td>
                <td>{manualModeStatus?.scheduledStopAt ? new Date(manualModeStatus.scheduledStopAt).toLocaleString('ja-JP') : '-'}</td>
                <td>{formatManualGroupStates(manualModeStatus?.manualGroupStates)}</td>
              </tr>
            </tbody>
          </table>
          <div>
            <button onClick={setupManualModeStartForm} disabled={operationLoading || showManualModeForm}>
              サーバーを起動する
            </button>
          </div>
          {showManualModeForm && (
            <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '4px' }}>
              <h3>起動申請</h3>
              <form onSubmit={submitManualModeStartRequest}>
                <div style={{ marginBottom: '15px' }}>
                  <label>
                    停止日時:
                    <input
                      type="datetime-local"
                      value={manualModeFormData.scheduledDate}
                      onChange={(e) => handleManualModeFormDataChange('scheduledDate', e.target.value)}
                      style={{ marginLeft: '10px', padding: '5px' }}
                      disabled={operationLoading || manualModeFormData.isIndefinite}
                      required={!manualModeFormData.isIndefinite}
                    />
                  </label>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={manualModeFormData.isIndefinite}
                      onChange={(e) => handleManualModeFormDataChange('isIndefinite', e.target.checked)}
                      disabled={operationLoading}
                    />
                    停止しない（手動解除まで起動状態を維持）
                  </label>
                </div>
                <fieldset style={{ marginBottom: '15px' }}>
                  <legend>起動するグループ</legend>
                  {resourceGroups.length === 0 ? (
                    <p style={{ margin: '5px 0', color: '#666' }}>グループ情報を取得中...</p>
                  ) : (
                    resourceGroups.map(group => (
                      <label key={group.groupName} style={{ display: 'block', margin: '6px 0' }}>
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
                <div>
                  <button type="submit" disabled={operationLoading} style={{ marginRight: '10px' }}>
                    申請する
                  </button>
                  <button type="button" onClick={cancelManualModeForm} disabled={operationLoading}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}
          <div>
            <button onClick={submitManualModeStopRequest} disabled={operationLoading}>
              サーバーを停止する
            </button>
          </div>
          <div>
            <button onClick={cancelManualMode} disabled={operationLoading || !manualModeStatus?.isActive}>
              マニュアルモードを解除する
            </button>
          </div>
        </div>
      </section>

      <section>
        <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '4px' }}>
          <h2>リソース状態（グループ別）</h2>
          {resourceStatusGroups.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>リソース情報を取得中...</p>
          ) : (
            resourceStatusGroups.map(group => (
              <div key={group.groupName} style={{ marginTop: '12px' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>グループ: {group.groupName}</h3>
                <table border={1}>
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
                        <td>{resource.resourceType}</td>
                        <td>{resource.clusterName}</td>
                        <td>{resource.serviceName}</td>
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
            ))
          )}
        </div>
      </section>

      <div>
        <p>最終更新: {new Date().toLocaleString('ja-JP')}</p>
        <p>最終スケジュール実行時刻: {lastScheduleExecution ? new Date(lastScheduleExecution).toLocaleString('ja-JP') : '-'}</p>
        <p>次のスケジュール実行時刻: {nextScheduleExecution ? new Date(nextScheduleExecution).toLocaleString('ja-JP') : '-'}</p>
        <button onClick={fetchStatus}>更新</button>
      </div>
    </div>
  )
}
