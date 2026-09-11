import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/services/openRouterKey.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

/** storage と fetch を差し替えて読み込む。保存された状態は store で観察できる。 */
function load({ apiKey = '', cached = null, fetchImpl } = {}) {
  const store = { status: cached }
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Date,
    Set,
    require: () => ({
      loadApiKey: () => apiKey,
      loadApiKeyStatusRaw: () => store.status,
      saveApiKeyStatusRaw: (value) => {
        store.status = value
      },
    }),
    fetch: fetchImpl ?? (async () => ({ ok: true, json: async () => ({ valid: true }) })),
  })
  return { ...exports, store }
}

// vm 越しのオブジェクトは Object の実体が違うため、deepEqual の前に素の値へ戻す。
const plain = (value) => JSON.parse(JSON.stringify(value))

test('未入力なら検査せず none を返す', async () => {
  const mod = load()
  assert.deepEqual(plain(await mod.checkApiKey('   ')), { state: 'none' })
})

test('Worker が有効と答えれば valid、上限切れなら exhausted', async () => {
  let payload = { valid: true, label: 'my key', exhausted: false }
  const mod = load({ fetchImpl: async () => ({ ok: true, json: async () => payload }) })
  const valid = await mod.checkApiKey('sk-or-v1-x')
  assert.equal(valid.state, 'valid')
  assert.equal(valid.label, 'my key')
  payload = { valid: true, exhausted: true }
  assert.equal((await mod.checkApiKey('sk-or-v1-x')).state, 'exhausted')
})

test('Worker が無効と答えれば invalid', async () => {
  const mod = load({ fetchImpl: async () => ({ ok: true, json: async () => ({ valid: false }) }) })
  assert.equal((await mod.checkApiKey('sk-or-v1-x')).state, 'invalid')
})

test('通信できなければ unreachable になり、前回の確定状態を last に残す', async () => {
  const mod = load({ fetchImpl: async () => { throw new Error('offline') } })
  const fromValid = await mod.checkApiKey('sk-or-v1-x', { state: 'valid', checkedAt: 1 })
  assert.equal(fromValid.state, 'unreachable')
  assert.equal(fromValid.last, 'valid')
  const fromUnreachable = await mod.checkApiKey('sk-or-v1-x', { state: 'unreachable', last: 'invalid' })
  assert.equal(fromUnreachable.last, 'invalid', '未確認が続いても最後に確定した状態を引き継ぐ')
  const fresh = await mod.checkApiKey('sk-or-v1-x', null)
  assert.equal(fresh.last, undefined)
})

test('Worker が 5xx を返しても unreachable として扱う', async () => {
  const mod = load({ fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }) })
  assert.equal((await mod.checkApiKey('sk-or-v1-x')).state, 'unreachable')
})

test('無効・残高切れのキーは送らない。未確認は前回無効でなければ送る', () => {
  const mod = load()
  assert.equal(mod.isApiKeyUsable(null), true)
  assert.equal(mod.isApiKeyUsable({ state: 'valid' }), true)
  assert.equal(mod.isApiKeyUsable({ state: 'checking' }), true)
  assert.equal(mod.isApiKeyUsable({ state: 'invalid' }), false)
  assert.equal(mod.isApiKeyUsable({ state: 'exhausted' }), false)
  assert.equal(mod.isApiKeyUsable({ state: 'unreachable' }), true)
  assert.equal(mod.isApiKeyUsable({ state: 'unreachable', last: 'valid' }), true)
  assert.equal(mod.isApiKeyUsable({ state: 'unreachable', last: 'exhausted' }), false)
})

test('loadUsableApiKey はキャッシュが無効・残高切れなら空を返す', () => {
  assert.equal(load({ apiKey: 'sk', cached: { state: 'valid' } }).loadUsableApiKey(), 'sk')
  assert.equal(load({ apiKey: 'sk', cached: null }).loadUsableApiKey(), 'sk')
  assert.equal(load({ apiKey: 'sk', cached: { state: 'exhausted' } }).loadUsableApiKey(), '')
  assert.equal(load({ apiKey: 'sk', cached: { state: 'invalid' } }).loadUsableApiKey(), '')
  assert.equal(load({ apiKey: '', cached: { state: 'valid' } }).loadUsableApiKey(), '')
})

test('publish は保存して購読者へ知らせる。checking は保存せず none は消す', () => {
  const mod = load({ cached: { state: 'valid' } })
  const seen = []
  const unsubscribe = mod.subscribeApiKeyStatus((status) => seen.push(status.state))
  mod.publishApiKeyStatus({ state: 'checking' })
  assert.equal(mod.store.status.state, 'valid', 'checking はキャッシュを上書きしない')
  mod.markApiKeyExhausted()
  assert.equal(mod.store.status.state, 'exhausted')
  mod.publishApiKeyStatus({ state: 'none' })
  assert.equal(mod.store.status, null)
  unsubscribe()
  mod.publishApiKeyStatus({ state: 'valid' })
  assert.deepEqual(seen, ['checking', 'exhausted', 'none'])
})

test('壊れたキャッシュや検査中のまま残ったキャッシュは読まない', () => {
  assert.equal(load({ cached: { state: 'checking' } }).loadApiKeyStatus(), null)
  assert.equal(load({ cached: { state: 'bogus' } }).loadApiKeyStatus(), null)
  assert.equal(load({ cached: 'text' }).loadApiKeyStatus(), null)
  assert.deepEqual(plain(load({ cached: { state: 'unreachable', last: 'valid', checkedAt: 5, label: 'k' } }).loadApiKeyStatus()), {
    state: 'unreachable',
    last: 'valid',
    checkedAt: 5,
    label: 'k',
  })
})

test('状態ごとの短い文言', () => {
  const mod = load()
  assert.equal(mod.formatApiKeyStatusNote({ state: 'none' }), '未設定 · 無料モードで動きます')
  assert.equal(mod.formatApiKeyStatusNote({ state: 'exhausted' }), '残高切れ · 無料モードで動きます')
  assert.equal(mod.formatApiKeyStatusNote({ state: 'unreachable', last: 'valid' }), '確認できませんでした · 前回: 有効')
  assert.equal(mod.formatApiKeyStatusNote({ state: 'unreachable' }), '確認できませんでした')
})
