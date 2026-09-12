import { describe, expect, it } from 'vitest'
import { resolveConnection, type ConnectionInput } from './connection'

const VAULT = '/home/me/Notes'
const SETTINGS = `${VAULT}/.obsidian/plugins/project-manager/data.json`

function input(overrides: Partial<ConnectionInput> = {}, files: Record<string, string> = {}): ConnectionInput {
  const present = new Set([`${VAULT}/.obsidian`, ...Object.keys(files)])
  return {
    env: {},
    cwd: `${VAULT}/Projects/Website_tasks`,
    exists: (path) => present.has(path),
    readFile: (path) => files[path] ?? null,
    ...overrides
  }
}

const ON = JSON.stringify({ localApiEnabled: true, localApiPort: 27151, localApiToken: 'tok' })

describe('resolveConnection', () => {
  it('takes an explicit server from flags before anything else', () => {
    const found = resolveConnection(
      input({ url: 'http://127.0.0.1:1', token: 'a', env: { DOTPM_URL: 'http://127.0.0.1:2', DOTPM_TOKEN: 'b' } })
    )
    expect(found).toEqual({ baseUrl: 'http://127.0.0.1:1', token: 'a', source: 'the --url flag' })
  })

  it('takes an explicit server from the environment', () => {
    const found = resolveConnection(input({ env: { DOTPM_URL: 'http://127.0.0.1:2', DOTPM_TOKEN: 'b' } }))
    expect(found).toEqual({ baseUrl: 'http://127.0.0.1:2', token: 'b', source: 'DOTPM_URL' })
  })

  it('refuses a server without its token', () => {
    expect(() => resolveConnection(input({ url: 'http://127.0.0.1:1' }))).toThrow('pass both --url and --token')
  })

  it('reads the port and token from the vault the working directory is in', () => {
    const found = resolveConnection(input({}, { [SETTINGS]: ON }))
    expect(found).toEqual({ baseUrl: 'http://127.0.0.1:27151', token: 'tok', source: `the vault at ${VAULT}` })
  })

  it('reads a vault named by flag or environment', () => {
    expect(resolveConnection(input({ vault: VAULT, cwd: '/elsewhere' }, { [SETTINGS]: ON })).token).toBe('tok')
    expect(resolveConnection(input({ env: { DOTPM_VAULT: VAULT }, cwd: '/' }, { [SETTINGS]: ON })).token).toBe('tok')
    expect(() => resolveConnection(input({ vault: '/nope' }, { [SETTINGS]: ON }))).toThrow('not an Obsidian vault')
  })

  it('explains what is missing in a vault', () => {
    expect(() => resolveConnection(input({ cwd: '/tmp' }))).toThrow('no Obsidian vault holds /tmp')
    expect(() => resolveConnection(input())).toThrow('dotpm is not installed')
    expect(() => resolveConnection(input({}, { [SETTINGS]: '{oops' }))).toThrow('could not be read')
    expect(() => resolveConnection(input({}, { [SETTINGS]: '{"localApiEnabled":false}' }))).toThrow(
      'Settings > Local API'
    )
    expect(() => resolveConnection(input({}, { [SETTINGS]: '{"localApiEnabled":true}' }))).toThrow(
      'open it in Obsidian once'
    )
  })
})
