import { useState, useEffect } from 'react'

interface EcsService {
  clusterName: string
  serviceName: string
  desiredCount: number
  runningCount: number
  pendingCount: number
  status: string
  startDate: string
  stopDate: string
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
}

interface EcsStatusResponse {
  status: string
  services: EcsService[]
}

interface RdsStatusResponse {
  status: string
  clusters: RdsCluster[]
}

interface DelayStatusResponse {
  status: string
  isActive: boolean
  requester?: string
  requestedAt?: string
  scheduledStopAt?: string
}

interface DashboardPageProps {
  user: { username: string }
  logout: () => void
}

export function DashboardPage({ user, logout }: DashboardPageProps) {
  const [ecsServices, setEcsServices] = useState<EcsService[]>([])
  const [rdsClusters, setRdsClusters] = useState<RdsCluster[]>([])
  const [error, setError] = useState<string | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  const [delayStatus, setDelayStatus] = useState<DelayStatusResponse | null>(null)
  const [showDelayForm, setShowDelayForm] = useState(false)
  const [delayFormData, setDelayFormData] = useState({
    requester: '',
    scheduledDate: '',
    isIndefinite: false
  })

  const fetchStatus = async () => {
    try {
      setError(null)

      const [ecsResponse, rdsResponse, delayResponse] = await Promise.all([
        fetch('/api/ecs/status'),
        fetch('/api/rds/status'),
        fetch('/api/manual-mode-status')
      ])

      if (!ecsResponse.ok || !rdsResponse.ok || !delayResponse.ok) {
        return
      }

      const ecsData: EcsStatusResponse = await ecsResponse.json()
      const rdsData: RdsStatusResponse = await rdsResponse.json()
      const delayData: DelayStatusResponse = await delayResponse.json()

      setEcsServices(ecsData.services)
      setRdsClusters(rdsData.clusters)
      setDelayStatus(delayData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const stopAll = async () => {
    if (!confirm('全サーバーを停止してマニュアルモードに変更しますか？\n停止申請を行うとサーバーが停止され、手動で解除するまで停止状態を維持します。')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const [ecsResponse, rdsResponse] = await Promise.all([
        fetch('/api/ecs/stop', { method: 'POST' }),
        fetch('/api/rds/stop', { method: 'POST' })
      ])

      if (!ecsResponse.ok || !rdsResponse.ok) {
        throw new Error('停止に失敗しました')
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const requestStart = () => {
    const now = new Date()
    const defaultTime = new Date(now.getTime() + 60 * 60 * 1000)

    const year = defaultTime.getFullYear()
    const month = String(defaultTime.getMonth() + 1).padStart(2, '0')
    const day = String(defaultTime.getDate()).padStart(2, '0')
    const hours = String(defaultTime.getHours()).padStart(2, '0')
    const minutes = String(defaultTime.getMinutes()).padStart(2, '0')
    const defaultTimeString = `${year}-${month}-${day}T${hours}:${minutes}`

    setDelayFormData({
      requester: '',
      scheduledDate: defaultTimeString,
      isIndefinite: false
    })
    setShowDelayForm(true)
  }

  const submitStartRequest = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!delayFormData.requester.trim()) {
      alert('申請者名を入力してください')
      return
    }

    if (!delayFormData.isIndefinite && !delayFormData.scheduledDate) {
      alert('サーバーの停止日時を入力してください')
      return
    }

    const now = new Date()
    let scheduledDate: Date | null = null

    if (!delayFormData.isIndefinite) {
      scheduledDate = new Date(delayFormData.scheduledDate)
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= now) {
        alert('有効な未来の日時を入力してください')
        return
      }
    }

    const confirmMessage = delayFormData.isIndefinite
      ? `${delayFormData.requester.trim()}さんの名前で無期限起動申請を行いますか？\n起動申請を行うとサーバーが起動され、手動で解除するまで起動状態を維持します。`
      : `${delayFormData.requester.trim()}さんの名前で ${scheduledDate!.toLocaleString('ja-JP')} まで起動申請を行いますか？\n起動申請を行うとサーバーが起動され、指定した時刻まで起動状態を維持します。`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/api/start-manual-mode', {
        method: 'POST',
        body: JSON.stringify({
          requester: delayFormData.requester.trim(),
          scheduledDate: scheduledDate ? scheduledDate.toISOString() : null
        })
      })

      if (!response.ok) {
        throw new Error('起動申請に失敗しました。')
      }

      setShowDelayForm(false)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const cancelStartForm = () => {
    setShowDelayForm(false)
    setDelayFormData({ requester: '', scheduledDate: '', isIndefinite: false })
  }

  const cancelDelay = async () => {
    if (!confirm('マニュアルモードを解除してスケジューラーモードに戻しますか？')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/api/cancel-manual-mode', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('マニュアルモード解除に失敗しました')
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const handleDelayFormDataChange = (field: keyof typeof delayFormData, value: string | boolean) => {
    setDelayFormData(prev => ({ ...prev, [field]: value }))
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
          <strong>{delayStatus?.isActive ? '現在はマニュアルモード中です。' : '現在はマニュアルモードではありません。'}</strong>
          <p>マニュアルモードモード申請者: {delayStatus?.requester || '-'}</p>
          <p>マニュアルモードモード申請日時: {delayStatus?.requestedAt ? new Date(delayStatus.requestedAt).toLocaleString('ja-JP') : '-'}</p>
          <p>マニュアルモードモード解除予定日時: {delayStatus?.scheduledStopAt ? new Date(delayStatus.scheduledStopAt).toLocaleString('ja-JP') : '-'}</p>
          <div>
            <button onClick={requestStart} disabled={operationLoading || showDelayForm}>
              サーバーを起動する
            </button>
          </div>
          {showDelayForm && (
            <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '5px' }}>
              <h3>起動申請</h3>
              <form onSubmit={submitStartRequest}>
                <div style={{ marginBottom: '10px' }}>
                  <label>
                    申請者名:
                    <input
                      type="text"
                      value={delayFormData.requester}
                      onChange={(e) => handleDelayFormDataChange('requester', e.target.value)}
                      style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
                      disabled={operationLoading}
                      required
                    />
                  </label>
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label>
                    停止日時:
                    <input
                      type="datetime-local"
                      value={delayFormData.scheduledDate}
                      onChange={(e) => handleDelayFormDataChange('scheduledDate', e.target.value)}
                      style={{ marginLeft: '10px', padding: '5px' }}
                      disabled={operationLoading || delayFormData.isIndefinite}
                      required={!delayFormData.isIndefinite}
                    />
                  </label>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={delayFormData.isIndefinite}
                      onChange={(e) => handleDelayFormDataChange('isIndefinite', e.target.checked)}
                      disabled={operationLoading}
                    />
                    停止しない（手動解除まで起動状態を維持）
                  </label>
                </div>
                <div>
                  <button type="submit" disabled={operationLoading} style={{ marginRight: '10px' }}>
                    申請する
                  </button>
                  <button type="button" onClick={cancelStartForm} disabled={operationLoading}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}
          <div>
            <button onClick={stopAll} disabled={operationLoading}>
              サーバーを停止する
            </button>
          </div>
          <div>
            <button onClick={cancelDelay} disabled={operationLoading || !delayStatus?.isActive}>
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
        <button onClick={fetchStatus}>更新</button>
      </div>
    </div>
  )
}