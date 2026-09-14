# Command line

`dotpm` reads and edits the projects and tasks of a vault open in Obsidian, from a terminal, a script or an agent. It talks to the plugin through the [local API](api.md), so that has to be on: Settings > Local API in Obsidian. Everything it changes goes through the same code the views use and shows in Obsidian at once.

## Install

```sh
npm install -g @dotpm/cli
dotpm --help
```

Or without installing:

```sh
npx @dotpm/cli projects
```

Needs Node 22 or newer and the Obsidian desktop app. The mobile app has no local API.

## Connecting

Run from anywhere inside the vault folder and the command finds the vault on its own, reading the port and token the plugin saved there. From elsewhere, name the vault:

```sh
dotpm --vault ~/Notes projects
DOTPM_VAULT=~/Notes dotpm projects
```

To reach a server directly, pass the address and the token shown in settings, or set `DOTPM_URL` and `DOTPM_TOKEN`:

```sh
dotpm --url http://127.0.0.1:27140 --token <token> status
```

`dotpm status` says which server it found and whether it answers.

## Commands

| Command | What it does |
| --- | --- |
| `dotpm projects` | Every project with its id, title and task counts |
| `dotpm project <projectId> [--tasks] [--archived]` | One project: team, custom fields, and the status and priority ids its tasks may use |
| `dotpm create-project --title <text> [--description <markdown>] [--icon <emoji>] [--color <hex>] [--member <person>]... [--parent <projectId>]` | A new project in the projects folder, or inside its parent |
| `dotpm tasks <projectId> [--archived]` | A project's tasks in tree order |
| `dotpm task <taskId>` | One task with its description |
| `dotpm search [text] [--project <id>] [--status <id>] [--assignee <person>] [--archived] [--limit <n>]` | Tasks across every project |
| `dotpm create <projectId> --title <text> [fields] [--parent <id>]` | A new task, at the top level or under a parent |
| `dotpm update <taskId> [fields] [--if-match <updatedAt>]` | Change the fields passed; `--if-match` refuses the write when the task changed since that `updatedAt` |
| `dotpm move <taskId> [--parent <id>] [--top] [--project <id>] [--before <id>] [--after <id>]` | Re-parent, move to another project, or reorder among siblings |
| `dotpm archive <taskId> [--restore]` | Archive a task and its subtasks, or bring them back |
| `dotpm delete <taskId> --yes` | Delete a task and its subtasks. Cannot be undone |
| `dotpm changes [--since <cursor>] [--follow] [--interval <seconds>]` | What changed after a cursor; without one, only the current cursor |
| `dotpm status` | Check the connection |
| `dotpm mcp` | Serve MCP over stdio, see below |

### Task fields

`create` and `update` take `--title`, `--description`, `--type` (`task`, `milestone`, `subtask`), `--status`, `--priority`, `--start`, `--due` (`YYYY-MM-DD`, or empty to clear), `--progress` (0 to 100), `--estimate` (hours), and the repeatable `--assignee`, `--tag` and `--depends-on`, each of which replaces the whole list.

Anything else, such as `recurrence` or `customFields`, goes in `--data` as a JSON object using the field names from [the API](api.md). `--data -` reads it from stdin, and flags override what it holds.

`--status` and `--priority` must be ids the project lists. Read the project first; a write with any other value is refused with the list of allowed ones.

```sh
dotpm create-project --title "Website relaunch" --icon 🚀 --member "[[Ann]]"
dotpm project 8f3k2a1x --tasks
dotpm create 8f3k2a1x --title "Write the release notes" --due 2026-09-20 --tag docs
dotpm update k2j9d0sa --status done
dotpm search "release" --status todo
```

## Following changes

`dotpm changes --follow` polls the change feed every two seconds (`--interval` sets the period) and prints each change on its own line until Ctrl-C. Without `--since` it starts from now. With a cursor it first prints everything after that cursor.

In JSON mode each line is one change object, so a script can read the stream line by line:

```sh
dotpm changes --follow | while read -r change; do echo "$change"; done
```

A `reset` line means the cursor was older than what the server keeps. List what you need again, then keep reading.

## Output and exit codes

When stdout is a terminal the command prints tables. When it is a pipe, or `--json` is passed, it prints JSON, the same resources the API returns. Errors go to stderr, as `{ "error": { "code", "message" } }` in JSON mode.

| Exit code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | An unexpected failure |
| 2 | A usage or connection problem, or a value the server refused |
| 3 | The project or task was not found |
| 4 | `--if-match` did not match: the task changed since it was read |
| 5 | The token was refused |
| 6 | The server could not be reached; Obsidian is not running or the local API is off |

## MCP over stdio

Most MCP clients can use the plugin's HTTP endpoint directly, as described in [api.md](api.md). For a client that only launches a command, or cannot send an authorization header, `dotpm mcp` bridges stdio to that endpoint and finds the token itself, so no secret sits in the client's config:

```json
{
  "mcpServers": {
    "dotpm": {
      "command": "npx",
      "args": ["-y", "@dotpm/cli", "mcp", "--vault", "/path/to/vault"]
    }
  }
}
```

Claude Code:

```sh
claude mcp add dotpm -- npx -y @dotpm/cli mcp --vault /path/to/vault
```

The same tools and resources are served either way.
