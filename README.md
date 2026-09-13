<div align="center">

# dotpm

**Project management inside Obsidian. Table, Gantt and Kanban over plain Markdown notes.**

[![Obsidian community plugin](https://img.shields.io/badge/Obsidian-community%20plugin-7c3aed?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=project-manager)
[![Downloads](https://img.shields.io/github/downloads/dotpm/obsidian-pm/total?color=2ea44f)](https://github.com/dotpm/obsidian-pm/releases)
[![License](https://img.shields.io/github/license/dotpm/obsidian-pm)](LICENSE)
[![Buy me a coffee](https://img.shields.io/badge/buy%20me%20a%20coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/kropachev)

[Install](#install) | [Quick start](#quick-start) | [Docs](docs) | [Website](https://dotpm.pm) | [Changelog](CHANGELOG.md)

<img width="1422" alt="dotpm dashboard" src="https://github.com/user-attachments/assets/ca6bc67f-e656-45be-b93a-17410555ec1a" />

</div>

Project tools keep the plan in one app and the thinking about it in another. dotpm keeps both in the vault. A project is a note, a task is a note, and the table, the timeline and the board are three ways of looking at the same files.

- Scheduling, not checkboxes. Tasks have start and due dates, dependencies drawn as arrows, and a Gantt chart that moves dependents when a blocker slips.
- Tasks are full notes. Each has a body, backlinks, tags and properties, so search, the graph, templates and Dataview all work on them.
- Agents and scripts can work the board. A local HTTP and MCP server and a command line client edit the same notes the views do, so a coding agent can pick up a task, update it and close it.
- Nothing to sign up for. Projects sync with whatever already syncs the vault, and a project folder can be diffed and reviewed in git like any other code.
- Runs on desktop and mobile, and any view exports to one HTML file that opens without Obsidian.

## Install

In Obsidian, open **Settings > Community plugins > Browse**, search for **dotpm**, install and enable it. Or open [the listing](https://obsidian.md/plugins?id=project-manager) directly.

Needs Obsidian 1.13 or newer. Works on desktop and mobile.

<details>
<summary>Beta builds and manual install</summary>

**BRAT:** install [BRAT](https://github.com/TfTHacker/obsidian42-brat), choose **Add beta plugin** and enter `dotpm/obsidian-pm`.

**Manual:** download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/dotpm/obsidian-pm/releases/latest) into `<vault>/.obsidian/plugins/project-manager/`, then reload Obsidian and enable the plugin.

</details>

## Quick start

1. Click the timeline icon in the ribbon, or run **dotpm: Open projects pane**.
2. Click **New project**, give it a name, and open it.
3. Click **Add task**. Set a status, a due date, an assignee, whatever you need.
4. Switch between **Table**, **Gantt** and **Kanban** at the top of the view.
5. Look in your vault. There is a `Projects/Your project.md` note and a `Projects/Your project_tasks/` folder with one note per task.

Already have notes you want as tasks? Run **dotpm: Import notes as tasks**. To turn an existing note into a project, add `pm-project: true` to its properties and run **dotpm: Open current file as project**.

## Views

### Table

Rows sort, filter and edit inline. A multi-row selection changes status, priority, assignee, tags, due date or parent for all of them at once. A filter and sort combination can be saved as a named view.

<video src="https://github.com/user-attachments/assets/104bd993-d4c1-42e7-9d6a-ae46fd7ce6a8" autoplay loop muted playsinline width="600"></video>

### Gantt

Dragging a bar reschedules the task, dragging its edge changes the duration, and dragging from one bar to another adds a dependency. The scale zooms from days to years. Milestones are diamonds and a line marks today.

<video src="https://github.com/user-attachments/assets/916f7100-44ef-401c-abb3-e003a0f7720a" autoplay loop muted playsinline width="600"></video>

### Kanban

One column per status. Dragging a card to another column changes its status. Cards show priority, assignees, tags and due date.

<video src="https://github.com/user-attachments/assets/316fc43b-6915-499a-a6ad-0680c462d014" autoplay loop muted playsinline width="600"></video>

## Features

**Tasks**

- Subtasks to any depth
- Dependencies, within a project or across projects, and milestones
- Start and due dates, progress, assignees, tags
- Recurring tasks
- Time estimates and time logs
- Custom fields: text, number, date, select, multi-select, person, checkbox, URL
- A Markdown body on every task

**Planning**

- Auto-scheduling: dependents move when a blocker moves
- Due date reminders
- Archive, by hand or automatically after a set number of days
- Undo and redo

**Organizing**

- Sub-projects, with an overview page per project: progress, milestones, sub-projects, properties
- One view over a project, its subtree, a folder or the whole vault
- Saved views: named filter and sort combinations
- Bulk edit from the table
- People notes for assignees, with a per-person task list

**Customizing**

- Statuses and priorities with label, color and icon, global or per project
- Per-project overrides for default view, scheduling and archiving
- Team members, global and per project

## File format

A task looks like this. Open it in Obsidian, edit it in any text editor, or diff it in git.

```yaml
---
pm-task: true
projectId: '[[Website redesign]]'
title: 'Write the launch post'
type: 'task'
status: 'in-progress'
priority: 'high'
start: '2026-09-01'
due: '2026-09-20'
progress: 40
assignees: ['[[Alice]]']
tags: ['marketing']
dependencies: ['[[Design the homepage]]']
---
Draft, review with the team, publish on launch day.
```

Sync works the way it does for any other note. Obsidian Sync, iCloud, Syncthing and git all carry projects along. Two people editing the same task at the same moment produce an ordinary sync conflict, and there is no real-time collaboration beyond that.

## Outside Obsidian

**Share a view.** **dotpm: Export current view as HTML** writes the open table, timeline or board to a single file that opens in any browser, with the tasks, the filter and the icons inside it.

**Local API and MCP.** Turn on **Settings > Local API** and the desktop app serves the vault's projects on `127.0.0.1` with a bearer token. Scripts use plain HTTP; coding agents connect over the Model Context Protocol:

```sh
claude mcp add --transport http dotpm http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

**Command line.** `npm install -g @dotpm/cli` installs the `dotpm` command. Run inside the vault folder, it finds the server on its own.

```sh
dotpm projects
dotpm create <projectId> --title "Write the release notes" --due 2026-09-20
dotpm search release --status todo
```

Everything a client changes goes through the same code the views use and shows up in Obsidian at once. See [docs/api.md](docs/api.md) and [docs/cli.md](docs/cli.md).

**TaskNotes.** dotpm imports TaskNotes tasks with their dates, dependencies and hierarchy, and can share statuses and priorities with it. See [docs/tasknotes.md](docs/tasknotes.md).

## Contributing

Bug reports and feature requests go in [issues](https://github.com/dotpm/obsidian-pm/issues). Pull requests are welcome. For anything larger than a fix, open an issue first so the approach can be agreed on before the work is done.

The repo is a pnpm workspace on Node 24. `pnpm dev` builds into the vault named by `VAULT_PATH`, and `pnpm check`, `pnpm check:submission` and `pnpm test` are what CI runs.

## License

[MIT](LICENSE)
