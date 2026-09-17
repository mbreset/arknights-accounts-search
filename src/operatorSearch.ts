export type OperatorSearchTerm = { name: string; potential: number }
export type OperatorSearchMode = 'and' | 'or'
const normalize = (value: string) => value.replace(/\s+/g, '').toLocaleLowerCase('ko-KR')

export function parseOperatorInput(value: string, names: string[]) {
  const input = value.trim()
  const plain = { query: input, potential: 1, explicit: false, valid: true }
  if (names.some(name => normalize(name) === normalize(input))) return plain
  if (/^\d+$/.test(input) || /^[A-K]\d{10}$/i.test(input)) return plain
  const match = input.match(/^(.+?)\s*(?:[xX*]\s*)?(\d+)$/)
  if (!match) return plain
  const potential = Number(match[2])
  return { query: match[1].trim(), potential, explicit: true, valid: potential >= 1 && potential <= 6 }
}

export function operatorSuggestions(value: string, names: string[], selected: OperatorSearchTerm[], mode: OperatorSearchMode) {
  const input = parseOperatorInput(value, names)
  const query = normalize(input.query)
  if (!input.valid || /^\d+$/.test(query) || /^[a-k]\d{10}$/.test(query)) return []
  return names.filter(name => {
    const current = selected.find(term => term.name === name)
    return (!query || normalize(name).includes(query))
      && (!current || input.explicit || (mode === 'and' && current.potential < 6))
  }).sort((a, b) => Number(normalize(b) === query) - Number(normalize(a) === query)).slice(0, 12)
}

export function operatorInputError(value: string, names: string[]) {
  const input = parseOperatorInput(value, names)
  return !input.valid && names.some(name => normalize(name).includes(normalize(input.query)))
    ? '잠재는 1~6으로 입력해주세요.' : ''
}

export function addOperatorTerm(current: OperatorSearchTerm[], name: string, value: string, names: string[], mode: OperatorSearchMode) {
  const input = parseOperatorInput(value, names)
  if (!input.valid || !names.includes(name)) return current
  const previous = current.find(term => term.name === name)
  const potential = input.explicit ? input.potential
    : previous ? mode === 'and' ? Math.min(6, previous.potential + 1) : previous.potential : 1
  const term = { name, potential }
  return previous ? current.map(item => item.name === name ? term : item) : [...current, term]
}

export const operatorTermLabel = (term: OperatorSearchTerm) => term.potential > 1 ? `${term.name} x${term.potential}` : term.name

export function matchesOperatorTerms(operators: Array<{ name: string; potential?: number }>, terms: OperatorSearchTerm[], mode: OperatorSearchMode) {
  if (!terms.length) return true
  const matches = (term: OperatorSearchTerm) => operators.some(operator => operator.name === term.name && (operator.potential ?? 1) >= term.potential)
  return mode === 'and' ? terms.every(matches) : terms.some(matches)
}
