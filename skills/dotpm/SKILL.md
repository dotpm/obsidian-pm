---
name: dotpm
description: Read and change the projects and tasks of an Obsidian vault that uses the dotpm (Project Manager) plugin. Use when asked to list or create projects, or to plan, create, update, move, archive or delete tasks in that vault, or when the dotpm MCP tools or the dotpm command are available.
---

# dotpm

Projects and tasks in this vault are Markdown notes managed by the dotpm Obsidian plugin. Change them only through the dotpm MCP tools or the `dotpm` command. Both go through the plugin, which checks every value and shows the change in Obsidian right away.

## Rules

- Don't create, edit, rename, move or delete notes in a `_tasks` folder, and don't edit a project note's frontmatter, even with file access. The plugin keeps ids, parent and subtask links, positions and the archive folder in step across several notes. A hand edit breaks that.
- Read the project before writing to it. `get_project` lists the status and priority ids its tasks may carry, plus its custom fields and team. Use only those ids. Don't assume `done` or `high` exist.
- `create_project` is the only project write. It starts with the global statuses and priorities. Renaming a project or changing its palettes and custom fields is done in Obsidian.
- Take ids from earlier results. Don't build ids or paths yourself.
- A refused write names the allowed values. Fix the call and retry. Don't edit the note instead.
- `assignees`, `tags` and `dependencies` replace the whole list. To add one tag, send every tag the task should have.
- Changing `start`, `due`, `dependencies`, `status` or `type` can move other tasks' dates when the project auto-schedules. Use the task each write returns, and list the tasks again before a step that depends on other dates.
- Don't add a dependency that closes a loop. The API doesn't check for it.
- If the user may be editing the same task in Obsidian, pass the `updatedAt` you read as `expectedUpdatedAt` (`--if-match` on the command). A conflict means the task changed: read it again and redo the change.
- Ask before deleting. `delete_task` takes the subtasks too and can't be undone. When the user only wants a task out of the way, `archive_task` does that and can be reversed.

## Steps

1. `list_projects` to find the project, or `create_project` when it does not exist yet, at the root or under `parentId`.
2. `get_project` for its status ids, priority ids, custom fields and team.
3. Find the tasks. `list_tasks` when you know the project and need the tree, with `parentId` and `position`. `search_tasks` when you only have a title, a status or an assignee, or the project is unknown. `get_task` only when you need the description. Both lists leave archived tasks out unless `includeArchived` (`--archived`) is set.
4. Make the change. `create_task` for a new task, at the top level or under `parentId`. `update_task` to change fields in place. `move_task` to re-parent (`parentId`, null for top level), move to another project or reorder among siblings with `before` or `after`. `archive_task` to take a task and its subtasks out of the way, `archived: false` to bring them back.
5. Tell the user what changed, by task title.

## Commands

The same operations from a terminal:

| MCP tool | Command |
| --- | --- |
| `list_projects` | `dotpm projects` |
| `get_project` | `dotpm project <projectId>` |
| `create_project` | `dotpm create-project --title <text> [--description <markdown>] [--icon <emoji>] [--color <hex>] [--member <person>]... [--parent <projectId>]` |
| `list_tasks` | `dotpm tasks <projectId>` |
| `get_task` | `dotpm task <taskId>` |
| `search_tasks` | `dotpm search [text] [--project <id>] [--status <id>] [--assignee <person>]` |
| `create_task` | `dotpm create <projectId> --title <text> [--parent <id>]` |
| `update_task` | `dotpm update <taskId> [--if-match <updatedAt>]` |
| `move_task` | `dotpm move <taskId> [--parent <id>] [--top] [--project <id>] [--before <id>] [--after <id>]` |
| `archive_task` | `dotpm archive <taskId> [--restore]` |
| `delete_task` | `dotpm delete <taskId> --yes` |

The command prints JSON when piped or given `--json`. Exit code 2 is a refused value, 3 not found, 4 a conflict, 6 no server.

## Fields

| Field | Command flag | Value |
| --- | --- | --- |
| `title` | `--title` | Required on create, never empty |
| `description` | `--description` | Markdown body of the task note |
| `type` | `--type` | `task`, `milestone` or `subtask` |
| `status`, `priority` | `--status`, `--priority` | Ids from `get_project` |
| `start`, `due` | `--start`, `--due` | `YYYY-MM-DD`, or an empty string to clear |
| `progress` | `--progress` | Integer from 0 to 100 |
| `assignees` | `--assignee` (repeat) | Names or wikilinks of people, ideally from the project's team |
| `tags` | `--tag` (repeat) | Without the leading `#` |
| `dependencies` | `--depends-on` (repeat) | Ids of the tasks this one waits for |
| `timeEstimate` | `--estimate` | Hours, or null |
| `recurrence` | `--data` | `{ "interval": "daily" / "weekly" / "monthly" / "yearly", "every": 1, "endDate": "YYYY-MM-DD" }` or null |
| `customFields` | `--data` | Object keyed by the field ids from `get_project` |

`--data` takes a JSON object with these field names; flags override it.

A new project takes `title`, `description`, `icon` (an emoji), `color` (`#rrggbb`), `teamMembers` and `parentId`.

## When the tools are missing

If neither the MCP tools nor the command answer (exit code 6), tell the user to turn on Settings > Local API in Obsidian on the desktop and connect as described in [the API docs](https://github.com/dotpm/obsidian-pm/blob/main/docs/api.md) or [the command line docs](https://github.com/dotpm/obsidian-pm/blob/main/docs/cli.md). Don't edit the notes as a workaround.
