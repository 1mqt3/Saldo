import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { newLedger } from '../src/model.ts'
import { readMigrationBackup, updateLedger } from '../src/storage.ts'

test('миграция IndexedDB сохраняет старый журнал и отдельный снимок перед обновлением', async () => {
  const legacy = newLedger()
  legacy.theme = 'light'
  legacy.entries.push({
    id: 'existing', kind: 'expense', cents: 24700, categoryId: 'food',
    date: '2026-11-24', note: 'Запись до обновления', createdAt: 1,
  })
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('saldo-finance', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('finance').put(legacy, 'ledger')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { request.result.close(); resolve() }
  })

  assert.deepEqual(await updateLedger(), legacy)
  assert.deepEqual(await readMigrationBackup(), legacy)
  await updateLedger(ledger => { ledger.entries[0].note = 'Изменение после обновления' })
  assert.deepEqual(await readMigrationBackup(), legacy)
})
