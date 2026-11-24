import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyDueRules, categoryReplacement, categoryTotals, createBackup, deleteCategory, newLedger, readBackup, saveCategory, totals,
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
  const changes = { name: '  Обучение ', color: '#7590ff', icon: 'graduation' } as const
  saveCategory(ledger, changes, custom.id)
  assert.deepEqual(ledger.entries, [expense])
  assert.equal(categoryTotals(ledger.entries, ledger.categories)[0].name, 'Обучение')
  assert.deepEqual(ledger.categories.at(-1), { ...custom, ...changes, name: 'Обучение' })
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
  saveCategory(ledger, changes, custom.id)
  assert.throws(() => saveCategory(ledger, { ...changes, name: 'пРОдуКты' }, custom.id), /таким названием/)
})

test('стандартные расходы и доходы редактируются с сохранением истории и расписаний', () => {
  const ledger = newLedger()
  ledger.entries.push(
    { ...expense, categoryId: 'food' },
    { ...expense, id: 'existing-income', kind: 'income', categoryId: 'salary' },
  )
  ledger.rules.push({ ...recurring, categoryId: 'food' })
  const entries = structuredClone(ledger.entries)
  const rules = structuredClone(ledger.rules)
  saveCategory(ledger, { name: 'Продуктовый бюджет', color: '#112233', icon: 'utensils' }, 'food')
  saveCategory(ledger, { name: 'Основная работа', color: '#7590ff', icon: 'briefcase' }, 'salary')
  assert.deepEqual(ledger.entries, entries)
  assert.deepEqual(ledger.rules, rules)
  assert.equal(categoryTotals(ledger.entries, ledger.categories)[0].name, 'Продуктовый бюджет')
  assert.equal(ledger.categories.find(category => category.id === 'salary')?.name, 'Основная работа')
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
  deleteCategory(ledger, 'salary')
  assert.equal(ledger.entries[1].categoryId, 'other-income')
  assert.ok(!ledger.categories.some(category => category.id === 'salary'))
  const categoryCount = ledger.categories.length
  deleteCategory(ledger, 'transport')
  assert.equal(ledger.categories.length, categoryCount - 1)
})

test('удаление переносит расходы и регулярные правила, сохраняя суммы и историю', () => {
  const ledger = newLedger()
  ledger.categories.push({ ...custom })
  ledger.entries.push({ ...expense })
  ledger.rules.push({ ...recurring })
  saveCategory(ledger, { name: 'Прочие расходы', color: '#112233', icon: 'dot' }, 'other-expense')
  assert.equal(categoryReplacement(ledger, custom)?.name, 'Прочие расходы')
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

test('удаление последней категории сохраняет доступную категорию нужного типа', () => {
  const imported: Category = { ...custom, id: 'imported-income', kind: 'income' }
  const original = newLedger()
  original.categories = original.categories.filter(category => category.kind === 'expense')
  original.categories.push(imported)
  original.entries.push({ ...expense, kind: 'income', categoryId: imported.id })
  const ledger = readBackup(createBackup(original))
  deleteCategory(ledger, imported.id)
  const remaining = ledger.categories.find(category => category.kind === 'income')
  assert.equal(remaining?.name, 'Без категории')
  assert.equal(ledger.entries[0].categoryId, remaining?.id)
  assert.ok(!ledger.categories.some(category => category.id === imported.id))
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
})

test('удаление стандартного «Другое» переносит записи и правила в новую нейтральную категорию', () => {
  const ledger = newLedger()
  ledger.entries.push({ ...expense, categoryId: 'other-expense' })
  ledger.rules.push({ ...recurring, categoryId: 'other-expense' })
  deleteCategory(ledger, 'other-expense')
  assert.ok(!ledger.categories.some(category => category.id === 'other-expense'))
  const replacement = ledger.categories.find(category => category.kind === 'expense' && category.name === 'Без категории')
  assert.ok(replacement)
  assert.equal(ledger.entries[0].categoryId, replacement.id)
  assert.equal(ledger.rules[0].categoryId, replacement.id)
  applyDueRules(ledger, '2026-11-24')
  assert.equal(ledger.entries[1].categoryId, replacement.id)
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
})
