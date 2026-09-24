import { check } from './harness.ts'
import { exportCode, importCode, loadSave, writeSave, validate, SAVE_KEY } from '../src/core/save.ts'
import { newSave } from '../src/core/salon.ts'

export function run() {
  const save = newSave(123)
  save.money = 512
  save.owned = ['plant', 'facial-kit-2']
  save.reviews = [{ id: 'a', day: 1, name: 'Zoë', stars: 5, text: 'Perfect, merci', treatment: 'facial', regular: false, disaster: false }]
  const code = exportCode(save)
  check('code prefix', code.startsWith('GLOW1-'))
  const back = importCode(code)
  check('code round trip', back.ok && back.save.money === 512 && back.save.owned.join() === 'plant,facial-kit-2')
  check('unicode survives', back.ok && back.save.reviews[0].name === 'Zoë')
  check('whitespace tolerated', importCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `).ok)
  const typo = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13)
  check('typo caught', !importCode(typo).ok)
  check('junk rejected', !importCode('hello').ok && !importCode('').ok)
  check('unknown items dropped', validate({ ...save, owned: ['plant', 'hack', 'stylist'] })?.owned.join() === 'plant')
  check('bad version rejected', validate({ ...save, v: 2 }) === null)
  check('money clamped', (validate({ ...save, money: Infinity })?.money ?? 0) === 60)

  // localStorage stand-in, including one that throws (private window).
  const map = new Map<string, string>()
  const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) } }
  check('write', writeSave(store, save) && map.has(SAVE_KEY))
  check('load', loadSave(store)?.money === 512)
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  check('broken storage load', loadSave(broken) === null)
  check('broken storage write', writeSave(broken, save) === false)
  check('no storage', loadSave(null) === null)
  map.set(SAVE_KEY, '{not json')
  check('corrupt save ignored', loadSave(store) === null)
}
