import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react'
import './App.css'

type PublicOperator = {
  name: string
  color: string | null
  sprite_index: number | null
}

type PublicAccount = {
  account_number: string
  price: number
  operators: PublicOperator[]
}

type Catalog = {
  version: number
  updated_at: string | null
  sprite: { columns: number; rows: number; version: string } | null
  operator_names: string[]
  accounts: PublicAccount[]
}

type SearchMode = 'and' | 'or'
type SortMode = 'legacy' | 'price' | 'account_number'

type VisitorStats = {
  today: number
  total: number
}

const OPEN_KAKAO_URL = 'https://open.kakao.com/o/sJNEvhNe'
const IDFARM_URL = 'https://idfarm.co.kr/ItemMarket/gameItem/16769'
const PAGE_SIZE = 60
const VISITOR_API_URL = import.meta.env.VITE_VISITOR_API_URL?.trim()
  || 'https://arknights-visitor-stats.simm7531.workers.dev'

const getVisitorId = () => {
  const storageKey = 'arknights-search-visitor-id'
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored) return stored
    const created = crypto.randomUUID()
    window.localStorage.setItem(storageKey, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

const idFarmPrice = (price: number) => Math.floor(price / 0.95 / 100) * 100
const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`

function OperatorPortrait({ operator, sprite }: { operator: PublicOperator; sprite: Catalog['sprite'] }) {
  if (!sprite || operator.sprite_index == null) return <span className="operator-portrait-fallback">6</span>
  const column = operator.sprite_index % sprite.columns
  const row = Math.floor(operator.sprite_index / sprite.columns)
  const x = sprite.columns > 1 ? column / (sprite.columns - 1) * 100 : 0
  const y = sprite.rows > 1 ? row / (sprite.rows - 1) * 100 : 0
  return (
    <span
      className="operator-portrait"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}assets/operators.png?v=${encodeURIComponent(sprite.version)})`,
        backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
        backgroundPosition: `${x}% ${y}%`,
      }}
      aria-hidden="true"
    />
  )
}

function OperatorChip({ operator, sprite }: { operator: PublicOperator; sprite: Catalog['sprite'] }) {
  return (
    <span className="operator-chip" style={operator.color ? { '--operator-color': operator.color } as CSSProperties : undefined}>
      <OperatorPortrait operator={operator} sprite={sprite} />
      <span>{operator.name}</span>
    </span>
  )
}

