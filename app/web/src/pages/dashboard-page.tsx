import { useState, useEffect } from 'react'

type ScheduleState = 'active' | 'stop'

interface EcsService {
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

interface RdsInstance {
  instanceName: string
  status: string
}

interface RdsCluster {
  clusterName: string
  clusterStatus: string
  instances: RdsInstance[]
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

interface ManualModeStatusResponse {
  status: string
  isActive: boolean
  requester?: string
  requestedAt?: string
  scheduledStopAt?: string
  manualScheduleState?: ScheduleState
}

interface NextScheduleExecutionResponse {
  status: string
  lastExecutionTime: string | null
  nextExecutionTime: string | null
}

interface DashboardPageProps {
  user: { username: string }
  logout: () => void
}

export function DashboardPage({ user, logout }: DashboardPageProps) {
  const [ecsServices, setEcsServices] = useState<EcsService[]>([])
  const [rdsClusters, setRdsClusters] = useState<RdsCluster[]>([])
  const [error, setError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  const [manualModeStatus, setManualModeStatus] = useState<ManualModeStatusResponse | null>(null)
  const [showManualModeForm, setShowManualModeForm] = useState(false)
  const [manualModeFormData, setManualModeFormData] = useState({
    scheduledDate: '',
    isIndefinite: false
  })
  const [lastScheduleExecution, setLastScheduleExecution] = useState<string | null>(null)
  const [nextScheduleExecution, setNextScheduleExecution] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setError(null)

      const [ecsResponse, rdsResponse, manualModeStatusResponse, nextScheduleResponse] = await Promise.all([
        fetch('/server-monitoring-api/ecs/status'),
        fetch('/server-monitoring-api/rds/status'),
        fetch('/server-monitoring-api/manual-mode-status'),
        fetch('/server-monitoring-api/next-schedule-execution')
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
      isIndefinite: false
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

    const confirmMessage = manualModeFormData.isIndefinite
      ? `無期限起動申請を行いますか？\n起動申請を行うとサーバーが起動され、手動で解除するまで起動状態を維持します。`
      : `${scheduledDate!.toLocaleString('ja-JP')} まで起動申請を行いますか？\n起動申請を行うとサーバーが起動され、指定した時刻まで起動状態を維持します。`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/server-monitoring-api/start-manual-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduledDate: scheduledDate ? scheduledDate.toISOString() : null,
          scheduleState: 'active'
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

      const response = await fetch('/server-monitoring-api/start-manual-mode', {
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
    setManualModeFormData({ scheduledDate: '', isIndefinite: false })
  }

  const cancelManualMode = async () => {
    if (!confirm('マニュアルモードを解除してスケジューラーモードに戻しますか？')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/server-monitoring-api/cancel-manual-mode', {
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

  const handleManualModeFormDataChange = (field: keyof typeof manualModeFormData, value: string | boolean) => {
    setManualModeFormData(prev => ({ ...prev, [field]: value }))
  }

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
        <div style={{ backgroundColor: '#ffebee', padding: '1rem', marginBottom: '1rem', borderRadius: '4px', border: '1px solid #f44336' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#d32f2f' }}>API接続エラー</h3>
          <div style={{ margin: '0 0 0.5rem 0' }}>
            <strong>エラー内容:</strong>
            <pre style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '3px', fontSize: '0.9em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {apiError}
            </pre>
          </div>
          <p style={{ margin: '0', fontSize: '0.9em', color: '#666' }}>
            APIサーバーでエラーが発生しています。管理者に連絡してください。
          </p>
        </div>
      )}

      <section>
        <div style={{ backgroundColor: '#ccffff', padding: '10px', margin: '10px 0', border: '1px solid #00cccc' }}>
          <p>
            平日は指定された時刻に自動的に起動し、夜間に停止されます。<br />
            土日・祝は終日サーバーを自動的に停止します。<br />
          </p>
        </div>
      </section>

      <section>
        <div style={{ backgroundColor: '#ffffcc', padding: '10px', margin: '10px 0', border: '1px solid #cccc00' }}>
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
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{manualModeStatus?.manualScheduleState || '-'}</td>
                <td>{manualModeStatus?.requester || '-'}</td>
                <td>{manualModeStatus?.requestedAt ? new Date(manualModeStatus.requestedAt).toLocaleString('ja-JP') : '-'}</td>
                <td>{manualModeStatus?.scheduledStopAt ? new Date(manualModeStatus.scheduledStopAt).toLocaleString('ja-JP') : '-'}</td>
              </tr>
            </tbody>
          </table>
          <div>
            <button onClick={setupManualModeStartForm} disabled={operationLoading || showManualModeForm}>
              サーバーを起動する
            </button>
          </div>
          {showManualModeForm && (
            <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '5px' }}>
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
        <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '5px' }}>
          <h2>ECS サービス状態</h2>
          {ecsServices.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>ECSサービス情報を取得中...</p>
          ) : (
            <table border={1}>
              <thead>
                <tr>
                  <th>クラスター名</th>
                  <th>サービス名</th>
                  <th>希望台数</th>
                  <th>実行中</th>
                  <th>開始中</th>
                  <th>開始時刻</th>
                  <th>停止時刻</th>
                  <th>状態</th>
                  <th>スケジュール状態</th>
                  <th>マニュアルモード状態</th>
                </tr>
              </thead>
              <tbody>
                {ecsServices.map((service, index) => {
                  return (
                    <tr key={index}>
                      <td>{service.clusterName}</td>
                      <td>{service.serviceName}</td>
                      <td>{service.desiredCount}</td>
                      <td>{service.runningCount}</td>
                      <td>{service.pendingCount}</td>
                      <td>{service.startDate || '-'}</td>
                      <td>{service.stopDate || '-'}</td>
                      <td>{service.status}</td>
                      <td><strong style={manualModeStatus?.isActive ? { textDecoration: 'line-through', color: '#999' } : {}}>{service.scheduleState}</strong></td>
                      <td><strong style={{ color: manualModeStatus?.isActive ? '#ff6b6b' : '#999' }}>{manualModeStatus?.isActive ? (manualModeStatus?.manualScheduleState || '-') : '-'}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div style={{ backgroundColor: '#f0fff0', padding: '15px', margin: '10px 0', border: '2px solid #32cd32', borderRadius: '5px' }}>
          <h2>RDS クラスター状態</h2>
          {rdsClusters.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>RDSクラスター情報を取得中...</p>
          ) : (
            <table border={1}>
              <thead>
                <tr>
                  <th>クラスター名</th>
                  <th>インスタンス名</th>
                  <th>開始時刻</th>
                  <th>停止時刻</th>
                  <th>状態</th>
                  <th>スケジュール状態</th>
                  <th>マニュアルモード状態</th>
                </tr>
              </thead>
              <tbody>
                {rdsClusters.flatMap((cluster, index) => {
                  if (cluster.instances.length === 0) {
                    return (
                      <tr key={index}>
                        <td>{cluster.clusterName}</td>
                        <td>-</td>
                        <td>{cluster.startDate || '-'}</td>
                        <td>{cluster.stopDate || '-'}</td>
                        <td>{cluster.clusterStatus}</td>
                        <td><strong style={manualModeStatus?.isActive ? { textDecoration: 'line-through', color: '#999' } : {}}>{cluster.scheduleState}</strong></td>
                        <td><strong style={{ color: manualModeStatus?.isActive ? '#ff6b6b' : '#999' }}>{manualModeStatus?.isActive ? (manualModeStatus?.manualScheduleState || '-') : '-'}</strong></td>
                      </tr>
                    )
                  }

                  return cluster.instances.map((instance, instanceIndex) => (
                    <tr key={`${index}-${instanceIndex}`}>
                      <td>{cluster.clusterName}</td>
                      <td>{instance.instanceName}</td>
                      <td>{cluster.startDate || '-'}</td>
                      <td>{cluster.stopDate || '-'}</td>
                      <td>{instance.status}</td>
                      <td><strong style={manualModeStatus?.isActive ? { textDecoration: 'line-through', color: '#999' } : {}}>{cluster.scheduleState}</strong></td>
                      <td><strong style={{ color: manualModeStatus?.isActive ? '#ff6b6b' : '#999' }}>{manualModeStatus?.isActive ? (manualModeStatus?.manualScheduleState || '-') : '-'}</strong></td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
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