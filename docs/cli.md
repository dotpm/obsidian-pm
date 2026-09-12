# Command line

`dotpm` is a command for the terminal, and for agents and scripts, that reads and edits the projects and tasks of a vault open in Obsidian. It talks to the plugin through its local API, so turn that on first: Settings > Local API in Obsidian. Everything the command changes goes through the same code the views use and shows up in Obsidian at once.

Install it from npm, or run it without installing:

```sh
npm install -g @dotpm/cli
dotpm --help

npx @dotpm/cli projects
```

It needs Node 22 or newer and the desktop app, since the mobile app has no local API.

## Finding the vault

Run it from anywhere inside the vault folder and it finds the vault on its own, reading the port and token the plugin saved there. Outside the vault, name it:

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
| `dotpm project <projectId> [--tasks] [--archived]` | One project: team, custom fields and the status and priority ids its tasks may use; its tasks when asked |
| `dotpm tasks <projectId> [--archived]` | A project's tasks in tree order |
| `dotpm task <taskId>` | One task with its description |
| `dotpm search [text] [--project <id>] [--status <id>] [--assignee <person>] [--archived] [--limit <n>]` | Tasks across every project |
| `dotpm create <projectId> --title <text> [fields] [--parent <id>]` | A new task, at the top level or under a parent |
| `dotpm update <taskId> [fields] [--if-match <updatedAt>]` | Change the fields passed; `--if-match` refuses the write when the task changed since that `updatedAt` |
| `dotpm move <taskId> [--parent <id>] [--top] [--project <id>] [--before <id>] [--after <id>]` | Re-parent, move to another project, or reorder among siblings |
| `dotpm archive <taskId> [--restore]` | Archive a task and its subtasks, or bring them back |
| `dotpm delete <taskId> --yes` | Delete a task and its subtasks; cannot be undone |
| `dotpm changes [--since <cursor>]` | What changed after a cursor; without one, only the current cursor |
| `dotpm status` | Check the connection |
| `dotpm mcp` | Serve MCP over stdio, see below |

Task fields for `create` and `update`: `--title`, `--description`, `--type` (`task`, `milestone`, `subtask`), `--status`, `--priority`, `--start`, `--due` (`YYYY-MM-DD`, or empty to clear), `--progress` (0 to 100), `--estimate` (hours), and the repeatable `--assignee`, `--tag` and `--depends-on`, each of which replaces the whole list. Anything else, such as `recurrence` or `customFields`, goes in `--data` as a JSON object with the field names from [the API](api.md); `--data -` reads it from stdin, and flags override what it holds.

Read the project first: `--status` and `--priority` must be ids the project lists, and a write with any other value is refused with the list of allowed ones.

```sh
dotpm project 8f3k2a1x --tasks
dotpm create 8f3k2a1x --title "Write the release notes" --due 2026-09-20 --tag docs
dotpm update k2j9d0sa --status done
dotpm search "release" --status todo
```

## Output and exit codes

When stdout is a terminal the command prints tables; when it is a pipe, or `--json` is passed, it prints JSON, the same resources the API returns. Errors go to stderr, as `{ "error": { "code", "message" } }` in JSON mode.

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

Most MCP clients can use the plugin's HTTP endpoint directly, as described in [the API documentation](api.md). For a client that only launches a command, or cannot send an authorization header, `dotpm mcp` bridges stdio to that endpoint and finds the token itself, so no secret sits in the client's config:

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