function AccountModal({ account, sprite, onClose }: { account: PublicAccount; sprite: Catalog['sprite']; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copyNumber = async () => {
    await navigator.clipboard.writeText(account.account_number)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>ACCOUNT</span>
            <button id="account-modal-title" type="button" onClick={() => void copyNumber()} title="계정번호 복사">
              {account.account_number}
              {copied ? <Check size={15} /> : <Copy size={14} />}
            </button>
          </div>
          <button className="icon-button" type="button" aria-label="닫기" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="modal-price-strip">
          <div><span>오픈카톡 판매가</span><strong>{formatPrice(account.price)}</strong></div>
          <div><span>아이디팜 최종 결제가</span><strong>{formatPrice(idFarmPrice(account.price))}</strong><small>수수료 5% 적용</small></div>
        </div>

        <div className="modal-operators">
          {account.operators.map((operator, index) => (
            <OperatorChip key={`${operator.name}-${index}`} operator={operator} sprite={sprite} />
          ))}
        </div>

        <footer>
          <a className="purchase-button kakao" href={OPEN_KAKAO_URL} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> 오픈카톡 문의 <ExternalLink size={14} />
          </a>
          <a className="purchase-button idfarm" href={IDFARM_URL} target="_blank" rel="noreferrer">
            <ShoppingBag size={18} /> 아이디팜에서 보기 <ExternalLink size={14} />
          </a>
        </footer>
      </section>
    </div>
  )
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedOperators, setSelectedOperators] = useState<string[]>([])
  const [searchMode, setSearchMode] = useState<SearchMode>('and')
  const [sort, setSort] = useState<SortMode>('legacy')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [highlightedOption, setHighlightedOption] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedAccount, setSelectedAccount] = useState<PublicAccount | null>(null)
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const loadCatalog = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/accounts.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setCatalog(await response.json() as Catalog)
    } catch {
      setError('계정목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadCatalog() }, [])

  useEffect(() => {
    if (!VISITOR_API_URL) return

    const controller = new AbortController()
    const reportVisit = async () => {
      try {
        const response = await fetch(`${VISITOR_API_URL.replace(/\/$/, '')}/visit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitor_id: getVisitorId() }),
          keepalive: true,
          signal: controller.signal,
        })
        if (!response.ok) return
        const stats = await response.json() as VisitorStats
        if (Number.isSafeInteger(stats.today) && Number.isSafeInteger(stats.total)) setVisitorStats(stats)
      } catch {
        // Visitor statistics must never interfere with account search.
      }
    }

    void reportVisit()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) setAutocompleteOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const autocomplete = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('ko-KR')
    if (/^\d+$/.test(query)) return []
    return (catalog?.operator_names ?? [])
      .filter((name) => !selectedOperators.includes(name))
      .filter((name) => !query || name.toLocaleLowerCase('ko-KR').includes(query))
      .slice(0, 12)
  }, [catalog, searchText, selectedOperators])

  useEffect(() => {
    if (autocomplete.length && highlightedOption >= autocomplete.length) setHighlightedOption(0)
  }, [autocomplete, highlightedOption])

  const addOperator = (name: string | undefined) => {
    if (!name || selectedOperators.includes(name)) return
    setSelectedOperators((current) => [...current, name])
    setSearchText('')
    setAutocompleteOpen(false)
    setHighlightedOption(0)
    setPage(1)
    searchRef.current?.focus()
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && autocomplete.length) {
      event.preventDefault()
      setAutocompleteOpen(true)
      setHighlightedOption((current) => (current + 1) % autocomplete.length)
    } else if (event.key === 'ArrowUp' && autocomplete.length) {
      event.preventDefault()
      setAutocompleteOpen(true)
      setHighlightedOption((current) => current <= 0 ? autocomplete.length - 1 : current - 1)
    } else if ((event.key === 'Enter' || event.key === ',') && autocomplete.length) {
      event.preventDefault()
      addOperator(autocomplete[highlightedOption] ?? autocomplete[0])
    } else if (event.key === 'Backspace' && !searchText && selectedOperators.length) {
      setSelectedOperators((current) => current.slice(0, -1))
      setPage(1)
    } else if (event.key === 'Escape') {
      setAutocompleteOpen(false)
    }
  }

  const filteredAccounts = useMemo(() => {
    const minimum = Number(minPrice) || 0
    const maximum = Number(maxPrice) || Number.POSITIVE_INFINITY
    const accountNumberQuery = /^\d+$/.test(searchText.trim()) ? searchText.trim() : ''
    const filtered = (catalog?.accounts ?? []).filter((account) => {
      if (account.price < minimum || account.price > maximum) return false
      if (accountNumberQuery && !account.account_number.includes(accountNumberQuery)) return false
      if (!selectedOperators.length) return true
      const names = new Set(account.operators.map((operator) => operator.name))
      return searchMode === 'and'
        ? selectedOperators.every((name) => names.has(name))
        : selectedOperators.some((name) => names.has(name))
    })
    if (sort === 'legacy') return direction === 'desc' ? filtered : [...filtered].reverse()
    return [...filtered].sort((left, right) => {
      const compared = sort === 'price'
        ? left.price - right.price
        : Number(left.account_number) - Number(right.account_number)
      return direction === 'asc' ? compared : -compared
    })
  }, [catalog, direction, maxPrice, minPrice, searchMode, searchText, selectedOperators, sort])

  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE))
  const visibleAccounts = filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const reset = () => {
    setSearchText('')
    setSelectedOperators([])
    setSearchMode('and')
    setSort('legacy')
    setDirection('desc')
    setMinPrice('')
    setMaxPrice('')
    setPage(1)
    setAutocompleteOpen(false)
  }

  const updatedText = catalog?.updated_at
    ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(catalog.updated_at))
    : '-'

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-mark"><Search size={20} /></div>
        <div>
          <h1>명일방주 리세계 찾기</h1>
          <span>최근 업데이트 {updatedText}</span>
        </div>
        {visitorStats && (
          <div className="header-summary" aria-label="방문자 수">
            <span className="header-summary-title">방문자 수</span>
            <div className="header-summary-values">
              <span>오늘 <strong>{visitorStats.today.toLocaleString('ko-KR')}</strong></span>
              <span>전체 <strong>{visitorStats.total.toLocaleString('ko-KR')}</strong></span>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="search-panel">
          <div className="operator-search" ref={searchWrapRef}>
            <div className="search-field" onClick={() => searchRef.current?.focus()}>
              <Search size={18} />
              <div className="search-mode" onClick={(event) => event.stopPropagation()}>
                <button className={searchMode === 'and' ? 'active' : ''} type="button" onClick={() => { setSearchMode('and'); setPage(1) }}>AND</button>
                <button className={searchMode === 'or' ? 'active' : ''} type="button" onClick={() => { setSearchMode('or'); setPage(1) }}>OR</button>
              </div>
              {selectedOperators.map((name) => (
                <span className="search-chip" key={name}>
                  {name}
                  <button type="button" aria-label={`${name} 제거`} onClick={(event) => { event.stopPropagation(); setSelectedOperators((current) => current.filter((item) => item !== name)); setPage(1) }}><X size={12} /></button>
                </span>
              ))}
              <input
                ref={searchRef}
                value={searchText}
                placeholder={selectedOperators.length ? '오퍼레이터 또는 계정번호 추가' : '6성 오퍼레이터 또는 계정번호 검색'}
                onFocus={() => setAutocompleteOpen(true)}
                onChange={(event) => { setSearchText(event.target.value.replaceAll(',', '')); setAutocompleteOpen(true); setHighlightedOption(0) }}
                onKeyDown={onSearchKeyDown}
                role="combobox"
                aria-expanded={autocompleteOpen}
              />
            </div>
            {autocompleteOpen && autocomplete.length > 0 && (
              <div className="autocomplete" role="listbox">
                {autocomplete.map((name, index) => (
                  <button
                    className={highlightedOption === index ? 'highlighted' : ''}
                    type="button"
                    role="option"
                    aria-selected={highlightedOption === index}
                    key={name}
                    onMouseEnter={() => setHighlightedOption(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addOperator(name)}
                  >
                    {name}<ChevronRight size={15} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="filter-row">
            <label><span>최소 가격</span><input type="number" min="0" step="1000" value={minPrice} placeholder="0" onChange={(event) => { setMinPrice(event.target.value); setPage(1) }} /></label>
            <span className="filter-dash">-</span>
            <label><span>최대 가격</span><input type="number" min="0" step="1000" value={maxPrice} placeholder="제한 없음" onChange={(event) => { setMaxPrice(event.target.value); setPage(1) }} /></label>
            <select value={sort} onChange={(event) => { setSort(event.target.value as SortMode); setPage(1) }} aria-label="정렬 기준">
              <option value="legacy">한정 개수</option>
              <option value="price">가격</option>
              <option value="account_number">계정번호</option>
            </select>
            <button className="icon-button" type="button" title={direction === 'desc' ? '내림차순' : '오름차순'} aria-label={direction === 'desc' ? '내림차순' : '오름차순'} onClick={() => setDirection(direction === 'desc' ? 'asc' : 'desc')}>
              {direction === 'desc' ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
            </button>
            <button className="icon-button" type="button" title="전체 초기화" aria-label="전체 초기화" onClick={reset}><RotateCcw size={18} /></button>
            <button className="icon-button" type="button" title="목록 새로고침" aria-label="목록 새로고침" disabled={loading} onClick={() => void loadCatalog()}><RefreshCw size={18} className={loading ? 'spinning' : ''} /></button>
          </div>
        </section>

        <div className="result-heading">
          <span>검색 결과</span>
          <strong>{filteredAccounts.length.toLocaleString('ko-KR')}개</strong>
        </div>

        {error ? (
          <section className="state-panel error-state"><X size={22} /><strong>{error}</strong><button type="button" onClick={() => void loadCatalog()}>다시 시도</button></section>
        ) : loading && !catalog ? (
          <section className="state-panel"><LoaderCircle size={25} className="spinning" /><strong>계정목록을 불러오는 중</strong></section>
        ) : visibleAccounts.length === 0 ? (
          <section className="state-panel"><Search size={25} /><strong>조건에 맞는 계정이 없습니다.</strong></section>
        ) : (
          <section className={`account-list ${loading ? 'refreshing' : ''}`}>
            {visibleAccounts.map((account) => (
              <button className="account-row" type="button" key={account.account_number} onClick={() => setSelectedAccount(account)}>
                <strong className="account-number">{account.account_number}</strong>
                <div className="operator-list">
                  {account.operators.map((operator, index) => <OperatorChip key={`${operator.name}-${index}`} operator={operator} sprite={catalog?.sprite ?? null} />)}
                </div>
                <div className="price-block">
                  <span>판매가</span>
                  <strong>{formatPrice(account.price)}</strong>
                  <small>아이디팜 {formatPrice(idFarmPrice(account.price))}</small>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </section>
        )}

        {pageCount > 1 && (
          <nav className="pagination" aria-label="페이지 이동">
            <button className="icon-button" type="button" aria-label="이전 페이지" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
            <span><strong>{page}</strong> / {pageCount}</span>
            <button className="icon-button" type="button" aria-label="다음 페이지" disabled={page >= pageCount} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
          </nav>
        )}
      </main>

      <footer className="site-footer">
        <a href={OPEN_KAKAO_URL} target="_blank" rel="noreferrer"><MessageCircle size={16} /> 오픈카톡</a>
        <a href={IDFARM_URL} target="_blank" rel="noreferrer"><ShoppingBag size={16} /> 아이디팜</a>
      </footer>

      {selectedAccount && <AccountModal account={selectedAccount} sprite={catalog?.sprite ?? null} onClose={() => setSelectedAccount(null)} />}
    </div>
  )
}
