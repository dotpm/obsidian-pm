# Contributing

Bug reports and feature requests go in issues. Pull requests are welcome.
For anything larger than a fix, open an issue first so the approach can be agreed on before the work is done.

The repo is a pnpm workspace on Node 24. `pnpm dev` builds into a test vault as set by `VAULT_PATH`, or into the root folder if `VAULT_PATH` is unset.

## Prerequisites

- Obsidian >= 1.13
- Node >=24 (Volta-pinned to 24.15.0)
- pnpm >=11 (Volta-pinned to 11.5.3)

## Setup

### Setup - In-vault (recommended for hot reload)

Leave `VAULT_PATH` unset, but clone directly into `<TEST_VAULT_PATH>/.obsidian/plugins/project-manager`.
Builds land in the repo root, which is the plugin dir.

```sh
cd <VAULT_PATH>/.obsidian/plugins
git clone https://github.com/dotpm/obsidian-pm && cd obsidian-pm

pnpm install

pnpm dev  # watch-builds main.js + styles.css into the vault
```

#### Hot reload

Install and enable the [hot-reload](https://github.com/pjeby/hot-reload) community plugin in the test vault.
This plugin this plugin automatically watches for changes to the `main.js` or `styles.css` of any plugin in the test vault whose directory includes a `.git` subdirectory or a file called `.hotreload`.

Every tsdown rebuild of `main.js` via `pnpm dev` will reload `obsidian-pm`. No restart needed!

On mobile or in vaults where hot-reload can't run: use `Reload app without saving` (Cmd/Ctrl+R) via the Obsidian command palette.

### Setup - Out-of-vault (recommended)

Clone the repo in a directory outside of the test vault. Builds deploy into a test vault defined by `VAULT_PATH`.

```sh
git clone https://github.com/dotpm/obsidian-pm && cd obsidian-pm

pnpm install

export VAULT_PATH=/path/to/test-vault   # add to your shell profile

pnpm dev                                # watch-builds main.js + styles.css into the vault
```

Ensure `VAULT_PATH` is set appropriately during development, and that `manifest.json` is copied into the test vault.

## CI (Tests & Checks)

`pnpm check`, `pnpm check:submission` and `pnpm test` are what CI runs.

The scripts from `package.json` to be aware of are as follows:

- `dev`: `run-p dev:js dev:css`,
- `dev:js`: `pnpm build:viewer && tsdown --watch`,
- `dev:css`: `node scripts/build-styles.mjs --watch`,
- `build`: `run-p build:js build:css`,
- `build:js`: `pnpm build:viewer && PRODUCTION=1 tsdown`,
- `build:css`: `PRODUCTION=1 node scripts/build-styles.mjs`,
- `check`: `run-p check:**`,
- `check:code`: `oxlint ./src ./packages ./test`,
- `check:format`: `oxfmt --check ./src ./packages ./test`,
- `check:submission`: `eslint --max-warnings 0 src/ packages/`,
- `check:types`: `tsc -noEmit -skipLibCheck`,
- `fix`: `run-p fix:**`,
- `fix:code`: `oxlint --fix ./src ./packages ./test`,
- `fix:format`: `oxfmt ./src ./packages ./test`,
- `test`: `vitest run`,
- `test:watch`: `vitest`,
- `test:coverage`: `vitest run --coverage`,
- `build:viewer`: `node scripts/build-viewer.mjs`,
- `build:packages`: `pnpm --filter @dotpm/core --filter @dotpm/api --filter @dotpm/viewer build`
