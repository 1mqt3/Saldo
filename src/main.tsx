import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, ChartPie, ChevronRight, CircleHelp,
  Clock3, House, LayoutGrid, LockKeyhole, Moon, MoreHorizontal, Plus, ReceiptText, RefreshCw, Repeat2,
  Settings2, Smartphone, Sun, Tags, Wallet,
} from 'lucide-react'
import {
  appendMoneyManagerEntries, createBackup, dateKey, dateLabel, deleteCategory, entriesInRange, frequencies,
  isCustomCategory, money, monthLabel, nextOccurrenceIndex, occurrence, offsetMonth, periodLabel, rangeFor,
  readBackup, readImport, saveCategory, shiftPeriod, totals,
} from './model.ts'
import type { Category, DataImport, Entry, Kind, Ledger, Period, Rule } from './model.ts'
import { readMigrationBackup, updateLedger } from './storage.ts'
import { checkAndroidUpdate, isAndroid, saldoAndroid, setAndroidBarStyle } from './android.ts'
import type { AndroidInfo } from './android.ts'
import type { AndroidRelease } from './android-release.ts'
import {
  CategoryBadge, CategoryEditor, CategorySettingsList, Choice, Confirm, Dialog, Empty, EntryList, Flow, OperationEditor,
  Pager, SpendingChart, useInstallPrompt,
} from './ui.tsx'
import type { OperationDraft } from './ui.tsx'
import '@fontsource-variable/manrope/wght.css'
import './style.css'

type View = 'overview' | 'history' | 'stats' | 'recurring' | 'settings'
type Modal =
  | { type: 'entry'; entry?: Entry }
  | { type: 'rule'; rule?: Rule }
  | { type: 'category'; category?: Category }
  | { type: 'delete-category'; category: Category }
  | { type: 'delete-entry'; entry: Entry }
  | { type: 'delete-rule'; rule: Rule }
  | { type: 'import'; data: DataImport }
  | { type: 'android-update'; release: AndroidRelease }
  | { type: 'install' }

const views = {
  overview: { title: 'Обзор', icon: LayoutGrid },
  history: { title: 'Операции', icon: ReceiptText },
  stats: { title: 'Статистика', icon: ChartPie },
  recurring: { title: 'Регулярные платежи', icon: Repeat2 },
  settings: { title: 'Настройки', icon: Settings2 },
}
const viewOrder: View[] = ['overview', 'history', 'stats', 'recurring', 'settings']
const periodChoices: { value: Period; label: string }[] = [
  { value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' }, { value: 'year', label: 'Год' },
]
const filterChoices: { value: Kind | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' }, { value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' },
]
const firstDay = '1900-01-01'
const operationCount = new Intl.PluralRules('ru')
const countLabels = { zero: 'операций', one: 'операция', two: 'операции', few: 'операции', many: 'операций', other: 'операций' }
const todayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })

function currentView(): View {
  const hash = window.location.hash.slice(1)
  return viewOrder.find(view => view === hash) ?? 'overview'
}

function Brand() {
  return <a className="brand" href="#overview" aria-label="Сальдо — обзор">
    <span className="brand-icon" aria-hidden="true"><i /><i /><i /></span>
    <span>сальдо<span className="brand-period">.</span></span>
  </a>
}

