import { applyDueRules, dateKey, newLedger } from './model.ts'
import type { Ledger } from './model.ts'

const databaseName = 'saldo-finance'
const storeName = 'finance'
const stateKey = 'ledger'
const databaseVersion = 2
const backupStore = 'backups'
const migrationKey = 'before-migration'
let connection: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = event => {
      if (event.oldVersion < 1) request.result.createObjectStore(storeName)
      if (event.oldVersion < 2) {
        const backups = request.result.createObjectStore(backupStore)
        if (event.oldVersion === 1) {
          const snapshot = request.transaction!.objectStore(storeName).get(stateKey)
          snapshot.onsuccess = () => { if (snapshot.result) backups.put(snapshot.result, migrationKey) }
        }
      }
    }
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

export async function readMigrationBackup(): Promise<Ledger | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(backupStore, 'readonly')
    const request = transaction.objectStore(backupStore).get(migrationKey)
    request.onsuccess = () => resolve((request.result as Ledger | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
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
