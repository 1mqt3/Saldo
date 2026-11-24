import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyDueRules, categoryTotals, createBackup, entriesInRange, newLedger, nextOccurrenceIndex,
  occurrence, parseAmount, rangeFor, readBackup, totals,
} from '../src/model.ts'
import type { Entry, Rule } from '../src/model.ts'

test('суммы в копейках без округления и с русской запятой', () => {
  assert.equal(parseAmount('1 234,56'), 123456)
  assert.equal(parseAmount('0.01'), 1)
  assert.equal(parseAmount('99,7'), 9970)
  for (const value of ['0', '-10', '1,001', '1e3', '2.5,2', '1000000000']) {
    assert.equal(parseAmount(value), null)
  }
})

const entry: Entry = {
  id: 'test-entry', kind: 'expense', categoryId: 'food', cents: 31050,
  date: '2026-11-30', note: 'Тест', createdAt: 100,
}
const rule: Rule = {
  id: 'test-rule', kind: 'expense', categoryId: 'housing', cents: 100000,
  start: '2024-01-31', frequency: 'monthly', note: 'Аренда', active: true, nextIndex: 0,
}

test('периоды включают начальную дату и исключают начало следующего периода', () => {
  const nextEntry: Entry = { ...entry, id: 'next-entry', date: '2026-12-01', categoryId: 'salary', kind: 'income', cents: 100000 }
  const entries = [entry, nextEntry]
  assert.deepEqual(rangeFor(entry.date, 'day'), ['2026-11-30', '2026-12-01'])
  assert.deepEqual(rangeFor('2026-12-06', 'week'), ['2026-11-30', '2026-12-07'])
  assert.deepEqual(entriesInRange(entries, rangeFor(entry.date, 'month')), [entry])
  assert.deepEqual(totals(entriesInRange(entries, rangeFor(entry.date, 'year'))), { income: 100000, expense: 31050, balance: 68950 })
  assert.deepEqual(categoryTotals(entries, newLedger().categories).map(item => [item.id, item.cents]), [['food', 31050]])
})

test('ежемесячные платежи сохраняют день, годовые учитывают високосный год', () => {
  assert.equal(occurrence(rule, 1), '2024-02-29')
  assert.equal(occurrence(rule, 2), '2024-03-31')
  assert.equal(occurrence({ ...rule, start: '2024-02-29', frequency: 'yearly' }, 1), '2025-02-28')
  assert.equal(occurrence({ ...rule, start: '2024-02-29', frequency: 'yearly' }, 4), '2028-02-29')
  assert.equal(occurrence({ ...rule, frequency: 'weekly' }, 4), '2024-02-28')
  assert.equal(nextOccurrenceIndex(rule, '2024-03-01'), 2)
  assert.equal(nextOccurrenceIndex({ ...rule, start: '9999-12-30' }, '9999-12-31'), 1)
})

test('регулярные операции добавляются один раз и не восстанавливаются после удаления', () => {
  const ledger = newLedger()
  ledger.rules.push({ ...rule })
  assert.equal(applyDueRules(ledger, '2024-03-05'), true)
  assert.deepEqual(ledger.entries.map(item => item.date), ['2024-01-31', '2024-02-29'])
  assert.equal(applyDueRules(ledger, '2024-03-05'), false)
  ledger.entries.pop()
  assert.equal(applyDueRules(ledger, '2024-03-05'), false)
  ledger.rules[0].active = false
  assert.equal(applyDueRules(ledger, '2024-04-10'), false)
  ledger.rules[0].active = true
  ledger.rules[0].nextIndex = nextOccurrenceIndex(rule, '2024-04-10')
  applyDueRules(ledger, '2024-04-30')
  assert.deepEqual(ledger.entries.map(item => item.date), ['2024-01-31', '2024-04-30'])
})

test('копия восстанавливает пользовательские категории, операции, расписание и тему', () => {
  const ledger = newLedger()
  ledger.categories.push({ id: 'travel', name: 'Путешествия', color: '#7590ff', icon: 'plane', kind: 'expense' })
  ledger.entries.push({ ...entry, categoryId: 'travel' })
  ledger.rules.push({ ...rule })
  ledger.theme = 'light'
  assert.deepEqual(readBackup('\uFEFF' + createBackup(ledger)), ledger)
  ledger.entries[0].categoryId = 'unknown'
  assert.throws(() => readBackup(createBackup(ledger)), /Файл повреждён/)
})

test('повреждённая копия и неподдерживаемые данные отклоняются', () => {
  for (const file of ['{', '{"format":"saldo-finance","version":2}', '[]', 'null']) {
    assert.throws(() => readBackup(file), /Файл повреждён/)
  }
  const ledger = newLedger()
  ledger.entries.push({ ...entry, date: '2026-02-31' })
  assert.throws(() => readBackup(createBackup(ledger)), /Файл повреждён/)
  ledger.entries = [entry, entry]
  assert.throws(() => readBackup(createBackup(ledger)), /Файл повреждён/)
})