function App() {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState<View>(currentView)
  const [month, setMonth] = useState(() => offsetMonth(dateKey(), 0))
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(dateKey)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [modal, setModal] = useState<Modal | null>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [androidInfo, setAndroidInfo] = useState<AndroidInfo | null>(null)
  const [hasMigrationBackup, setHasMigrationBackup] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const channel = useRef<BroadcastChannel | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { installed, install } = useInstallPrompt()

  function notify(message: string, error = false) { setToast({ message, error }) }
  function navigate(destination: View) { window.location.hash = destination }
  function closeModal() { if (!installingUpdate) setModal(null) }

  async function refresh() {
    try { setLedger(await updateLedger()); setLoadError(false) }
    catch { setLoadError(true) }
  }

  useEffect(() => {
    const sync = () => { if (document.visibilityState === 'visible') void refresh() }
    const route = () => { setView(currentView()); window.scrollTo(0, 0) }
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('saldo-finance')
      channel.current.onmessage = () => void refresh()
    }
    void refresh()
    const interval = window.setInterval(sync, 30_000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('hashchange', route)
    return () => {
      channel.current?.close()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('hashchange', route)
      clearInterval(interval)
    }
  }, [])

  const theme = ledger?.theme
  useEffect(() => {
    if (!theme) return
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1013' : '#f5f6fa')
    setAndroidBarStyle(theme)
  }, [theme])

  const loaded = ledger !== null
  useEffect(() => {
    if (!isAndroid || !loaded) return
    let active = true
    void saldoAndroid.getInfo().then(async info => {
      if (!active) return
      setAndroidInfo(info)
      const release = await checkAndroidUpdate(info.code)
      if (active && release) setModal(current => current ?? { type: 'android-update', release })
    }).catch(() => {})
    void readMigrationBackup().then(backup => {
      if (active) setHasMigrationBackup(backup !== null)
    }).catch(() => {})
    return () => { active = false }
  }, [loaded])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  async function commit(change: (current: Ledger) => Ledger | void) {
    try {
      setLedger(await updateLedger(change))
      channel.current?.postMessage('changed')
    } catch (error) {
      if (error instanceof Error && error.name === 'Error') throw error
      throw new Error('Не удалось сохранить данные на устройстве.')
    }
  }

  async function saveEntry(draft: OperationDraft, previous?: Entry) {
    const { kind, cents, categoryId, note, date } = draft
    const next = { id: previous?.id ?? crypto.randomUUID(), kind, cents, categoryId, note, date,
      createdAt: previous?.createdAt ?? Date.now(), ...(previous?.ruleId ? { ruleId: previous.ruleId } : {}) }
    await commit(current => {
      if (!current.categories.some(category => category.id === categoryId && category.kind === kind)) throw new Error('Выберите доступную категорию.')
      if (!previous) current.entries.push(next)
      else {
        const index = current.entries.findIndex(entry => entry.id === previous.id)
        if (index === -1) throw new Error('Эта операция уже удалена.')
        current.entries[index] = next
      }
    })
    if (!previous) setMonth(offsetMonth(date, 0))
    closeModal()
    notify(previous ? 'Операция обновлена' : 'Операция добавлена')
  }

  async function saveRule(draft: OperationDraft, previous?: Rule) {
    const { kind, cents, categoryId, note, date: start, frequency } = draft
    await commit(current => {
      if (!current.categories.some(category => category.id === categoryId && category.kind === kind)) throw new Error('Выберите доступную категорию.')
      const next = { id: previous?.id ?? crypto.randomUUID(), kind, cents, categoryId, note, start, frequency, active: true, nextIndex: 0 }
      if (!previous) { current.rules.push(next); return }
      const index = current.rules.findIndex(rule => rule.id === previous.id)
      if (index === -1) throw new Error('Этот платёж уже удалён.')
      const existing = current.rules[index]
      next.active = existing.active
      next.nextIndex = existing.start === start && existing.frequency === frequency
        ? existing.nextIndex
        : nextOccurrenceIndex(next, dateKey())
      current.rules[index] = next
    })
    closeModal()
    notify(previous ? 'Платёж обновлён' : 'Регулярный платёж создан')
  }

  async function toggleRule(rule: Rule) {
    try {
      await commit(current => {
        const existing = current.rules.find(item => item.id === rule.id)
        if (!existing) throw new Error('Этот платёж уже удалён.')
        existing.active = !rule.active
        if (existing.active) existing.nextIndex = Math.max(existing.nextIndex, nextOccurrenceIndex(existing, dateKey()))
      })
      notify(rule.active ? 'Платёж приостановлен' : 'Платёж возобновлён')
    } catch (error) { notify((error as Error).message, true) }
  }

  async function changeTheme() {
    try { await commit(current => { current.theme = current.theme === 'dark' ? 'light' : 'dark' }) }
    catch (error) { notify((error as Error).message, true) }
  }

  async function exportFile() {
    try {
      const snapshot = await updateLedger()
      setLedger(snapshot)
      const json = createBackup(snapshot)
      const name = `saldo-${dateKey()}.json`
      if (isAndroid) {
        const { saved } = await saldoAndroid.saveBackup({ json, name })
        if (saved) notify('Резервная копия сохранена')
        return
      }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      notify('Резервная копия подготовлена')
    } catch { notify('Не удалось создать резервную копию.', true) }
  }

  async function findUpdate() {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const info = await saldoAndroid.getInfo()
      setAndroidInfo(info)
      const release = await checkAndroidUpdate(info.code)
      if (release) { setUpdateError(''); setModal({ type: 'android-update', release }) }
      else notify('Установлена последняя версия')
    } catch { notify('Не удалось проверить обновления. Проверьте интернет и попробуйте снова.', true) }
    finally { setCheckingUpdate(false) }
  }

  async function downloadUpdate(release: AndroidRelease) {
    if (installingUpdate) return
    setInstallingUpdate(true)
    setUpdateError('')
    try {
      const backup = createBackup(await updateLedger())
      await saldoAndroid.installUpdate({ release, backup })
      setModal(null)
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Не удалось установить обновление.')
    } finally {
      setInstallingUpdate(false)
      void saldoAndroid.getInfo().then(setAndroidInfo).catch(() => {})
    }
  }

  async function restoreBeforeUpdate() {
    try {
      const backup = androidInfo?.hasUpdateBackup
        ? readBackup((await saldoAndroid.readUpdateBackup()).json)
        : await readMigrationBackup()
      if (backup) setModal({ type: 'import', data: { format: 'saldo', ledger: backup } })
    } catch { notify('Не удалось прочитать копию перед обновлением.', true) }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try { setModal({ type: 'import', data: await readImport(await file.text()) }) }
    catch (error) { notify((error as Error).message, true) }
  }

  async function installApp() {
    try { if (!(await install())) setModal({ type: 'install' }) }
    catch { setModal({ type: 'install' }) }
  }

  function addEntry() { if (ledger) setModal({ type: 'entry' }) }

  const today = dateKey()
  const currentMonth = offsetMonth(today, 0)
  const currentMonthLabel = monthLabel(month)
  const isRecurring = view === 'recurring'
  const themeLabel = ledger?.theme === 'light' ? 'Тёмная тема' : 'Светлая тема'
  const ThemeIcon = ledger?.theme === 'light' ? Moon : Sun

  const monthPager = <Pager label={currentMonthLabel} previous={() => setMonth(offsetMonth(month, -1))}
    next={() => setMonth(offsetMonth(month, 1))} disablePrevious={month <= firstDay} disableNext={month >= currentMonth} />

  let content: ReactNode
  let dialogTitle = ''
  let dialogBody: ReactNode

  if (ledger) {
    const monthEntries = entriesInRange(ledger.entries, rangeFor(month, 'month'))
    const monthTotals = totals(monthEntries)
    const edit = (entry: Entry) => setModal({ type: 'entry', entry })
    const latest = [...monthEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5)
    if (view === 'overview') {
      const balance = totals(ledger.entries.filter(entry => entry.date <= today)).balance
      content = <>
        <div className="toolbar"><div className="month-control">{monthPager}</div></div>
        <div className="dashboard-grid">
          <div className="summary-column">
            <section className="balance-card" aria-labelledby="balance-heading">
              <div className="balance-art" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="balance-content">
                <div className="balance-caption"><span className="balance-icon"><Wallet size={18} /></span><h2 id="balance-heading">Текущий баланс</h2></div>
                <strong className={`balance-amount ${money(balance).length > 14 ? 'long' : ''}`}>{money(balance)}</strong>
                <span className="balance-note">Все операции · RUB</span>
              </div>
            </section>
            <div className="flow-grid">
              <Flow kind="income" cents={monthTotals.income} />
              <Flow kind="expense" cents={monthTotals.expense} />
            </div>
          </div>
          <SpendingChart entries={monthEntries} categories={ledger.categories} />
        </div>
        <section className="panel history-panel" aria-labelledby="recent-heading">
          <div className="panel-heading"><h2 id="recent-heading">Последние операции</h2>
            <a className="text-link" href="#history" onClick={() => setFilter('all')}>Все операции <ChevronRight size={16} /></a>
          </div>
          {latest.length ? <EntryList entries={latest} categories={ledger.categories} edit={edit} />
            : <Empty title="За этот месяц пока пусто" description="Добавьте доход или расход, чтобы начать учёт." />}
        </section>
      </>
    }
    if (view === 'history') {
      const filtered = monthEntries.filter(entry => filter === 'all' || entry.kind === filter)
      content = <>
        <div className="toolbar history-toolbar">{monthPager}<Choice label="Фильтр операций" value={filter} choose={setFilter} items={filterChoices} /></div>
        <section className="panel history-panel full-history" aria-label="История операций">
          {filtered.length ? <EntryList entries={filtered} categories={ledger.categories} edit={edit} grouped />
            : <Empty title="Операций пока нет" description="Добавьте операцию или выберите другой период." />}
        </section>
      </>
    }
    if (view === 'stats') {
      const selected = entriesInRange(ledger.entries, rangeFor(anchor, period))
      const tally = totals(selected)
      const currentRange = rangeFor(today, period)[0]
      content = <>
        <div className="toolbar stats-toolbar">
          <Choice items={periodChoices} value={period} label="Период статистики" choose={setPeriod} />
          <Pager label={periodLabel(anchor, period)} previous={() => setAnchor(shiftPeriod(anchor, period, -1))}
            next={() => {
              const next = shiftPeriod(anchor, period, 1)
              setAnchor(next > today ? today : next)
            }} disablePrevious={rangeFor(anchor, period)[0] <= firstDay} disableNext={rangeFor(anchor, period)[0] >= currentRange} />
        </div>
        <div className="dashboard-grid stats-grid">
          <div className="summary-column">
            <section className="panel net-panel">
              <div className="panel-heading"><h2>Итог за период</h2></div>
              <strong>{money(tally.balance)}</strong><span>{selected.length} {countLabels[operationCount.select(selected.length)]}</span>
            </section>
            <div className="flow-grid"><Flow kind="income" cents={tally.income} /><Flow kind="expense" cents={tally.expense} /></div>
          </div>
          <SpendingChart entries={selected} categories={ledger.categories} />
        </div>
      </>
    }
    if (isRecurring) {
      content = <section className="panel settings-panel" aria-label="Список регулярных платежей">
        <div className="panel-heading"><h2>Расписание</h2><button className="secondary compact add-rule" onClick={() => setModal({ type: 'rule' })}><Plus size={17} /> Новый платёж</button></div>
        <p className="section-description">Операции добавляются по расписанию при открытии приложения, в том числе без интернета.</p>
        {ledger.rules.length ? <ul className="rule-list">{ledger.rules.map(rule => {
          const category = ledger.categories.find(item => item.id === rule.categoryId)!
          const next = occurrence(rule, rule.nextIndex)
          return <li className="rule-row" key={rule.id}>
            <button type="button" className="item-row" onClick={() => setModal({ type: 'rule', rule })}>
              <CategoryBadge category={category} />
              <span className="item-text"><strong>{rule.note || category.name}</strong>
                <span>{frequencies[rule.frequency]} · {rule.active ? `следующий ${dateLabel(next)}` : 'на паузе'}</span>
              </span>
              <strong className={`entry-amount ${rule.kind}`}>{rule.kind === 'income' ? '+' : '−'}{money(rule.cents)}</strong>
              <ChevronRight className="row-chevron" size={16} />
            </button>
            <button type="button" className="switch" role="switch" aria-label={`Активный платёж: ${rule.note || category.name}`} aria-checked={rule.active} onClick={() => void toggleRule(rule)}><span /></button>
          </li>
        })}</ul> : <Empty icon={<Clock3 />} title="Список платежей пуст" description="Добавьте подписку, оплату аренды или другое регулярное списание." />}
      </section>
    }
    if (view === 'settings') {
      const expenseCategories = ledger.categories.filter(category => category.kind === 'expense')
      const customIncomeCategories = ledger.categories.filter(category => category.kind === 'income' && isCustomCategory(category))
      const editCategory = (category: Category) => setModal({ type: 'category', category })
      content = <div className="settings-grid">
        <section className="panel settings-panel mobile-preferences">
          <div className="panel-heading"><h2>Приложение</h2></div>
          <button type="button" className="settings-row" onClick={() => navigate('recurring')}><Repeat2 /><span>Регулярные платежи</span><ChevronRight /></button>
          <button type="button" className="settings-row" onClick={() => void changeTheme()}><ThemeIcon /><span>{themeLabel}</span><ChevronRight /></button>
        </section>
        <div className="settings-column">
          <section className="panel settings-panel">
            <div className="panel-heading"><h2><Tags size={19} /> Категории расходов</h2></div>
            <CategorySettingsList categories={expenseCategories} edit={editCategory} />
            <button type="button" className="secondary new-category" onClick={() => setModal({ type: 'category' })}><Plus size={18} /> Создать категорию</button>
          </section>
          {customIncomeCategories.length > 0 && <section className="panel settings-panel">
            <div className="panel-heading"><h2><Tags size={19} /> Категории доходов</h2></div>
            <CategorySettingsList categories={customIncomeCategories} edit={editCategory} />
          </section>}
        </div>
        <div className="settings-column">
          <section className="panel settings-panel">
            <div className="panel-heading"><h2>Резервное копирование</h2></div>
            <p className="section-description">Сохраните резервную копию или импортируйте файл JSON из «Сальдо» или MoneyManager.</p>
            <button className="settings-row" type="button" onClick={() => void exportFile()}><ArrowDownToLine /><span>Экспорт данных</span><ChevronRight /></button>
            <button className="settings-row" type="button" onClick={() => fileInput.current?.click()}><ArrowUpFromLine /><span>Импорт данных</span><ChevronRight /></button>
            {isAndroid && (androidInfo?.hasUpdateBackup || hasMigrationBackup) &&
              <button className="settings-row" type="button" onClick={() => void restoreBeforeUpdate()}><ArrowUpFromLine /><span>Копия перед обновлением</span><ChevronRight /></button>}
            <input hidden type="file" accept=".json,application/json" aria-label="Файл для импорта" ref={fileInput} onChange={event => void importFile(event)} />
          </section>
          {isAndroid && <section className="panel settings-panel">
            <div className="panel-heading"><h2>Обновления</h2></div>
            {androidInfo && <p className="section-description">Версия {androidInfo.version}</p>}
            <button className="settings-row" type="button" onClick={() => void findUpdate()} disabled={checkingUpdate}><RefreshCw /><span>{checkingUpdate ? 'Проверяю…' : 'Проверить обновления'}</span><ChevronRight /></button>
          </section>}
          {!isAndroid && !installed && <section className="panel settings-panel">
            <div className="panel-heading"><h2>На главном экране</h2></div>
            <button type="button" className="settings-row" onClick={() => void installApp()}><Smartphone /><span>Установить приложение</span><ChevronRight /></button>
          </section>}
        </div>
      </div>
    }

    const defaults: Partial<Record<Kind, string>> = {}
    for (const entry of [...ledger.entries].sort((a, b) => b.createdAt - a.createdAt)) {
      defaults[entry.kind] ??= entry.categoryId
      if (defaults.expense && defaults.income) break
    }
    if (modal?.type === 'entry') {
      const { entry } = modal
      dialogTitle = entry ? 'Редактировать операцию' : 'Новая операция'
      dialogBody = <OperationEditor initial={entry} categories={ledger.categories} defaults={defaults} save={draft => saveEntry(draft, entry)}
        remove={entry ? () => setModal({ type: 'delete-entry', entry }) : undefined} />
    }
    if (modal?.type === 'rule') {
      const { rule } = modal
      dialogTitle = rule ? 'Редактировать платёж' : 'Новый регулярный платёж'
      dialogBody = <OperationEditor isRule initial={rule} categories={ledger.categories} defaults={defaults} save={draft => saveRule(draft, rule)}
        remove={rule ? () => setModal({ type: 'delete-rule', rule }) : undefined} />
    }
    if (modal?.type === 'category') {
      const { category } = modal
      dialogTitle = category ? 'Редактировать категорию' : 'Новая категория'
      dialogBody = <CategoryEditor initial={category} save={async details => {
        await commit(current => { saveCategory(current, details, category?.id) })
        closeModal()
        notify(category ? 'Категория обновлена' : 'Категория создана')
      }} remove={category ? () => setModal({ type: 'delete-category', category }) : undefined} />
    }
    if (modal?.type === 'delete-category') {
      const { category } = modal
      dialogTitle = 'Удалить категорию?'
      dialogBody = <Confirm description={`Связанные операции и регулярные платежи из категории «${category.name}» перейдут в «Другое».`} label="Удалить"
        close={() => setModal({ type: 'category', category })} confirm={async () => {
          await commit(current => { deleteCategory(current, category.id) })
          closeModal()
          notify('Категория удалена')
        }} />
    }
    if (modal?.type === 'delete-entry') {
      const { entry } = modal
      dialogTitle = 'Удалить операцию?'
      dialogBody = <Confirm description={`Операция на ${money(entry.cents)} за ${dateLabel(entry.date)} будет удалена из истории.`} label="Удалить"
        close={() => setModal({ type: 'entry', entry })} confirm={async () => {
          await commit(current => { current.entries = current.entries.filter(item => item.id !== entry.id) })
          closeModal()
          notify('Операция удалена')
        }} />
    }
    if (modal?.type === 'delete-rule') {
      const { rule } = modal
      dialogTitle = 'Удалить регулярный платёж?'
      dialogBody = <Confirm description="Расписание будет удалено. Уже добавленные операции останутся в истории." label="Удалить"
        close={() => setModal({ type: 'rule', rule })} confirm={async () => {
          await commit(current => { current.rules = current.rules.filter(item => item.id !== rule.id) })
          closeModal()
          notify('Платёж удалён')
        }} />
    }
    if (modal?.type === 'import' && modal.data.format === 'saldo') {
      const backup = modal.data.ledger
      dialogTitle = 'Восстановить данные?'
      dialogBody = <Confirm description={`Текущие данные будут заменены данными из файла. Операций в копии: ${backup.entries.length}.`} label="Восстановить"
        close={closeModal} confirm={async () => {
          await commit(() => backup)
          closeModal()
          notify('Данные восстановлены')
        }} />
    }
    if (modal?.type === 'import' && modal.data.format === 'money-manager') {
      const { entries, hasPictures } = modal.data
      const pictures = hasPictures ? ' Фотографии из файла будут пропущены.' : ''
      dialogTitle = 'Импорт из MoneyManager'
      dialogBody = <Confirm description={`Операций в файле: ${entries.length}. Импорт дополнит журнал. Уже импортированные записи будут пропущены.${pictures}`} label="Импортировать"
        close={closeModal} destructive={false} confirm={async () => {
          let added: Entry[] = []
          await commit(current => { added = appendMoneyManagerEntries(current, entries) })
          closeModal()
          if (!added.length) { notify('Эти операции уже импортированы'); return }
          const latest = added.reduce((last, entry) => entry.date > last && entry.date <= today ? entry.date : last, '')
          if (latest) setMonth(offsetMonth(latest, 0))
          setFilter('all')
          navigate('history')
          notify(`Операций добавлено: ${added.length}`)
        }} />
    }
    if (modal?.type === 'install') {
      dialogTitle = 'Установка на Android'
      dialogBody = <div className="dialog-form">
        <p className="confirm-copy">Откройте эту страницу в Chrome. В меню ⋮ выберите «Установить приложение» или «Добавить на главный экран» и подтвердите установку.</p>
        <button className="primary form-submit" type="button" onClick={closeModal}>Понятно</button>
      </div>
    }
    if (modal?.type === 'android-update') {
      const { release } = modal
      dialogTitle = `Доступна версия ${release.version}`
      dialogBody = <div className="dialog-form">
        {release.notes && <p className="confirm-copy release-notes">{release.notes}</p>}
        {updateError && <p className="form-error" role="alert">{updateError}</p>}
        <button type="button" className="primary form-submit" onClick={() => void downloadUpdate(release)} disabled={installingUpdate}>
          {installingUpdate ? 'Подготовка APK…' : 'Скачать и установить'}
        </button>
      </div>
    }
  }

  function mobileLink(destination: View, text: string, icon: ReactNode, active = view === destination) {
    return <a href={`#${destination}`} aria-current={active ? 'page' : undefined} className="mobile-link">{icon}<span>{text}</span></a>
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="brand-caption">Личные финансы</div>
      <nav className="side-nav" aria-label="Основной раздел">{viewOrder.map(item => {
        const Icon = views[item].icon
        const name = item === 'recurring' ? 'Регулярные' : views[item].title
        return <a key={item} href={`#${item}`} aria-current={item === view ? 'page' : undefined}><Icon size={19} /><span>{name}</span></a>
      })}</nav>
      <div className="side-footer">
        <button className="theme-button" type="button" onClick={() => void changeTheme()} disabled={!ledger}><ThemeIcon size={18} /><span>{themeLabel}</span></button>
        <div className="local-status"><LockKeyhole size={14} /><span>Данные на устройстве</span></div>
      </div>
    </aside>
    <main className="main">
      <div className="mobile-brand"><Brand /></div>
      <header className="page-header">
        <div>
          <h1>{views[view].title}</h1>
          {view === 'overview' && <p className="header-date">{todayFormatter.format(new Date())}</p>}
        </div>
        {!isRecurring && <button className="primary desktop-add" type="button" onClick={addEntry} disabled={!ledger}><Plus size={21} /> Добавить</button>}
        {isRecurring && <a className="secondary mobile-back" href="#settings">Настройки</a>}
      </header>
      {loadError && <div className="panel loading-state" role="alert">
        <Empty icon={<CircleHelp />} title="Хранилище недоступно" description="Откройте приложение в обычной вкладке и повторите попытку." />
        <button type="button" className="secondary" onClick={() => void refresh()}>Повторить</button>
      </div>}
      {!ledger && !loadError && <div className="panel loading-state" role="status">Загрузка…</div>}
      {ledger && <div className="page-content" key={view}>{content}</div>}
    </main>
    <nav className="mobile-nav" aria-label="Основной раздел">
      {mobileLink('overview', 'Обзор', <House size={21} />)}
      {mobileLink('history', 'Операции', <ReceiptText size={21} />)}
      <button type="button" className="mobile-add" aria-label="Добавить операцию" onClick={addEntry} disabled={!ledger}><Plus size={28} /></button>
      {mobileLink('stats', 'Статистика', <ChartPie size={21} />)}
      {mobileLink('settings', 'Ещё', <MoreHorizontal size={23} />, view === 'settings' || isRecurring)}
    </nav>
    {modal && <Dialog title={dialogTitle} close={closeModal} busy={installingUpdate}>{dialogBody}</Dialog>}
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.message}</div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
