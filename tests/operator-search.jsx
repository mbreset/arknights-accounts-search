import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/index.css'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ROW_SELECTOR = '.account-number'
const renderApp = () => <App />
window.fetch = async input => {
  const url = new URL(input, location.origin)
  if (url.pathname.endsWith('/data/accounts.json')) return Response.json({version:1,updated_at:null,sprite:null,operator_names:names,accounts:rows})
  if (url.pathname.endsWith('/visit')) return new Response(null,{status:204})
  throw new Error('Unexpected test request '+url)
}

const names = ['토가와사키코', '슈바르츠']
let root
const rows = [1, 2, 3, 6].map((potential, index) => ({
  account_number: String(index + 1).padStart(5, '0'), price: 10000,
  operators: [{ name: names[0], potential, color: null, sprite_index: null }],
}))
rows.push({ account_number: '00005', price: 10000, operators: [{name: names[1],potential:2,color:null,sprite_index:null}] })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const field = () => document.querySelector('input[role=combobox]')
const chips = () => [...document.querySelectorAll('.search-chip')].map(e => e.dataset.searchLabel ?? e.textContent)
const resultIds = () => [...document.querySelectorAll(ROW_SELECTOR)].map(e => e.textContent.trim())
const type = async value => act(() => {
  field().focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field(), value)
  field().dispatchEvent(new Event('input', { bubbles: true }))
})
const key = async value => act(() => field().dispatchEvent(new KeyboardEvent('keydown', {key:value, bubbles:true})))
const click = async label => act(() => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label || b.getAttribute('aria-label') === label)
  assert(button, 'Missing button '+label)
  button.click()
})
const mount = async () => {
  if (root) await act(() => root.unmount())
  root = createRoot(document.getElementById('root'))
  await act(() => root.render(renderApp()))
}
const tests = [
  ['Potential menu is discoverable after Enter and changes the current operator', async () => {
    await mount(); await type('토가'); await key('Enter')
    assert(document.querySelector('.operator-potential-trigger').textContent === '잠재', 'Default control hidden')
    await click('토가와사키코 최소 잠재: 제한 없음')
    assert(document.querySelectorAll('[role=menuitemradio]').length === 6, 'Missing choices')
    assert(document.querySelector('[role=menuitemradio][aria-checked=true]').textContent === '제한 없음', 'Wrong selection')
    assert(!document.querySelector('[role=listbox]'), 'Autocomplete overlaps menu')
    await click('2잠 이상')
    assert(chips().join() === '토가와사키코 x2', 'Menu did not set x2')
    assert(document.querySelector('.operator-potential-trigger').textContent === '2잠 이상', 'Minimum not visible')
    assert(resultIds().join() === '00002,00003,00004' && !document.querySelector('[role=menu]'), 'Results or close incorrect')
  }],
  ['Potential menu can reset to unrestricted in OR mode', async () => {
    await mount(); await type('토가3'); await key('Enter'); await click('OR')
    await click('토가와사키코 최소 잠재: 3잠 이상'); await click('제한 없음')
    assert(chips().join() === '토가와사키코' && resultIds().join() === '00001,00002,00003,00004', 'Unrestricted failed')
  }],
  ['Outside click and Escape dismiss without modifying conditions; arrows move focus', async () => {
    await mount(); await type('토가'); await key('Enter'); await click('토가와사키코 최소 잠재: 제한 없음')
    await act(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true})))
    assert(document.activeElement.textContent === '2잠 이상', 'Arrow focus failed')
    await act(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})))
    assert(!document.querySelector('[role=menu]') && document.activeElement.classList.contains('operator-potential-trigger'), 'Escape focus not restored')
    await click('토가와사키코 최소 잠재: 제한 없음')
    await act(() => document.body.dispatchEvent(new Event('pointerdown', {bubbles:true})))
    assert(!document.querySelector('[role=menu]') && chips().join() === '토가와사키코', 'Outside click changed condition')
  }],
  ['Only one menu stays open and selection affects just its own chip', async () => {
    await mount(); await type('토가'); await key('Enter'); await type('슈바2'); await key('Enter'); await click('OR')
    await click('슈바르츠 최소 잠재: 2잠 이상'); await click('토가와사키코 최소 잠재: 제한 없음')
    assert(document.querySelectorAll('[role=menu]').length === 1, 'Multiple menus open')
    await click('3잠 이상')
    assert(chips().join() === '토가와사키코 x3,슈바르츠 x2', 'Other chip changed')
    assert(resultIds().join() === '00003,00004,00005', 'OR results incorrect')
    await click('토가와사키코 x3 검색 조건 삭제')
    assert(chips().join() === '슈바르츠 x2', 'Delete removed wrong chip')
  }],
  ['Choosing potential preserves the unsubmitted search input', async () => {
    await mount(); await type('토가'); await key('Enter'); await type('슈바')
    await click('토가와사키코 최소 잠재: 제한 없음'); await click('6잠')
    assert(field().value === '슈바' && chips().join() === '토가와사키코 x6', 'Unsubmitted input lost')
  }],
  ['All six spellings commit one normalized chip and match 2+ accounts', async () => {
    for (const value of ['토가와사키코x2','토가와사키코 x2','토가와사키코*2','토가와사키코 *2','토가와사키코2','토가와사키코 2']) {
      await mount(); await type(value); await key('Enter')
      assert(chips().join() === '토가와사키코 x2', 'Wrong chip '+value)
      assert(resultIds().join() === '00002,00003,00004', 'Wrong minimum results '+value)
    }
  }],
  ['AND repeated click and comma merge into x2 and x3; explicit suffix replaces', async () => {
    await mount(); await type('토가'); await key('Enter')
    await type('토가'); await click('토가와사키코 x2')
    assert(chips().join() === '토가와사키코 x2', 'Duplicate chip not merged')
    await type('토가'); await key(',')
    assert(chips().join() === '토가와사키코 x3', 'Comma did not increment')
    assert(resultIds().join() === '00003,00004', 'x3 results incorrect')
    await type('토가*2,')
    assert(chips().join() === '토가와사키코 x2', 'Pasted comma lost explicit potential')
  }],
  ['AND/OR respects minimum potential and mode changes keep chips', async () => {
    await mount(); await type('토가2'); await key('Enter'); await type('슈바2'); await key('Enter')
    assert(resultIds().length === 0, 'AND accepted one operator only')
    await click('OR')
    assert(chips().length === 2 && resultIds().join() === '00002,00003,00004,00005', 'OR mismatch')
    await type('토가')
    assert(!document.querySelector('[role=option]'), 'OR offers repeated bare operator')
    await type(''); await click('AND')
    assert(chips().join() === '토가와사키코 x2,슈바르츠 x2', 'Switch changed potentials')
  }],
  ['Bounds, deletion and reset retain expected behavior', async () => {
    await mount(); await type('토가7'); await key('Enter')
    assert(chips().length === 0 && document.querySelector('[role=alert]'), 'Invalid potential accepted')
    await type('토가6'); await key('Enter')
    assert(resultIds().join() === '00004', 'Max potential mismatch')
    await type(''); await key('Backspace')
    assert(chips().length === 0, 'Backspace did not remove grouped chip')
    await type('토가2'); await key('Enter')
    await click('전체 초기화')
    assert(chips().length === 0 && resultIds().length === 5, 'Reset failed')
  }],
  ['Account number search is not parsed as potential', async () => {
    await mount(); await type('00002'); await key('Enter')
    assert(resultIds().join() === '00002', 'Number search changed')
    assert(!document.querySelector('[role=option]'), 'Number got operator suggestions')
  }],
]
document.getElementById('run').onclick = async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const output = document.getElementById('results'); output.textContent = ''; let passed = 0
  for (const [name, test] of tests) {
    try { await test(); passed++; output.textContent += 'PASS: '+name+'\n' }
    catch (error) { output.textContent += 'FAIL: '+name+': '+error.message+'\n' }
  }
  output.textContent += passed+'/'+tests.length+' passed'
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
}
await mount()
if (new URLSearchParams(location.search).has('demo')) {
  await type('토가'); await key('Enter'); await click('토가와사키코 최소 잠재: 제한 없음')
  const bounds = document.querySelector('[role=menu]').getBoundingClientRect()
  assert(bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight, 'Menu outside viewport')
  document.getElementById('results').textContent = 'PASS: menu fits '+window.innerWidth+'px viewport'
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false
