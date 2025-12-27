/**
 * シンプルなファイルベースのロック機構
 * Node.jsはシングルスレッドなので、Promiseチェーンで排他制御を実現
 */
export class FileLock {
  private locks: Map<string, Promise<void>> = new Map()

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.locks.get(key) ?? Promise.resolve()

    let resolveLock: () => void
    const newLock = new Promise<void>((resolve) => {
      resolveLock = resolve
    })
    this.locks.set(key, newLock)

    try {
      await currentLock
      return await fn()
    } finally {
      resolveLock!()
      if (this.locks.get(key) === newLock) {
        this.locks.delete(key)
      }
    }
  }
}
