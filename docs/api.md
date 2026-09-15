# Local API and MCP

dotpm can serve the projects and tasks of an open vault to other programs on the same computer. Three clients talk to one server:

- HTTP with JSON bodies at `http://127.0.0.1:<port>/v1/...`
- The Model Context Protocol (MCP) over Streamable HTTP at `http://127.0.0.1:<port>/mcp`, for coding agents and chat clients
- The `dotpm` command from npm, for terminals and scripts, documented in [cli.md](cli.md)

All three read and write the same notes the views use, through the same code. A change made by a client shows in Obsidian at once, and an edit in Obsidian is visible to the next request.

## Turning it on

Settings > Local API > Serve projects to other apps. The server is off by default and exists only in the desktop app.

It listens on `127.0.0.1`, so nothing outside this computer can connect. Every request except the health check needs the bearer token shown in settings. Regenerating the token cuts off every client at once.

Each vault gets its own port, derived from the vault name so two open vaults do not collide. It can be changed in settings.

## MCP

Claude Code:

```sh
claude mcp add --transport http dotpm http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

Cursor, Claude Desktop and other clients that take a JSON config:

```json
{
  "mcpServers": {
    "dotpm": {
      "url": "http://127.0.0.1:<port>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

A client that can only launch a command, or cannot send a header, can use `dotpm mcp` from the command line package instead. It bridges stdio to this endpoint and finds the token itself. See [cli.md](cli.md).

Tools: `list_projects`, `get_project`, `list_tasks`, `get_task`, `search_tasks`, `create_task`, `update_task`, `move_task`, `archive_task`, `delete_task`, `list_changes`.

Resources: `dotpm://projects/{id}` (the project with its tasks) and `dotpm://tasks/{id}`.

Read a project before writing tasks into it. Its `statuses` and `priorities` list the ids a task may carry, and a write with any other value is refused.

[`skills/dotpm`](https://github.com/dotpm/cli/blob/main/skills/dotpm/SKILL.md) in the command line repository is a skill for agents that use these tools. Copy the folder into the agent's skills directory, `~/.claude/skills/` for Claude Code.

Protocol details:

- Stateless. Every request stands alone, there is no session, and the server pushes nothing.
- A POST that asks for `text/event-stream` gets its reply as one event, then the stream closes. The standalone `GET /mcp` stream and `DELETE /mcp` need a session, so both answer `405`.
- Protocol versions `2025-06-18` and `2025-03-26`.
- One message per request. JSON-RPC batches are refused.

## HTTP

Send `Authorization: Bearer <token>` with every request except `GET /v1/health`.

| Method and path | What it does |
| --- | --- |
| `GET /v1/health` | `{ ok, name, version }`, no token needed |
| `GET /v1/projects` | Every project: id, path, title, icon, color, parentId, taskCount, doneCount |
| `GET /v1/projects/{id}` | One project with description, team, custom fields, statuses and priorities |
| `POST /v1/projects` | Create a project from `title`, `description`, `icon`, `color`, `teamMembers` and an optional `parentId`; answers `201` |
| `GET /v1/projects/{id}/tasks` | Its tasks in tree order; `?includeArchived=true` adds archived ones |
| `POST /v1/projects/{id}/tasks` | Create a task from the fields below plus an optional `parentId`; answers `201` |
| `GET /v1/tasks/{id}` | One task |
| `PATCH /v1/tasks/{id}` | Change the fields in the body; `If-Match: <updatedAt>` refuses with `412` if the task changed since |
| `POST /v1/tasks/{id}/move` | Body: `parentId` (null for top level), `projectId`, and `before` or `after` naming a sibling |
| `POST /v1/tasks/{id}/archive` | Body `{ "archived": true }` (the default) or `false` |
| `DELETE /v1/tasks/{id}` | Delete the task and its subtasks |
| `GET /v1/search` | `q` (title text), `projectId`, `status`, `assignee`, `includeArchived`, `limit` (default 50) |
| `GET /v1/changes?since=<cursor>` | What changed after a cursor, see below |

Fields a client may write: `title`, `description`, `type` (`task`, `milestone`, `subtask`), `status`, `priority`, `start`, `due` (`YYYY-MM-DD` or empty), `progress` (0 to 100), `assignees`, `tags`, `dependencies` (task ids), `recurrence` (`{ interval, every, endDate? }` or null), `timeEstimate` (hours or null), `customFields` (an object keyed by field id).

A new project goes in the projects folder from settings, or inside its parent's folder when `parentId` is given. It starts with the global statuses and priorities; its palettes, custom fields and other settings are changed in Obsidian.

Every task also carries `id`, `projectId`, `parentId`, `position` (its index among siblings), `path`, `archived`, `completed`, `timeLogs`, `createdAt` and `updatedAt`. Ids are stable for the life of a task. Paths change when a task is renamed or archived.

Errors come back as `{ "error": { "code", "message" } }`:

| Status | Code |
| --- | --- |
| 400 | `invalid` |
| 401 | `unauthorized` |
| 404 | `not_found` |
| 412 | `conflict` |

## Change feed

`GET /v1/changes` without `since` returns the current cursor and nothing else. Polling with that cursor returns everything that changed after it, oldest first, plus a new `cursor` for the next poll. Each entry is `{ seq, at, kind: "project" | "task", op: "upsert" | "delete", id, projectId }`.

The server keeps about the last thousand changes. A response with `reset: true` means the cursor is older than that. List what you need again instead of applying changes.

The feed covers projects loaded during this Obsidian session: any project a client has read through the API and any project open in a view. A project nobody has opened yet is not tracked until it is.

## Limits

- Desktop only. The mobile app has no server to run.
- Only this computer can connect. There is no option to bind another interface.
- One token, shared by every client.
- Task bodies are loaded when a task is first read, so the first read of a large project is slower than the rest.
