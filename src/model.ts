export type Kind = 'expense' | 'income'
export type Theme = 'dark' | 'light'
export type Period = 'day' | 'week' | 'month' | 'year'
export type Frequency = 'weekly' | 'monthly' | 'yearly'

export const palette = ['#7590ff', '#48d9aa', '#ffb361', '#f583ad', '#ae92f9', '#5ecbfa', '#f7d365', '#ff836d'] as const

export const categoryIcons = ['basket', 'car', 'coffee', 'home', 'heart', 'shopping', 'game', 'wallet', 'gift', 'plane', 'book', 'paw', 'dot'] as const
export type CategoryIcon = typeof categoryIcons[number]

export interface Category {
  id: string
  name: string
  color: string
  icon: CategoryIcon
  kind: Kind
}

export interface Entry {
  id: string
  kind: Kind
  cents: number
  categoryId: string
  date: string
  note: string
  createdAt: number
  ruleId?: string
}

export interface Rule {
  id: string
  kind: Kind
  cents: number
  categoryId: string
  note: string
  start: string
  frequency: Frequency
  nextIndex: number
  active: boolean
}

export interface Ledger {
  entries: Entry[]
  categories: Category[]
  rules: Rule[]
  theme: Theme
}

const defaultCategories: Category[] = [
  { id: 'food', name: 'Продукты', color: palette[0], icon: 'basket', kind: 'expense' },
  { id: 'transport', name: 'Транспорт', color: palette[1], icon: 'car', kind: 'expense' },
  { id: 'cafes', name: 'Кафе', color: palette[2], icon: 'coffee', kind: 'expense' },
  { id: 'housing', name: 'Дом', color: palette[4], icon: 'home', kind: 'expense' },
  { id: 'health', name: 'Здоровье', color: palette[3], icon: 'heart', kind: 'expense' },
  { id: 'shopping', name: 'Покупки', color: palette[5], icon: 'shopping', kind: 'expense' },
  { id: 'leisure', name: 'Досуг', color: palette[6], icon: 'game', kind: 'expense' },
  { id: 'other-expense', name: 'Другое', color: '#a1a9bb', icon: 'dot', kind: 'expense' },
  { id: 'salary', name: 'Зарплата', color: palette[1], icon: 'wallet', kind: 'income' },
  { id: 'gifts', name: 'Подарки', color: palette[3], icon: 'gift', kind: 'income' },
  { id: 'other-income', name: 'Другое', color: palette[0], icon: 'dot', kind: 'income' },
]

export function newLedger(): Ledger {
  return { entries: [], rules: [], categories: defaultCategories.map(category => ({ ...category })), theme: 'dark' }
}

const amountFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const backupFormat = 'saldo-finance'
const maxCents = 99_999_999_999

export function formatAmount(cents: number) {
  return amountFormatter.format(cents / 100)
}

export function money(cents: number) {
  return `${formatAmount(cents)} ₽`
}

export function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return validCents(cents) ? cents : null
}

function validCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maxCents
}

export function dateKey(date = new Date()): string {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && dateKey(dateFromKey(value)) === value
}

export function dateLabel(key: string) {
  return dateFormatter.format(dateFromKey(key))
}

export function monthLabel(key: string) {
  const label = monthFormatter.format(dateFromKey(key)).replace(/\sг\.$/, '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function offsetDay(key: string, days: number) {
  const date = dateFromKey(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function offsetMonth(key: string, months: number) {
  const date = dateFromKey(key)
  return dateKey(new Date(date.getFullYear(), date.getMonth() + months, 1, 12))
}

export function rangeFor(anchor: string, period: Period): [string, string] {
  const date = dateFromKey(anchor)
  if (period === 'day') return [anchor, offsetDay(anchor, 1)]
  if (period === 'week') {
    const start = offsetDay(anchor, -((date.getDay() + 6) % 7))
    return [start, offsetDay(start, 7)]
  }
  if (period === 'month') return [offsetMonth(anchor, 0), offsetMonth(anchor, 1)]
  return [dateKey(new Date(date.getFullYear(), 0, 1)), dateKey(new Date(date.getFullYear() + 1, 0, 1))]
}

export function shiftPeriod(anchor: string, period: Period, direction: number) {
  if (period === 'day') return offsetDay(anchor, direction)
  if (period === 'week') return offsetDay(anchor, direction * 7)
  return offsetMonth(anchor, direction * (period === 'month' ? 1 : 12))
}

export function periodLabel(anchor: string, period: Period) {
  if (period === 'month') return monthLabel(anchor)
  if (period === 'year') return anchor.slice(0, 4)
  if (period === 'day') return dateLabel(anchor) + ' ' + anchor.slice(0, 4)
  const [start, end] = rangeFor(anchor, period)
  return `${dateLabel(start)} — ${dateLabel(offsetDay(end, -1))}`
}

export function entriesInRange(entries: Entry[], range: [string, string]) {
  return entries.filter(entry => entry.date >= range[0] && entry.date < range[1])
}

export function totals(entries: Entry[]) {
  let income = 0
  let expense = 0
  for (const entry of entries) {
    if (entry.kind === 'income') income += entry.cents
    else expense += entry.cents
  }
  return { income, expense, balance: income - expense }
}

export function categoryTotals(entries: Entry[], categories: Category[]) {
  const amounts = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind === 'expense') amounts.set(entry.categoryId, (amounts.get(entry.categoryId) ?? 0) + entry.cents)
  }
  return categories
    .filter(category => amounts.has(category.id))
    .map(category => ({ ...category, cents: amounts.get(category.id)! }))
    .sort((a, b) => b.cents - a.cents)
}

export const frequencies: Record<Frequency, string> = {
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
  yearly: 'Каждый год',
}

export function occurrence(rule: Pick<Rule, 'start' | 'frequency'>, index: number) {
  if (rule.frequency === 'weekly') return offsetDay(rule.start, index * 7)
  const start = dateFromKey(rule.start)
  const months = index * (rule.frequency === 'monthly' ? 1 : 12)
  const end = new Date(start.getFullYear(), start.getMonth() + months + 1, 0, 12)
  end.setDate(Math.min(start.getDate(), end.getDate()))
  return dateKey(end)
}

export function nextOccurrenceIndex(rule: Pick<Rule, 'start' | 'frequency'>, from: string) {
  let lower = 0
  let upper = 1
  function beforeStart(index: number) {
    const date = occurrence(rule, index)
    return validDate(date) && date < from
  }
  while (beforeStart(upper)) upper *= 2
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (beforeStart(middle)) lower = middle + 1
    else upper = middle
  }
  return lower
}

