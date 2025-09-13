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

interface RdsCluster {
  clusterName: string
  status: string
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

export function App() {
  const [ecsServices, setEcsServices] = useState<EcsService[]>([])
  const [rdsClusters, setRdsClusters] = useState<RdsCluster[]>([])
  const [error, setError] = useState<string | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  const [delayStatus, setDelayStatus] = useState<DelayStatusResponse | null>(null)
  const [showDelayForm, setShowDelayForm] = useState(false)
  const [delayFormData, setDelayFormData] = useState({
    requester: '',
    scheduledDate: ''
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

  const startAll = async () => {
    if (!confirm('全サービスを起動してマニュアルモードに変更しますか？')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const [ecsResponse, rdsResponse, delayResponse] = await Promise.all([
        fetch('/api/ecs/start', { method: 'POST' }),
        fetch('/api/rds/start', { method: 'POST' }),
        fetch('/api/delay-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requester: 'manual-start' })
        })
      ])

      if (!ecsResponse.ok || !rdsResponse.ok) {
        throw new Error('起動に失敗しました')
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const stopAll = async () => {
    if (!confirm('全サービスを停止してマニュアルモードに変更しますか？')) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const [ecsResponse, rdsResponse, delayResponse] = await Promise.all([
        fetch('/api/ecs/stop', { method: 'POST' }),
        fetch('/api/rds/stop', { method: 'POST' }),
        fetch('/api/delay-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requester: 'manual-stop' })
        })
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

  const requestDelay = () => {
    const now = new Date()
    const defaultTime = new Date(now.getTime() + 60 * 60 * 1000) // 1時間後
    
    // datetime-local用のフォーマット (YYYY-MM-DDTHH:mm)
    const year = defaultTime.getFullYear()
    const month = String(defaultTime.getMonth() + 1).padStart(2, '0')
    const day = String(defaultTime.getDate()).padStart(2, '0')
    const hours = String(defaultTime.getHours()).padStart(2, '0')
    const minutes = String(defaultTime.getMinutes()).padStart(2, '0')
    const defaultTimeString = `${year}-${month}-${day}T${hours}:${minutes}`
    
    setDelayFormData({
      requester: '',
      scheduledDate: defaultTimeString
    })
    setShowDelayForm(true)
  }

  const submitDelayRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!delayFormData.requester.trim()) {
      alert('申請者名を入力してください')
      return
    }
    
    if (!delayFormData.scheduledDate) {
      alert('サーバーの停止日時を入力してください')
      return
    }

    const now = new Date()
    
    // datetime-local の値はローカルタイムとして解釈される
    const scheduledDate = new Date(delayFormData.scheduledDate)
    
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= now) {
      alert('有効な未来の日時を入力してください')
      return
    }

    // 確認ダイアログを表示
    const confirmMessage = `${delayFormData.requester.trim()}さんの名前で ${scheduledDate.toLocaleString('ja-JP')} まで起動申請を行いますか？\n起動申請を行うとサーバーが起動され、指定した時刻まで起動状態を維持します。`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/api/delay-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requester: delayFormData.requester.trim(),
          scheduledDate: scheduledDate.toISOString()
        })
      })

      if (!response.ok) {
        throw new Error('起動申請に失敗しました')
      }

      setShowDelayForm(false)
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
  }

  const cancelDelayForm = () => {
    setShowDelayForm(false)
    setDelayFormData({ requester: '', scheduledDate: '' })
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

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div>
        <h1>エラー</h1>
        <p>{error}</p>
        <button onClick={fetchStatus}>再試行</button>
      </div>
    )
  }

  return (
    <div>
      <h1>AWS リソース ダッシュボード</h1>

      <section>
        <div style={{ backgroundColor: '#ffffcc', padding: '10px', margin: '10px 0', border: '1px solid #cccc00' }}>
        <h2>マニュアルモード</h2>
        <p>
          マニュアルモード中はサーバーの自動起動と自動停止を行わなくなります。<br/>
          早朝の勤務や残業、休日に出勤された場合に使用することを想定しています。<br/>
        </p>
        <strong>{delayStatus?.isActive ? 'マニュアルモード中です。' : 'マニュアルモードではありません。'}</strong>
        <p>マニュアルモードモード申請者: {delayStatus?.requester || '-'}</p>
        <p>マニュアルモードモード申請日時: {delayStatus?.requestedAt ? new Date(delayStatus.requestedAt).toLocaleString('ja-JP') : '-'}</p>
        <p>マニュアルモードモード解除予定日時: {delayStatus?.scheduledStopAt ? new Date(delayStatus.scheduledStopAt).toLocaleString('ja-JP') : '-'}</p>
        <div>
          <button onClick={startAll} disabled={operationLoading}>
            サーバーを起動する
          </button>
          <button onClick={stopAll} disabled={operationLoading}>
            サーバーを停止する
          </button>
        </div>
        <div>
          <button onClick={requestDelay} disabled={operationLoading || showDelayForm}>
            指定した時刻までサーバーを起動したままにする
          </button>
        </div>
        {showDelayForm && (
          <div style={{ backgroundColor: '#f0f8ff', padding: '15px', margin: '10px 0', border: '2px solid #4169e1', borderRadius: '5px' }}>
            <h3>起動申請</h3>
            <form onSubmit={submitDelayRequest}>
              <div style={{ marginBottom: '10px' }}>
                <label>
                  申請者名:
                  <input
                    type="text"
                    value={delayFormData.requester}
                    onChange={(e) => setDelayFormData(prev => ({ ...prev, requester: e.target.value }))}
                    style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
                    disabled={operationLoading}
                    required
                  />
                </label>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label>
                  停止予定日時:
                  <input
                    type="datetime-local"
                    value={delayFormData.scheduledDate}
                    onChange={(e) => setDelayFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                    style={{ marginLeft: '10px', padding: '5px' }}
                    disabled={operationLoading}
                    required
                  />
                </label>
              </div>
              <div>
                <button type="submit" disabled={operationLoading} style={{ marginRight: '10px' }}>
                  申請する
                </button>
                <button type="button" onClick={cancelDelayForm} disabled={operationLoading}>
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}
        <div>
          <button onClick={cancelDelay} disabled={operationLoading || !delayStatus?.isActive}>
            マニュアルモードを解除する
          </button>
        </div>
      </div>
      </section>

      <section>
        <h2>ECS サービス</h2>
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
            {ecsServices.map((service, index) => (
              <tr key={index}>
                <td>{service.clusterName}</td>
                <td>{service.serviceName}</td>
                <td>{service.desiredCount}</td>
                <td>{service.runningCount}</td>
                <td>{service.pendingCount}</td>
                <td>{service.startDate}</td>
                <td>{service.stopDate}</td>
                <td>{service.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>RDS クラスター</h2>
        <table border={1}>
          <thead>
            <tr>
              <th>クラスター名</th>
              <th>開始時刻</th>
              <th>停止時刻</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rdsClusters.map((cluster, index) => (
              <tr key={index}>
                <td>{cluster.clusterName}</td>
                <td>{cluster.startDate}</td>
                <td>{cluster.stopDate}</td>
                <td>{cluster.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div>
        <button onClick={fetchStatus}>更新</button>
        <p>最終更新: {new Date().toLocaleString('ja-JP')}</p>
      </div>
    </div>
  )
}
