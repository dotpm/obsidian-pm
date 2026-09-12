import { dirname, join } from 'node:path'

export interface ConnectionInput {
  url?: string
  token?: string
  vault?: string
  env: Record<string, string | undefined>
  cwd: string
  exists: (path: string) => boolean
  readFile: (path: string) => string | null
}

export interface Connection {
  baseUrl: string
  token: string
  /** Where the details came from, for `dotpm status`. */
  source: string
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectionError'
  }
}

const CONFIG_DIR = '.obsidian'
const SETTINGS_FILE = join(CONFIG_DIR, 'plugins', 'project-manager', 'data.json')

/** The nearest folder at or above `cwd` that holds an Obsidian config folder. */
function findVault(cwd: string, exists: (path: string) => boolean): string | null {
  let dir = cwd
  for (;;) {
    if (exists(join(dir, CONFIG_DIR))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function fromVault(vault: string, input: ConnectionInput): Connection {
  if (!input.exists(join(vault, CONFIG_DIR))) throw new ConnectionError(`${vault} is not an Obsidian vault`)
  const raw = input.readFile(join(vault, SETTINGS_FILE))
  if (raw === null) throw new ConnectionError(`dotpm is not installed in the vault at ${vault}`)
  let settings: { localApiEnabled?: unknown; localApiPort?: unknown; localApiToken?: unknown }
  try {
    settings = JSON.parse(raw) as typeof settings
  } catch {
    throw new ConnectionError(`the dotpm settings in the vault at ${vault} could not be read`)
  }
  if (settings.localApiEnabled !== true) {
    throw new ConnectionError(
      `the local API is off for the vault at ${vault}; turn it on in Obsidian under Settings > Local API`
    )
  }
  const { localApiPort: port, localApiToken: token } = settings
  if (typeof port !== 'number' || typeof token !== 'string' || !token) {
    throw new ConnectionError(`the vault at ${vault} has no local API port or token yet; open it in Obsidian once`)
  }
  return { baseUrl: `http://127.0.0.1:${port}`, token, source: `the vault at ${vault}` }
}

/**
 * Flags win over the environment, and an explicit server wins over a vault. Without any
 * of them, the working directory names the vault.
 */
export function resolveConnection(input: ConnectionInput): Connection {
  const url = input.url ?? input.env['DOTPM_URL']
  const token = input.token ?? input.env['DOTPM_TOKEN']
  if (url && token) {
    return { baseUrl: url, token, source: input.url ? 'the --url flag' : 'DOTPM_URL' }
  }
  if (url || token) throw new ConnectionError('pass both --url and --token, or both DOTPM_URL and DOTPM_TOKEN')
  const named = input.vault ?? input.env['DOTPM_VAULT']
  if (named) return fromVault(named, input)
  const found = findVault(input.cwd, input.exists)
  if (!found) {
    throw new ConnectionError(
      `no Obsidian vault holds ${input.cwd}; run inside a vault, pass --vault, or set DOTPM_URL and DOTPM_TOKEN`
    )
  }
  return fromVault(found, input)
}
