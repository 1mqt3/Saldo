import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { newLedger } from '../src/model.ts'
import { updateLedger } from '../src/storage.ts'

test('IndexedDB сохраняет конкурентные изменения и откатывает сбой атомарно', async () => {
  await updateLedger(() => newLedger())
  await Promise.all(Array.from({ length: 8 }, (_, index) => updateLedger(ledger => {
    ledger.entries.push({
      id: `entry-${index}`, categoryId: 'food', kind: 'expense', date: '2026-11-01',
      cents: index + 1, note: '', createdAt: Date.now(),
    })
  })))
  await assert.rejects(updateLedger(ledger => { ledger.entries = []; throw new Error('Проверка отката') }), /Проверка отката/)
  assert.equal((await updateLedger()).entries.length, 8)
})

test('восстановление заменяет данные и применяет регулярные платежи ровно один раз', async () => {
  const restored = newLedger()
  restored.theme = 'light'
  restored.rules.push({
    id: 'test', kind: 'expense', cents: 17900, note: 'Сервис', categoryId: 'leisure',
    start: '2026-10-31', frequency: 'monthly', active: true, nextIndex: 0,
  })
  const today = '2026-11-30'
  const saved = await updateLedger(() => restored, today)
  assert.deepEqual(saved.entries.map(entry => entry.date), ['2026-10-31', '2026-11-30'])
  const [first, second] = await Promise.all([updateLedger(undefined, today), updateLedger(undefined, today)])
  assert.deepEqual(first, second)
  assert.equal(first.rules[0].nextIndex, 2)
  assert.equal(first.theme, 'light')
})
