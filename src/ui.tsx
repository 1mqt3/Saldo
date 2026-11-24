import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, CarFront, Check, ChevronDown, ChevronLeft,
  ChevronRight, Circle, Coffee, Gamepad2, Gift, HeartPulse, House, PawPrint, Plane,
  Plus, ReceiptText, ShoppingBag, ShoppingBasket, Trash2, Wallet, BookOpen, X,
} from 'lucide-react'
import {
  categoryIcons, categoryTotals, dateKey, dateLabel, formatAmount, frequencies, money,
  palette, parseAmount,
} from './model.ts'
import type { Category, CategoryIcon, Entry, Frequency, Kind, Rule } from './model.ts'

const iconMap = {
  basket: ShoppingBasket, car: CarFront, coffee: Coffee, home: House, heart: HeartPulse,
  shopping: ShoppingBag, game: Gamepad2, wallet: Wallet, gift: Gift, plane: Plane,
  book: BookOpen, paw: PawPrint, dot: Circle,
}

export function CategoryGlyph({ icon, size = 18 }: { icon: CategoryIcon; size?: number }) {
  const Icon = iconMap[icon]
  return <Icon size={size} aria-hidden="true" />
}

export function CategoryBadge({ category }: { category: Category }) {
  return <span className="category-badge" style={{ color: category.color, backgroundColor: `${category.color}24` }}>
    <CategoryGlyph icon={category.icon} />
  </span>
}

export function Pager({ label, previous, next, disablePrevious, disableNext }: {
  label: string; previous: () => void; next: () => void; disablePrevious?: boolean; disableNext?: boolean
}) {
  return <div className="pager">
    <button className="icon-button" type="button" onClick={previous} disabled={disablePrevious} aria-label="Предыдущий период"><ChevronLeft /></button>
    <span aria-live="polite">{label}</span>
    <button className="icon-button" type="button" onClick={next} disabled={disableNext} aria-label="Следующий период"><ChevronRight /></button>
  </div>
}

export function Choice<T extends string>({ items, value, choose, label }: {
  items: { value: T; label: string }[]; value: T; choose: (value: T) => void; label: string
}) {
  return <div className="segmented" role="group" aria-label={label}>
    {items.map(item => <button type="button" key={item.value} aria-pressed={item.value === value} onClick={() => choose(item.value)}>{item.label}</button>)}
  </div>
}

export function Flow({ kind, cents }: { kind: Kind; cents: number }) {
  const isIncome = kind === 'income'
  const Icon = isIncome ? ArrowDownLeft : ArrowUpRight
  return <div className={`flow ${kind}`}>
    <span className="flow-icon"><Icon size={19} aria-hidden="true" /></span>
    <div><span className="flow-label">{isIncome ? 'Доходы' : 'Расходы'}</span><strong>{money(cents)}</strong></div>
  </div>
}

export function SpendingChart({ entries, categories }: { entries: Entry[]; categories: Category[] }) {
  const data = categoryTotals(entries, categories)
  const total = data.reduce((sum, item) => sum + item.cents, 0)
  let start = 0
  const colors = data.map(item => {
    const end = start + item.cents / total * 100
    const stop = `${item.color} ${start}% ${end}%`
    start = end
    return stop
  })
  const background = data.length === 1 ? data[0].color : `conic-gradient(${colors.join(', ')})`
  return <section className="panel chart-panel" aria-labelledby="chart-heading">
    <div className="panel-heading"><h2 id="chart-heading">Расходы по категориям</h2></div>
    <div className="chart-body">
      <div className={`donut ${total ? 'populated' : ''}`} style={total ? { background } : undefined}>
        <div className="donut-middle"><span>Всего расходов</span><strong>{money(total)}</strong></div>
      </div>
      {data.length > 0
        ? <ul className="chart-legend">{data.map(item => <li key={item.id}>
            <span className="legend-dot" style={{ background: item.color }} />
            <span className="legend-name">{item.name}</span>
            <span className="legend-share">{Math.round(item.cents / total * 100)}%</span>
            <strong>{money(item.cents)}</strong>
          </li>)}</ul>
        : <p className="chart-empty">Здесь появятся категории ваших расходов</p>}
    </div>
  </section>
}

export function Empty({ icon = <ReceiptText />, title, description }: { icon?: ReactNode; title: string; description: string }) {
  return <div className="empty-state">
    <span className="empty-icon" aria-hidden="true">{icon}</span>
    <span><strong>{title}</strong><span>{description}</span></span>
  </div>
}

