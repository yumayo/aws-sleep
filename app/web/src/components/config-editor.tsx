import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { fetchWithCsrf } from '../api-client'

interface ScheduleConfigEcsItem {
  accountId: string
  groupName: string
  clusterName: string
  serviceName: string
  desiredCount: number
  startDate: string
  stopDate: string
}

interface ScheduleConfigRdsItem {
  accountId: string
  groupName: string
  clusterName: string
  startDate: string
  stopDate: string
}

interface AwsAccountConfig {
  accountId: string
  accountName?: string
  awsRegion: string
  credentialProfile?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  hasAccessKeyId?: boolean
  hasSecretAccessKey?: boolean
  hasSessionToken?: boolean
}

interface Config {
  ecsItems: ScheduleConfigEcsItem[]
  rdsItems: ScheduleConfigRdsItem[]
  awsAccounts: AwsAccountConfig[]
}

interface ConfigResponse {
  status: string
  config: Config
}

interface DiscoverAccountResponse {
  status: string
  account: {
    accountId: string
    accountName: string
  }
}

interface DiscoverEcsResponse {
  status: string
  clusters: Array<{
    clusterName: string
    services: Array<{
      serviceName: string
      desiredCount: number
      runningCount: number
      pendingCount: number
      status: string
    }>
  }>
}

interface DiscoverRdsResponse {
  status: string
  clusters: Array<{
    clusterName: string
    clusterStatus: string
    engine?: string
  }>
}

interface ConfigEditorProps {
  onConfigSaved: () => Promise<void>
}

const emptyConfig: Config = {
  awsAccounts: [],
  ecsItems: [],
  rdsItems: []
}

const credentialInputProps = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': 'true',
  'data-lpignore': 'true'
}

interface MaskedCredentialInputProps {
  value: string
  placeholder?: string
  onValueChange: (value: string) => void
}

