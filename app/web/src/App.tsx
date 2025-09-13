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

export function App() {
  const [ecsServices, setEcsServices] = useState<EcsService[]>([])
  const [rdsClusters, setRdsClusters] = useState<RdsCluster[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setError(null)

      const [ecsResponse, rdsResponse] = await Promise.all([
        fetch('/api/ecs/status'),
        fetch('/api/rds/status')
      ])

      if (!ecsResponse.ok || !rdsResponse.ok) {
        throw new Error('API request failed')
      }

      const ecsData: EcsStatusResponse = await ecsResponse.json()
      const rdsData: RdsStatusResponse = await rdsResponse.json()

      setEcsServices(ecsData.services)
      setRdsClusters(rdsData.clusters)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
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
                <td>{service.desiredCount > 0 ? '稼働中' : '停止中'}</td>
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
