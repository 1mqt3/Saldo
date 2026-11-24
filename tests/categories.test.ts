import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyDueRules, categoryTotals, createBackup, deleteCategory, isCustomCategory, newLedger, readBackup, saveCategory, totals,
} from '../src/model.ts'
import type { Category, Entry, Rule } from '../src/model.ts'

const custom: Category = { id: 'old-user-category', name: 'Город', color: '#112233', icon: 'dot', kind: 'expense' }
const expense: Entry = {
  id: 'existing-expense', kind: 'expense', categoryId: custom.id, cents: 12345, date: '2026-11-23', note: 'Поездка', createdAt: 1,
}
const recurring: Rule = {
  id: 'existing-rule', kind: 'expense', categoryId: custom.id, cents: 20000, note: 'Проездной',
  start: '2026-11-24', frequency: 'monthly', active: true, nextIndex: 0,
}

test('редактирование категории из старой копии сохраняет ссылки в истории', () => {
  const original = newLedger()
  original.categories.push({ ...custom })
  original.entries.push({ ...expense })
  const ledger = readBackup(createBackup(original))
  const changes = { name: '  Путешествия ', color: '#7590ff', icon: 'plane' } as const
  assert.equal(isCustomCategory(ledger.categories.at(-1)!), true)
  saveCategory(ledger, changes, custom.id)
  assert.deepEqual(ledger.entries, [expense])
  assert.equal(categoryTotals(ledger.entries, ledger.categories)[0].name, 'Путешествия')
  assert.deepEqual(ledger.categories.at(-1), { ...custom, ...changes, name: 'Путешествия' })
  saveCategory(ledger, changes, custom.id)
  assert.throws(() => saveCategory(ledger, { ...changes, name: 'пРОдуКты' }, custom.id), /таким названием/)
  assert.throws(() => saveCategory(ledger, changes, 'food'), /Стандартная категория/)
  assert.throws(() => deleteCategory(ledger, 'other-expense'), /Стандартная категория/)
})

test('удаление переносит расходы и регулярные правила, сохраняя суммы и историю', () => {
  const ledger = newLedger()
  ledger.categories.push({ ...custom })
  ledger.entries.push({ ...expense })
  ledger.rules.push({ ...recurring })
  const balance = totals(ledger.entries)
  deleteCategory(ledger, custom.id)
  assert.deepEqual(ledger.entries, [{ ...expense, categoryId: 'other-expense' }])
  assert.deepEqual(ledger.rules, [{ ...recurring, categoryId: 'other-expense' }])
  assert.deepEqual(totals(ledger.entries), balance)
  assert.ok(!ledger.categories.some(category => category.id === custom.id))
  applyDueRules(ledger, '2026-11-24')
  assert.equal(ledger.entries[1].categoryId, 'other-expense')
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
})

test('удаление пользовательского дохода восстанавливает «Другое» нужного типа в старой копии', () => {
  const imported: Category = { ...custom, id: 'imported-income', kind: 'income' }
  const original = newLedger()
  original.categories = original.categories.filter(category => category.kind === 'expense')
  original.categories.push(imported)
  original.entries.push({ ...expense, kind: 'income', categoryId: imported.id })
  const ledger = readBackup(createBackup(original))
  deleteCategory(ledger, imported.id)
  assert.equal(ledger.entries[0].categoryId, 'other-income')
  assert.ok(ledger.categories.some(category => category.id === 'other-income' && category.kind === 'income' && category.name === 'Другое'))
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
})