function MaskedCredentialInput({ value, placeholder, onValueChange }: MaskedCredentialInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayValue = '*'.repeat(value.length)

  const setCursor = (position: number) => {
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(position, position)
    })
  }

  const replaceRange = (input: HTMLInputElement, replacement: string, start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start) => {
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`
    const nextCursor = start + replacement.length
    onValueChange(nextValue)
    setCursor(nextCursor)
  }

  const removeRange = (start: number, end: number) => {
    onValueChange(`${value.slice(0, start)}${value.slice(end)}`)
    setCursor(start)
  }

  const handleBeforeInput = (event: FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent
    if (nativeEvent.isComposing) {
      return
    }

    if (nativeEvent.inputType === 'insertText' || nativeEvent.inputType === 'insertCompositionText') {
      event.preventDefault()
      replaceRange(event.currentTarget, nativeEvent.data ?? '')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? start

    if (event.key === 'Backspace') {
      event.preventDefault()
      if (start !== end) {
        removeRange(start, end)
      } else if (start > 0) {
        removeRange(start - 1, start)
      }
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      if (start !== end) {
        removeRange(start, end)
      } else if (start < value.length) {
        removeRange(start, start + 1)
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    replaceRange(event.currentTarget, event.clipboardData.getData('text'))
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDisplayValue = event.target.value
    if (nextDisplayValue === displayValue) {
      return
    }

    let prefixLength = 0
    while (
      prefixLength < displayValue.length &&
      prefixLength < nextDisplayValue.length &&
      displayValue[prefixLength] === nextDisplayValue[prefixLength]
    ) {
      prefixLength += 1
    }

    let suffixLength = 0
    while (
      suffixLength < displayValue.length - prefixLength &&
      suffixLength < nextDisplayValue.length - prefixLength &&
      displayValue[displayValue.length - suffixLength - 1] === nextDisplayValue[nextDisplayValue.length - suffixLength - 1]
    ) {
      suffixLength += 1
    }

    const insertedValue = nextDisplayValue.slice(prefixLength, nextDisplayValue.length - suffixLength)
    onValueChange(`${value.slice(0, prefixLength)}${insertedValue}${value.slice(value.length - suffixLength)}`)
  }

  return (
    <input
      {...credentialInputProps}
      ref={inputRef}
      type="text"
      value={displayValue}
      placeholder={placeholder}
      onBeforeInput={handleBeforeInput}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      style={{ width: '100%' }}
    />
  )
}

export function ConfigEditor({ onConfigSaved }: ConfigEditorProps) {
  const [config, setConfig] = useState<Config>(emptyConfig)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
    const response = await fetchWithCsrf(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    return response.json()
  }

  const fetchConfig = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/server-monitoring-api/config')

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data: ConfigResponse = await response.json()
      setConfig(data.config)
      setIsOpen(data.config.awsAccounts.length === 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setLoading(true)
      setMessage(null)
      setError(null)
      const response = await fetchWithCsrf('/server-monitoring-api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data: ConfigResponse = await response.json()
      setConfig(data.config)
      setMessage('設定を保存しました')
      await onConfigSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const updateAccount = (index: number, patch: Partial<AwsAccountConfig>) => {
    setConfig(prev => ({
      ...prev,
      awsAccounts: prev.awsAccounts.map((account, accountIndex) => accountIndex === index ? { ...account, ...patch } : account)
    }))
  }

  const addAccount = () => {
    setConfig(prev => ({
      ...prev,
      awsAccounts: [
        ...prev.awsAccounts,
        {
          accountId: '',
          accountName: '',
          awsRegion: 'ap-northeast-1'
        }
      ]
    }))
    setIsOpen(true)
  }

  const removeAccount = (index: number) => {
    const account = config.awsAccounts[index]
    if (account?.accountId && !confirm(`${account.accountId} の設定と関連リソース設定を削除しますか？`)) {
      return
    }

    setConfig(prev => ({
      ...prev,
      awsAccounts: prev.awsAccounts.filter((_, accountIndex) => accountIndex !== index),
      ecsItems: prev.ecsItems.filter(item => item.accountId !== account.accountId),
      rdsItems: prev.rdsItems.filter(item => item.accountId !== account.accountId)
    }))
  }

  const discoverAccount = async (index: number) => {
    try {
      setLoading(true)
      setMessage(null)
      setError(null)
      const data = await postJson<DiscoverAccountResponse>('/server-monitoring-api/aws/discover-account', config.awsAccounts[index])
      const previousAccountId = config.awsAccounts[index].accountId
      setConfig(prev => ({
        ...prev,
        awsAccounts: prev.awsAccounts.map((account, accountIndex) => accountIndex === index ? {
          ...account,
          accountId: data.account.accountId,
          accountName: data.account.accountName
        } : account),
        ecsItems: previousAccountId
          ? prev.ecsItems.map(item => item.accountId === previousAccountId ? { ...item, accountId: data.account.accountId } : item)
          : prev.ecsItems,
        rdsItems: previousAccountId
          ? prev.rdsItems.map(item => item.accountId === previousAccountId ? { ...item, accountId: data.account.accountId } : item)
          : prev.rdsItems
      }))
      setMessage(`AWSアカウント情報を取得しました: ${data.account.accountId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const getDefaultGroupName = (account: AwsAccountConfig): string => account.accountName || account.accountId || 'default'

  const importEcsServices = async (index: number) => {
    try {
      const account = config.awsAccounts[index]
      if (!account.accountId) {
        throw new Error('ECSサービスを取り込む前にAWSアカウントIDを取得または入力してください')
      }

      setLoading(true)
      setMessage(null)
      setError(null)
      const data = await postJson<DiscoverEcsResponse>('/server-monitoring-api/aws/discover-ecs', account)
      const existingKeys = new Set(config.ecsItems.map(item => `${item.accountId}/${item.clusterName}/${item.serviceName}`))
      const importedItems = data.clusters.flatMap(cluster => (
        cluster.services
          .filter(service => !existingKeys.has(`${account.accountId}/${cluster.clusterName}/${service.serviceName}`))
          .map(service => ({
            accountId: account.accountId,
            groupName: getDefaultGroupName(account),
            clusterName: cluster.clusterName,
            serviceName: service.serviceName,
            desiredCount: service.desiredCount > 0 ? service.desiredCount : 1,
            startDate: '9:00',
            stopDate: '21:00'
          }))
      ))

      setConfig(prev => ({
        ...prev,
        ecsItems: [...prev.ecsItems, ...importedItems]
      }))
      setMessage(`ECSサービスを${importedItems.length}件取り込みました`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const importRdsClusters = async (index: number) => {
    try {
      const account = config.awsAccounts[index]
      if (!account.accountId) {
        throw new Error('RDSクラスターを取り込む前にAWSアカウントIDを取得または入力してください')
      }

      setLoading(true)
      setMessage(null)
      setError(null)
      const data = await postJson<DiscoverRdsResponse>('/server-monitoring-api/aws/discover-rds', account)
      const existingKeys = new Set(config.rdsItems.map(item => `${item.accountId}/${item.clusterName}`))
      const importedItems = data.clusters
        .filter(cluster => !existingKeys.has(`${account.accountId}/${cluster.clusterName}`))
        .map(cluster => ({
          accountId: account.accountId,
          groupName: getDefaultGroupName(account),
          clusterName: cluster.clusterName,
          startDate: '8:40',
          stopDate: '21:00'
        }))

      setConfig(prev => ({
        ...prev,
        rdsItems: [...prev.rdsItems, ...importedItems]
      }))
      setMessage(`RDSクラスターを${importedItems.length}件取り込みました`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const updateEcsItem = (index: number, patch: Partial<ScheduleConfigEcsItem>) => {
    setConfig(prev => ({
      ...prev,
      ecsItems: prev.ecsItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    }))
  }

  const updateRdsItem = (index: number, patch: Partial<ScheduleConfigRdsItem>) => {
    setConfig(prev => ({
      ...prev,
      rdsItems: prev.rdsItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    }))
  }

  const addEcsItem = () => {
    setConfig(prev => ({
      ...prev,
      ecsItems: [
        ...prev.ecsItems,
        {
          accountId: prev.awsAccounts[0]?.accountId ?? '',
          groupName: 'default',
          clusterName: '',
          serviceName: '',
          desiredCount: 1,
          startDate: '9:00',
          stopDate: '21:00'
        }
      ]
    }))
  }

  const addRdsItem = () => {
    setConfig(prev => ({
      ...prev,
      rdsItems: [
        ...prev.rdsItems,
        {
          accountId: prev.awsAccounts[0]?.accountId ?? '',
          groupName: 'default',
          clusterName: '',
          startDate: '8:40',
          stopDate: '21:00'
        }
      ]
    }))
  }

  const removeEcsItem = (index: number) => {
    setConfig(prev => ({
      ...prev,
      ecsItems: prev.ecsItems.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const removeRdsItem = (index: number) => {
    setConfig(prev => ({
      ...prev,
      rdsItems: prev.rdsItems.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  return (
    <section>
      <div style={{ backgroundColor: '#f7f7f7', padding: '15px', margin: '10px 0', border: '2px solid #999', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <h2>config.json 設定</h2>
          <div>
            <button onClick={() => setIsOpen(prev => !prev)} disabled={loading} style={{ marginRight: '8px' }}>
              {isOpen ? '閉じる' : '開く'}
            </button>
            <button onClick={fetchConfig} disabled={loading} style={{ marginRight: '8px' }}>
              再読み込み
            </button>
            <button onClick={saveConfig} disabled={loading}>
              保存
            </button>
          </div>
        </div>

        {message && <p style={{ color: '#2e7d32' }}>{message}</p>}
        {error && (
          <pre style={{ backgroundColor: '#ffebee', padding: '0.5rem', border: '1px solid #f44336', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error}
          </pre>
        )}

        {isOpen && (
          <div>
            <h3>AWSアカウント</h3>
            {config.awsAccounts.map((account, index) => (
              <fieldset key={index} style={{ marginBottom: '12px' }}>
                <legend>{account.accountName || account.accountId || `アカウント ${index + 1}`}</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  <label>
                    AWSアカウントID
                    <input value={account.accountId} onChange={(e) => updateAccount(index, { accountId: e.target.value })} style={{ width: '100%' }} />
                  </label>
                  <label>
                    AWSアカウント名
                    <input value={account.accountName ?? ''} onChange={(e) => updateAccount(index, { accountName: e.target.value })} style={{ width: '100%' }} />
                  </label>
                  <label>
                    リージョン
                    <input value={account.awsRegion} onChange={(e) => updateAccount(index, { awsRegion: e.target.value })} style={{ width: '100%' }} />
                  </label>
                  <label>
                    AWSプロファイル
                    <input value={account.credentialProfile ?? ''} onChange={(e) => updateAccount(index, { credentialProfile: e.target.value })} style={{ width: '100%' }} />
                  </label>
                  <label>
                    アクセスキーID
                    <input
                      {...credentialInputProps}
                      value={account.accessKeyId ?? ''}
                      placeholder={account.hasAccessKeyId ? '保存済み' : ''}
                      onChange={(e) => updateAccount(index, { accessKeyId: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label>
                    シークレットアクセスキー
                    <MaskedCredentialInput
                      value={account.secretAccessKey ?? ''}
                      placeholder={account.hasSecretAccessKey ? '保存済み' : ''}
                      onValueChange={(value) => updateAccount(index, { secretAccessKey: value })}
                    />
                  </label>
                  <label>
                    セッショントークン
                    <MaskedCredentialInput
                      value={account.sessionToken ?? ''}
                      placeholder={account.hasSessionToken ? '保存済み' : ''}
                      onValueChange={(value) => updateAccount(index, { sessionToken: value })}
                    />
                  </label>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <button onClick={() => discoverAccount(index)} disabled={loading} style={{ marginRight: '8px' }}>
                    アカウント情報取得
                  </button>
                  <button onClick={() => importEcsServices(index)} disabled={loading} style={{ marginRight: '8px' }}>
                    ECSサービス取り込み
                  </button>
                  <button onClick={() => importRdsClusters(index)} disabled={loading} style={{ marginRight: '8px' }}>
                    RDSクラスター取り込み
                  </button>
                  <button onClick={() => removeAccount(index)} disabled={loading}>
                    削除
                  </button>
                </div>
              </fieldset>
            ))}
            <button onClick={addAccount} disabled={loading}>AWSアカウントを追加</button>

            <h3>ECSサービス</h3>
            <table border={1}>
              <thead>
                <tr>
                  <th>アカウント</th>
                  <th>グループ</th>
                  <th>クラスター</th>
                  <th>サービス</th>
                  <th>希望台数</th>
                  <th>開始</th>
                  <th>停止</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {config.ecsItems.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <select value={item.accountId} onChange={(e) => updateEcsItem(index, { accountId: e.target.value })}>
                        <option value="">選択</option>
                        {config.awsAccounts.map((account, accountIndex) => (
                          <option key={`${account.accountId}-${accountIndex}`} value={account.accountId}>{account.accountName || account.accountId}</option>
                        ))}
                      </select>
                    </td>
                    <td><input value={item.groupName} onChange={(e) => updateEcsItem(index, { groupName: e.target.value })} /></td>
                    <td><input value={item.clusterName} onChange={(e) => updateEcsItem(index, { clusterName: e.target.value })} /></td>
                    <td><input value={item.serviceName} onChange={(e) => updateEcsItem(index, { serviceName: e.target.value })} /></td>
                    <td><input type="number" min={0} value={item.desiredCount} onChange={(e) => updateEcsItem(index, { desiredCount: Number(e.target.value) })} style={{ width: '5rem' }} /></td>
                    <td><input value={item.startDate} onChange={(e) => updateEcsItem(index, { startDate: e.target.value })} /></td>
                    <td><input value={item.stopDate} onChange={(e) => updateEcsItem(index, { stopDate: e.target.value })} /></td>
                    <td><button onClick={() => removeEcsItem(index)} disabled={loading}>削除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addEcsItem} disabled={loading} style={{ marginTop: '8px' }}>ECSサービスを追加</button>

            <h3>RDSクラスター</h3>
            <table border={1}>
              <thead>
                <tr>
                  <th>アカウント</th>
                  <th>グループ</th>
                  <th>クラスター</th>
                  <th>開始</th>
                  <th>停止</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {config.rdsItems.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <select value={item.accountId} onChange={(e) => updateRdsItem(index, { accountId: e.target.value })}>
                        <option value="">選択</option>
                        {config.awsAccounts.map((account, accountIndex) => (
                          <option key={`${account.accountId}-${accountIndex}`} value={account.accountId}>{account.accountName || account.accountId}</option>
                        ))}
                      </select>
                    </td>
                    <td><input value={item.groupName} onChange={(e) => updateRdsItem(index, { groupName: e.target.value })} /></td>
                    <td><input value={item.clusterName} onChange={(e) => updateRdsItem(index, { clusterName: e.target.value })} /></td>
                    <td><input value={item.startDate} onChange={(e) => updateRdsItem(index, { startDate: e.target.value })} /></td>
                    <td><input value={item.stopDate} onChange={(e) => updateRdsItem(index, { stopDate: e.target.value })} /></td>
                    <td><button onClick={() => removeRdsItem(index)} disabled={loading}>削除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addRdsItem} disabled={loading} style={{ marginTop: '8px' }}>RDSクラスターを追加</button>
          </div>
        )}
      </div>
    </section>
  )
}