export function EntryList({ entries, categories, edit, grouped = false }: {
  entries: Entry[]; categories: Category[]; edit: (entry: Entry) => void; grouped?: boolean
}) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const categoryMap = new Map(categories.map(category => [category.id, category]))
  return <ul className="entry-list">{sorted.map((entry, index) => {
    const category = categoryMap.get(entry.categoryId)!
    const showDate = grouped && (index === 0 || sorted[index - 1].date !== entry.date)
    return <li key={entry.id}>
      {showDate && <div className="entry-date">{entry.date === dateKey() ? 'Сегодня' : dateLabel(entry.date)}</div>}
      <button className="item-row" type="button" onClick={() => edit(entry)}>
        <CategoryBadge category={category} />
        <span className="item-text">
          <strong>{category.name}</strong>
          <span>{[entry.note, grouped ? (entry.ruleId ? 'Регулярная операция' : '') : dateLabel(entry.date)].filter(Boolean).join(' · ')}</span>
        </span>
        <strong className={`entry-amount ${entry.kind}`}>{entry.kind === 'income' ? '+' : '−'}{money(entry.cents)}</strong>
        <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
      </button>
    </li>
  })}</ul>
}

export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    const focusTarget = dialog.querySelector<HTMLElement>('[data-initial-focus]')
    focusTarget?.focus()
    const scrollBefore = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = scrollBefore
    }
  }, [])
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); close() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
    }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2>
      <button type="button" className="icon-button close-button" aria-label="Закрыть" onClick={close}><X size={20} /></button>
    </div>
    {children}
  </dialog>
}

const kindChoices: { value: Kind; label: string }[] = [{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }]

export interface OperationDraft {
  kind: Kind
  cents: number
  categoryId: string
  note: string
  date: string
  frequency: Frequency
}

