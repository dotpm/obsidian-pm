# Local API and MCP

dotpm can serve the projects and tasks in the current vault to other programs on the same computer. Turn it on in Settings under "Local API". It is off by default, desktop only, listens on `127.0.0.1` only, and every request needs the bearer token shown in settings.

Two clients speak to the same server:

- Plain HTTP with JSON bodies, at `http://127.0.0.1:<port>/v1/...`.
- The Model Context Protocol (MCP) over Streamable HTTP, at `http://127.0.0.1:<port>/mcp`, for coding agents and chat clients.

The port is shown in settings. Each vault starts with its own, derived from the vault name so two open vaults never want the same one, and it can be changed there. Both surfaces read and write the same markdown notes the views use, through the same code, so a change made by a client shows up in Obsidian at once and vice versa.

## Connecting an MCP client

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

The server is stateless: every request stands alone, there is no session to keep, and it does not push notifications. Clients that insist on a Server-Sent Events stream get `405` from `GET /mcp` and fall back to plain requests.

Tools: `list_projects`, `get_project`, `list_tasks`, `get_task`, `search_tasks`, `create_task`, `update_task`, `move_task`, `archive_task`, `delete_task`, `list_changes`. Resources: `dotpm://projects/{id}` (the project with its tasks) and `dotpm://tasks/{id}`.

Read a project before writing tasks into it: its `statuses` and `priorities` list the ids a task may carry, and a write with any other value is refused.

## HTTP endpoints

Send `Authorization: Bearer <token>` with every request except `GET /v1/health`.

| Method and path | What it does |
| --- | --- |
| `GET /v1/health` | `{ ok, name, version }`, no token needed |
| `GET /v1/projects` | Every project: id, path, title, icon, color, parentId, taskCount, doneCount |
| `GET /v1/projects/{id}` | One project with description, team, custom fields, statuses and priorities |
| `GET /v1/projects/{id}/tasks` | Its tasks in tree order; add `?includeArchived=true` for archived ones |
| `POST /v1/projects/{id}/tasks` | Create a task; body is the task fields below plus an optional `parentId` |
| `GET /v1/tasks/{id}` | One task |
| `PATCH /v1/tasks/{id}` | Change the fields in the body; `If-Match: <updatedAt>` refuses the write with `412` if the task changed since |
| `POST /v1/tasks/{id}/move` | Body: `parentId` (null for top level), `projectId`, and `before` or `after` naming a sibling |
| `POST /v1/tasks/{id}/archive` | Body `{ "archived": true }` (the default) or `false` |
| `DELETE /v1/tasks/{id}` | Delete the task and its subtasks |
| `GET /v1/search` | `q` (title text), `projectId`, `status`, `assignee`, `includeArchived`, `limit` (default 50) |
| `GET /v1/changes?since=<cursor>` | What changed after a cursor, see below |

Task fields a client may write: `title`, `description`, `type` (`task`, `milestone`, `subtask`), `status`, `priority`, `start`, `due` (`YYYY-MM-DD` or empty), `progress` (0 to 100), `assignees`, `tags`, `dependencies` (task ids), `recurrence` (`{ interval, every, endDate? }` or null), `timeEstimate` (hours or null), `customFields` (an object keyed by field id).

Every task carries `id`, `projectId`, `parentId`, `position` (its index among its siblings), `path`, `archived`, `completed`, `timeLogs`, `createdAt` and `updatedAt` on top of the fields above. Ids are stable for the life of a task; paths change when a task is renamed or archived.

Errors come back as `{ "error": { "code", "message" } }` with `400` (`invalid`), `401` (`unauthorized`), `404` (`not_found`) or `412` (`conflict`).

## Changes

`GET /v1/changes` without `since` returns the current cursor and nothing else. Poll with that cursor to get everything that changed after it, oldest first, each entry as `{ seq, at, kind: "project" | "task", op: "upsert" | "delete", id, projectId }`. Keep the returned `cursor` for the next poll. A response with `reset: true` means the cursor is older than what the server kept (about the last thousand changes); list what you need again instead of applying changes.

The feed covers projects that have been loaded during this Obsidian session: any project a client has read through the API, and any project open in a view. Changes to a project nobody has opened yet are not tracked until it is.

## Limits

- Desktop only. The mobile app has no server to run.
- Only this computer can connect. There is no way to bind another interface.
- Every client shares the one token. Regenerate it in settings to cut every client off at once.
- Task bodies (`description`) are loaded when a task is read, so the first read of a large project is slower than the rest.
