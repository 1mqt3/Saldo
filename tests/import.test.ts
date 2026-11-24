import assert from 'node:assert/strict'
import test from 'node:test'
import { appendMoneyManagerEntries, createBackup, newLedger, readBackup, readImport, totals } from '../src/model.ts'

const expense = {
  category: 'Продукты', remark: 'Тестовая покупка', amount: '1\u00A0234,50', currency: 'RUB',
  type: 'Расходы', account: '', date: '2026-11-23', pictures: [],
}
const income = { ...expense, category: 'Подработка', amount: '2\u202F000', type: 'Доходы', remark: '', account: 'Наличные' }

test('MoneyManager сохраняет суммы, категории, даты и заметки, дополняя журнал', async () => {
  const data = await readImport('\uFEFF' + JSON.stringify([expense, income]))
  assert.equal(data.format, 'money-manager')
  const ledger = newLedger()
  ledger.theme = 'light'
  ledger.entries.push({
    id: 'existing', kind: 'expense', cents: 50, date: '2026-11-22', categoryId: 'food', createdAt: 1, note: '',
  })
  const added = appendMoneyManagerEntries(ledger, data.entries)
  assert.equal(added.length, 2)
  assert.equal(added[0].categoryId, 'food')
  assert.equal(added[0].date, expense.date)
  assert.equal(added[0].note, expense.remark)
  assert.equal(added[1].note, 'Счёт: Наличные')
  assert.ok(ledger.categories.some(category => category.name === income.category && category.id === added[1].categoryId && category.kind === 'income'))
  assert.deepEqual(totals(ledger.entries), { income: 200000, expense: 123500, balance: 76500 })
  assert.equal(ledger.entries[0].id, 'existing')
  assert.equal(ledger.theme, 'light')
  assert.deepEqual(readBackup(createBackup(ledger)), ledger)
})

test('повторный импорт пропускает совпадения и сохраняет отдельные одинаковые операции', async () => {
  const first = await readImport(JSON.stringify([expense, expense, income]))
  const second = await readImport(JSON.stringify([income, { ...expense, amount: '1234.50' }, expense]))
  assert.equal(first.format, 'money-manager')
  assert.equal(second.format, 'money-manager')
  const ledger = newLedger()
  assert.equal(appendMoneyManagerEntries(ledger, first.entries).length, 3)
  ledger.entries[0].note = 'Исправлено после импорта'
  assert.equal(appendMoneyManagerEntries(ledger, second.entries).length, 0)
  assert.equal(ledger.entries.length, 3)
  assert.equal(ledger.entries[0].note, 'Исправлено после импорта')
})

test('импорт распознаёт резервную копию и сообщает о непригодных строках MoneyManager', async () => {
  const ledger = newLedger()
  assert.deepEqual(await readImport(createBackup(ledger)), { format: 'saldo', ledger })
  await assert.rejects(readImport(JSON.stringify([expense, { ...income, currency: 'EUR' }])), /операция 2.*рублях/)
  await assert.rejects(readImport(JSON.stringify([{ ...expense, date: '2026-02-31' }])), /операция 1.*дату/)
  await assert.rejects(readImport(JSON.stringify([{ ...expense, type: 'Перевод' }])), /доходы и расходы/)
  await assert.rejects(readImport(JSON.stringify([{ ...expense, amount: '0,00' }])), /Сумма должна быть положительной/)
  const pictured = await readImport(JSON.stringify([{ ...expense, pictures: ['example.jpg'] }]))
  assert.equal(pictured.format, 'money-manager')
  assert.equal(pictured.hasPictures, true)
})