export function OperationEditor({ categories, initial, isRule, defaults, save, remove }: {
  categories: Category[]; initial?: Entry | Rule; isRule?: boolean; defaults: Partial<Record<Kind, string>>
  save: (draft: OperationDraft) => Promise<void>; remove?: () => void
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'expense')
  const [amount, setAmount] = useState(initial ? formatAmount(initial.cents) : '')
  const [chosen, setChosen] = useState<Partial<Record<Kind, string>>>(initial ? { [initial.kind]: initial.categoryId } : {})
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initial ? ('date' in initial ? initial.date : initial.start) : dateKey())
  const [frequency, setFrequency] = useState<Frequency>(initial && 'frequency' in initial ? initial.frequency : 'monthly')
  const [details, setDetails] = useState(Boolean(initial || isRule))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const available = categories.filter(category => category.kind === kind)
  const categoryId = chosen[kind] || defaults[kind] || available[0]?.id
  const amountId = 'operation-amount'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const cents = parseAmount(amount)
    if (!cents) { setError('Введите сумму от 0,01 ₽ до 999 999 999,99 ₽.'); return }
    if (!categoryId || !date) { setError('Укажите категорию и дату.'); return }
    setError('')
    setPending(true)
    try { await save({ kind, cents, categoryId, note: note.trim(), date, frequency }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить операцию.') }
    finally { setPending(false) }
  }

  return <form className="dialog-form" onSubmit={submit}>
    <Choice label="Вид операции" items={kindChoices} value={kind} choose={setKind} />
    <div className="amount-field">
      <label htmlFor={amountId}>Сумма</label>
      <div><input id={amountId} inputMode="decimal" placeholder="0" value={amount} maxLength={20} required
        onFocus={event => { if (initial) event.target.select() }}
        data-initial-focus={!initial ? '' : undefined}
        onChange={event => { setAmount(event.target.value); setError('') }} /><span>₽</span></div>
    </div>
    <fieldset className="category-field"><legend>Категория</legend>
      <div className="category-options">{available.map(category => <label className="category-option" key={category.id}>
        <input type="radio" name="operation-category" value={category.id} checked={categoryId === category.id}
          onChange={() => setChosen({ ...chosen, [kind]: category.id })} />
        <span><span style={{ color: category.color }}><CategoryGlyph icon={category.icon} size={16} /></span>{category.name}</span>
      </label>)}</div>
    </fieldset>
    {isRule && <label className="form-field">Повтор<select value={frequency} onChange={event => setFrequency(event.target.value as Frequency)}>
      {Object.entries(frequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>}
    {!details && <button type="button" className="details-toggle" onClick={() => setDetails(true)}><CalendarDays size={17} /> Дата и заметка <ChevronDown size={15} /></button>}
    {details && <div className="detail-fields">
      <label className="form-field">{isRule ? 'Первый платёж' : 'Дата'}<input type="date" value={date} min="1900-01-01" max={isRule ? '9999-12-31' : dateKey()} required
        onChange={event => setDate(event.target.value)} /></label>
      <label className="form-field">Заметка<input value={note} placeholder="Необязательно" maxLength={100} onChange={event => setNote(event.target.value)} /></label>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      {remove && <button type="button" className="icon-button delete-button" aria-label={isRule ? 'Удалить платёж' : 'Удалить операцию'} onClick={remove}><Trash2 size={20} /></button>}
      <button type="submit" className="primary form-submit" disabled={pending}>{pending ? 'Сохраняю…' : initial || isRule ? 'Сохранить' : 'Добавить операцию'}</button>
    </div>
  </form>
}

const glyphLabels: Record<CategoryIcon, string> = {
  basket: 'Продукты', car: 'Транспорт', coffee: 'Кофе', home: 'Дом', heart: 'Здоровье',
  shopping: 'Покупки', game: 'Игры', wallet: 'Кошелёк', gift: 'Подарок', plane: 'Самолёт',
  book: 'Книга', paw: 'Лапа', dot: 'Круг',
}

export function CategoryEditor({ categories, save }: { categories: Category[]; save: (category: Category) => Promise<void> }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(palette[0])
  const [icon, setIcon] = useState<CategoryIcon>('dot')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const cleaned = name.trim()
    if (!cleaned) { setError('Введите название.'); return }
    if (categories.some(category => category.kind === 'expense' && category.name.toLocaleLowerCase('ru') === cleaned.toLocaleLowerCase('ru'))) {
      setError('Категория с таким названием уже есть.')
      return
    }
    setPending(true)
    try { await save({ id: crypto.randomUUID(), kind: 'expense', name: cleaned, color, icon }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить категорию.') }
    finally { setPending(false) }
  }
  return <form className="dialog-form" onSubmit={submit}>
    <label className="form-field">Название<input data-initial-focus required maxLength={32} value={name} placeholder="Например, Путешествия"
      onChange={event => { setName(event.target.value); setError('') }} /></label>
    <fieldset><legend>Цвет</legend><div className="swatches">{palette.map((swatch, index) => <label className="swatch" key={swatch}>
      <input type="radio" name="color" aria-label={['Синий', 'Зелёный', 'Оранжевый', 'Розовый', 'Лиловый', 'Голубой', 'Жёлтый', 'Коралловый'][index]}
        checked={swatch === color} onChange={() => setColor(swatch)} />
      <span style={{ background: swatch }}>{swatch === color && <Check size={17} />}</span>
    </label>)}</div></fieldset>
    <fieldset><legend>Значок</legend><div className="swatches">{categoryIcons.map(glyph => <label className="swatch glyph-swatch" key={glyph}>
      <input type="radio" name="glyph" aria-label={glyphLabels[glyph]} checked={icon === glyph} onChange={() => setIcon(glyph)} />
      <span><CategoryGlyph icon={glyph} /></span>
    </label>)}</div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary form-submit" type="submit" disabled={pending}><Plus size={18} /> Создать категорию</button>
  </form>
}

export function Confirm({ description, label, close, confirm, destructive = true }: {
  description: string; label: string; close: () => void; confirm: () => Promise<void>; destructive?: boolean
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function run() {
    if (pending) return
    setPending(true)
    try { await confirm() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.') }
    finally { setPending(false) }
  }
  return <div className="dialog-form">
    <p className="confirm-copy">{description}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="confirm-actions">
      <button type="button" className="secondary" onClick={close} disabled={pending}>Отмена</button>
      <button type="button" className={destructive ? 'danger' : 'primary'} onClick={() => void run()} disabled={pending}>{label}</button>
    </div>
  </div>
}

export function useInstallPrompt() {
  type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)
  useEffect(() => {
    const receive = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent) }
    const finish = () => { setPrompt(null); setInstalled(true) }
    addEventListener('beforeinstallprompt', receive)
    addEventListener('appinstalled', finish)
    return () => {
      removeEventListener('beforeinstallprompt', receive)
      removeEventListener('appinstalled', finish)
    }
  }, [])
  async function install() {
    if (!prompt) return false
    setPrompt(null)
    await prompt.prompt()
    if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true)
    return true
  }
  return { installed, install }
}
