import { applyDueRules, dateKey, newLedger } from './model.ts'
import type { Ledger } from './model.ts'

const databaseName = 'saldo-finance'
const storeName = 'finance'
const stateKey = 'ledger'
let connection: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        connection = undefined
      }
      database.onclose = () => { connection = undefined }
      resolve(database)
    }
    request.onerror = () => reject(request.error)
  })
  connection.catch(() => { connection = undefined })
  return connection
}

export async function updateLedger(change?: (ledger: Ledger) => Ledger | void, today = dateKey()): Promise<Ledger> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.get(stateKey)
    let ledger: Ledger
    let failure: unknown
    request.onsuccess = () => {
      try {
        const previous = request.result as Ledger | undefined
        ledger = previous ?? newLedger()
        if (change) ledger = change(ledger) ?? ledger
        const due = applyDueRules(ledger, today)
        if (!previous || change || due) store.put(ledger, stateKey)
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(ledger)
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Данные не сохранены.'))
  })
}
