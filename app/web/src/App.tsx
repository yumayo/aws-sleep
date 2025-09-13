import { useState, useEffect } from 'react'

interface EcsService {
  clusterName: string
  serviceName: string
  desiredCount: number
}

interface RdsCluster {
  clusterName: string
  status: string
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
        throw new Error('API request failed')
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

  const requestDelay = async () => {
    const requester = prompt('申請者名を入力してください:')
    if (!requester || !requester.trim()) {
      return
    }

    if (!confirm(`${requester}さんの名前で遅延申請を行いますか？`)) {
      return
    }

    try {
      setOperationLoading(true)
      setError(null)

      const response = await fetch('/api/delay-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requester: requester.trim() })
      })

      if (!response.ok) {
        throw new Error('遅延申請に失敗しました')
      }

      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOperationLoading(false)
    }
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
          <button onClick={requestDelay} disabled={operationLoading}>
            今から1時間サーバーを起動したままにする
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
        <h2>ECS サービス</h2>
        <table border={1}>
          <thead>
            <tr>
              <th>クラスター名</th>
              <th>サービス名</th>
              <th>台数</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {ecsServices.map((service, index) => (
              <tr key={index}>
                <td>{service.clusterName}</td>
                <td>{service.serviceName}</td>
                <td>{service.desiredCount}</td>
                <td>{service.desiredCount > 0 ? 'available' : 'stopped'}</td>
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
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rdsClusters.map((cluster, index) => (
              <tr key={index}>
                <td>{cluster.clusterName}</td>
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