export function applyDueRules(ledger: Ledger, today: string): boolean {
  let changed = false
  const known = new Set(ledger.entries.map(entry => entry.id))
  for (const rule of ledger.rules) {
    if (!rule.active) continue
    for (let date = occurrence(rule, rule.nextIndex); validDate(date) && date <= today; date = occurrence(rule, rule.nextIndex)) {
      const id = `recurring:${rule.id}:${date}`
      if (!known.has(id)) {
        ledger.entries.push({
          id, date, ruleId: rule.id, kind: rule.kind, cents: rule.cents,
          categoryId: rule.categoryId, note: rule.note, createdAt: Date.now(),
        })
        known.add(id)
      }
      rule.nextIndex += 1
      changed = true
    }
  }
  return changed
}

export function createBackup(ledger: Ledger) {
  return JSON.stringify({ format: backupFormat, version: 1, exportedAt: new Date().toISOString(), ledger }, null, 2)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 160
}

export function readBackup(text: string): Ledger {
  const invalid = () => new Error('Файл повреждён или имеет неподдерживаемый формат.')
  let parsed: unknown
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw invalid() }
  if (!record(parsed) || parsed.format !== backupFormat || parsed.version !== 1 || !record(parsed.ledger)) throw invalid()
  const { categories, entries, rules, theme } = parsed.ledger
  if (!Array.isArray(categories) || !Array.isArray(entries) || !Array.isArray(rules) || (theme !== 'dark' && theme !== 'light')) throw invalid()

  const categoryMap = new Map<string, Kind>()
  for (const category of categories) {
    if (!record(category) || !validId(category.id) || categoryMap.has(category.id) ||
      !validText(category.name, 32) || !category.name.trim() ||
      (category.kind !== 'expense' && category.kind !== 'income') ||
      typeof category.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(category.color) ||
      !categoryIcons.includes(category.icon as CategoryIcon)) throw invalid()
    categoryMap.set(category.id, category.kind)
  }
  if (![...categoryMap.values()].includes('income') || ![...categoryMap.values()].includes('expense')) throw invalid()

  const validOperation = (value: Record<string, unknown>) =>
    validCents(value.cents) && validText(value.note, 100) && typeof value.categoryId === 'string' &&
    (value.kind === 'income' || value.kind === 'expense') && categoryMap.get(value.categoryId) === value.kind

  const entryIds = new Set<string>()
  for (const entry of entries) {
    if (!record(entry) || !validId(entry.id) || entryIds.has(entry.id) || !validOperation(entry) || !validDate(entry.date) ||
      typeof entry.createdAt !== 'number' || !Number.isSafeInteger(entry.createdAt) || entry.createdAt < 0 ||
      (entry.ruleId !== undefined && !validId(entry.ruleId))) throw invalid()
    entryIds.add(entry.id)
  }
  const ruleIds = new Set<string>()
  for (const rule of rules) {
    if (!record(rule) || !validId(rule.id) || ruleIds.has(rule.id) || !validOperation(rule) ||
      !validDate(rule.start) || (rule.frequency !== 'weekly' && rule.frequency !== 'monthly' && rule.frequency !== 'yearly') ||
      typeof rule.active !== 'boolean' || typeof rule.nextIndex !== 'number' ||
      !Number.isSafeInteger(rule.nextIndex) || rule.nextIndex < 0 || rule.nextIndex > 600_000) throw invalid()
    ruleIds.add(rule.id)
  }
  return { categories: categories as Category[], entries: entries as Entry[], rules: rules as Rule[], theme }
}
