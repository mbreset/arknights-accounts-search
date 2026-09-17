import test from 'node:test'
import assert from 'node:assert/strict'
import { addOperatorTerm, matchesOperatorTerms, operatorInputError, operatorSuggestions, operatorTermLabel, parseOperatorInput } from '../src/operatorSearch.ts'

const names = ['토가와사키코', '슈바르츠', 'W', '오퍼2']
test('all suffix spellings and partial name completion', () => {
  for (const value of ['토가와사키코x2', '토가와사키코 x2', '토가와사키코*2', '토가와사키코 *2', '토가와사키코2', '토가와사키코 2', '토가와 사키코 X 2', '토가2']) {
    assert.equal(operatorSuggestions(value, names, [], 'and')[0], names[0])
    const terms = addOperatorTerm([], names[0], value, names, 'and')
    assert.equal(operatorTermLabel(terms[0]), '토가와사키코 x2')
  }
})
test('AND repeat selection increments a single chip and caps at six', () => {
  let terms = []
  for (let n = 1; n <= 8; n++) {
    terms = addOperatorTerm(terms, names[0], '토가', names, 'and')
    assert.equal(terms.length, 1)
    assert.equal(terms[0].potential, Math.min(n, 6))
  }
  assert.deepEqual(operatorSuggestions('토가', names, terms, 'and'), [])
})
test('explicit potential replaces, OR does not increment, switching preserves values', () => {
  const current = [{ name: names[0], potential: 3 }]
  assert.equal(addOperatorTerm(current, names[0], '토가', names, 'or')[0].potential, 3)
  assert.deepEqual(operatorSuggestions('토가', names, current, 'or'), [])
  assert.equal(operatorSuggestions('토가2', names, current, 'or')[0], names[0])
  for (const mode of ['and', 'or']) {
    assert.equal(addOperatorTerm(current, names[0], '토가2', names, mode)[0].potential, 2)
  }
  assert.equal(addOperatorTerm(current, names[0], '토가', names, 'and')[0].potential, 4)
})
test('potential bounds and account number/name input are not operators', () => {
  for (const value of ['토가0', '토가x7', '토가*99']) {
    assert.ok(operatorInputError(value, names))
    assert.deepEqual(operatorSuggestions(value, names, [], 'and'), [])
    assert.deepEqual(addOperatorTerm([], names[0], value, names, 'and'), [])
  }
  for (const value of ['04284', 'A2210281208']) {
    assert.deepEqual(operatorSuggestions(value, names, [], 'and'), [])
    assert.equal(operatorInputError(value, names), '')
  }
})
test('names ending in digits take precedence and missing potential means one', () => {
  assert.equal(parseOperatorInput('오퍼2', names).potential, 1)
  assert.deepEqual(addOperatorTerm([], '오퍼2', '오퍼2 x2', names, 'and'), [{name:'오퍼2',potential:2}])
  assert.equal(matchesOperatorTerms([{name:'W'}], [{name:'W',potential:2}], 'and'), false)
  assert.equal(matchesOperatorTerms([{name:'W'}], [{name:'W',potential:1}], 'and'), true)
})
test('minimum potential filters AND/OR without altering roster', () => {
  const operators = [{name:names[0],potential:3}, {name:'W',potential:1}]
  const serialized = JSON.stringify(operators)
  const terms = [{name:names[0],potential:2}, {name:'W',potential:2}]
  assert.equal(matchesOperatorTerms(operators, terms, 'and'), false)
  assert.equal(matchesOperatorTerms(operators, terms, 'or'), true)
  assert.equal(matchesOperatorTerms(operators, [], 'or'), true)
  assert.equal(matchesOperatorTerms(operators, [{name:'missing',potential:1}], 'or'), false)
  assert.equal(JSON.stringify(operators), serialized)
})
