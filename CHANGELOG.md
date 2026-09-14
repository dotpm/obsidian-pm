# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added exporting a view as a standalone HTML page with the table, timeline, and board
- Added a local HTTP and MCP server that lets other apps on the same computer read and edit tasks and create projects, off by default
- Added the `dotpm` command line tool for listing, searching, and editing tasks and creating projects, installed from npm as `@dotpm/cli`
- Added a release notes tab that opens after an update, and the "Show release notes" command
- Added the "Show release notes after updates" setting

### Changed

- Tasks and projects referenced in a note's properties are now written as links, including in older notes
- A project's description now lives in the note body instead of its properties

### Fixed

- Fixed a project description edited in the note being reverted by the next save
- Fixed an open timeline ignoring the granularity setting until it was reopened
- Fixed subtasks appearing twice when the parent listed them more than once ([#306](https://github.com/dotpm/obsidian-pm/issues/306))
- Fixed collapsed tasks in the table and timeline expanding when a task note changed outside the plugin ([#305](https://github.com/dotpm/obsidian-pm/issues/305))
- Fixed tasks failing to save when the note name differed from the title only in capitalization ([#308](https://github.com/dotpm/obsidian-pm/issues/308))
- Fixed creating a project failing when a note with the same name in different capitalization existed
- Fixed the task title not being focused when the task dialog opens ([#303](https://github.com/dotpm/obsidian-pm/issues/303))
- Fixed the project name not being focused when the new project dialog opens
- Fixed the project name and icon above a view not responding to the keyboard
- Fixed a description being replaced by the whole note when its properties could not be read ([#274](https://github.com/dotpm/obsidian-pm/issues/274))
- Fixed properties added by other plugins being removed on save when a note's properties could not be read

## [2.3.1] - 2026-09-07

### Fixed

- Fixed status, priority, date, and tag pickers opening outside the dialog with themes that blur or transform dialogs ([#276](https://github.com/dotpm/obsidian-pm/issues/276))

## [2.3.0] - 2026-09-07

### Added

- Added a setting to use Shift+Enter or Ctrl/Cmd+Enter as the save shortcut

### Changed

- The save shortcut now also creates a project from the new project dialog

### Fixed

- Fixed undo in a dialog reverting the last task change while a Gantt view was open
- Fixed saving a task or project removing properties added by other plugins or by hand ([#272](https://github.com/StepanKropachev/obsidian-pm/issues/272))

## [2.2.0] - 2026-09-06

### Added

- Added a year zoom level to the timeline, with quarters under each year ([#50](https://github.com/StepanKropachev/obsidian-pm/issues/50), [#77](https://github.com/StepanKropachev/obsidian-pm/issues/77), [#147](https://github.com/StepanKropachev/obsidian-pm/issues/147))
- Added duplicating a project with all its tasks, from the project list menu or the "Duplicate project" command
- Added a funding link to the plugin's entry in Obsidian's plugin list

### Changed

- Renamed the plugin to dotpm, after the [dotpm](https://dotpm.pm) organization the repository moved to ([#269](https://github.com/dotpm/obsidian-pm/issues/269)). Commands now appear under **dotpm** in the command palette. Hotkeys, settings, task files, and updates are not affected.
- Subtasks, parents, and dependencies are now written as links, so they show up in the graph view

### Fixed

- Fixed edits, dependency checks, and archiving acting on the wrong project when a project was created by copying another's folder
- Fixed the expand/collapse arrow being hard to click in the table, project list, and Gantt views ([#266](https://github.com/dotpm/obsidian-pm/pull/266))
- Fixed the due date field in the table keeping only the first digit typed

## [2.1.0] - 2026-08-27

### Highlights

- **Auto-archive:** Completed tasks move to the project's archive after a set number of days. Set it once for all projects or per project, or run the "Archive completed tasks" command to archive them now.
- **Inherited custom fields:** Define custom fields once for the vault or on a parent project, and every project below gets them. A project can still rename, retype, or hide an inherited field, or merge its own field into it.

### Added

- Added automatic archiving of completed tasks after a set number of days ([#204](https://github.com/StepanKropachev/obsidian-pm/issues/204))
- Added a per-project auto-archive setting
- Added the "Archive completed tasks" command
- Sub-projects now inherit the custom fields of their parent project ([#255](https://github.com/StepanKropachev/obsidian-pm/issues/255))
- Added vault-wide custom fields that every project starts with
- Inherited custom fields can now be renamed, retyped, or hidden in project settings
- A custom field that duplicates an inherited one can now be merged into it, values included

### Fixed

- Fixed renaming a project from its settings page leaving the note and folder with the old name
- Fixed views failing to load when a note's team members, assignees, tags, or dependencies held an invalid value ([#252](https://github.com/StepanKropachev/obsidian-pm/issues/252))
- Fixed a leftover connector line next to items nested two levels deep under the last sibling

## [2.0.0] - 2026-08-25

### Highlights

- **Breaking change:** Requires Obsidian 1.13 or later. Update Obsidian before installing this release.
- **Project overviews:** Opening a project shows its own page with progress, description, a milestone timeline, sub-projects, and properties. A new setting opens the task list directly instead. It's up to you.
- **Sub-projects and multi-project views:** Projects can nest under a parent, and the table, board, and timeline can show a project's subtree, its folder, or the whole vault, each with its own saved views and filters.
- **A folder per project:** Each project keeps its note and tasks in one folder. Existing projects migrate automatically.
- **Cross-project dependencies:** Tasks can depend on or block tasks in other projects, and scheduling follows those dates.
- **Custom priorities and per-project config:** Add, rename, recolor, and reorder priorities. A project can set its own statuses, priorities, default view, and scheduling.
- **Progress and completion timing:** Set task progress from 0 to 100, and see whether a completed task finished on time or how many days late.
- **People notes:** Link assignees and members to person notes, with avatars, automatic notes for new names, and commands that list one person's tasks.
- **Better wikilinks:** Names, custom fields, and project links written as wikilinks resolve to their notes everywhere. We all love those nice obsidian graphs!
- **Improved custom fields style:** Custom fields use the same controls as built-in properties: dates open the date picker, selects share the status popover, and the table shows links, avatars, and real checkboxes.
- **A searchable icon picker:** Pick status, priority, and project icons from every icon Obsidian has, or use any emoji.
- **Settings rework:** Settings are grouped by area, with statuses, priorities, team members, and TaskNotes on their own pages, and show up in Obsidian's settings search.
- **Tasks in tabs:** Open tasks in a tab instead of a modal.
- **TaskNotes import:** Import tasks, statuses, and priorities from TaskNotes, including dates, dependencies, subtasks, tags, and archive state.
- **A lighter index behind the scenes:** The project list, pickers, and due date reminders read from a lightweight index instead of parsing every project file, so large vaults stay fast.
- **Updated sync engine:** A task or project open in several tabs stays in sync, and an edit in one shows up in the others right away.

### Added

- Assignees and project members can now be picked from person notes, which links them in the graph ([#131](https://github.com/StepanKropachev/obsidian-pm/issues/131))
- The assignee picker can now create a note for a new person, in the new "People folder" setting
- Clicking an assignee's avatar now opens their note
- Added the "Show tasks assigned to a person" command
- Added the "Show tasks assigned to this note" command
- Added the "Link assignees to their person notes" command, which turns typed names into links
- Added a project overview page with progress, description, milestones, sub-projects, and properties
- Added the "Open projects in" setting to open a project's tasks instead of its overview
- Clicking a project name on a row, card, or timeline label now opens the project
- Projects are now found anywhere in the vault
- Added sub-projects, with the parent set in project settings
- The project list now nests sub-projects under their parent, which counts the tasks of the whole group
- Added the "Excluded folders" setting to hide folders from the project list
- Added the "Rebuild project index" command
- The table, board, and timeline can now show several projects, chosen from the switcher next to the project name
- Added the "Open all projects in one view" command
- Rows, cards, and timeline labels now show their project in multi-project views
- Saved views and filters are now kept per set of projects, so a project and its sub-projects have their own
- Tasks can now depend on tasks in other projects, and their dates follow those tasks
- Added a "Blocks" list to the task editor
- The task menu can now move a task and its subtasks to another project
- The timeline now marks tasks that depend on something outside the view
- Priorities can now be added, renamed, recolored, and reordered in settings
- Added priority icon sets: chevrons, signal bars, arrows, alerts, or none, globally or per project
- Added a searchable icon picker for status and priority icons, which also accepts pasted emoji
- Project icons now use the same icon picker, so any Obsidian icon works, not only emoji
- Added importing TaskNotes tasks with their dates, dependencies, subtasks, tags, and archive state ([#16](https://github.com/StepanKropachev/obsidian-pm/issues/16))
- Statuses and priorities can now be imported from TaskNotes in settings ([#16](https://github.com/StepanKropachev/obsidian-pm/issues/16))
- Projects can now define their own statuses and priorities ([#57](https://github.com/StepanKropachev/obsidian-pm/issues/57))
- Projects can now override the default view, auto-scheduling, and board options
- The completed date now shows whether a task finished on time or how many days late
- Task progress can now be set from 0 to 100 in the task editor or by clicking the progress bar in the table
- Added the "Pull dependents forward" setting to move dependent tasks earlier when a task finishes early ([#154](https://github.com/StepanKropachev/obsidian-pm/issues/154))
- Added the "Open tasks in" setting to open tasks in a tab instead of a modal
- Task notes now open in the task editor when tasks open in a tab
- The task menu can now move the open task into a tab
- Added tree lines joining subtasks to their parent in the table, with the "Show subtree connections" setting
- Added the "Line borders" setting to draw lines between rows, columns, or both in the table

### Changed

- Each project now keeps its note and task notes in its own folder
- Existing projects move into their own folder when the vault opens, keeping filters, saved views, and open tabs
- New sub-projects are now created inside their parent's folder
- Renaming a project note now renames its folder too
- Deleting a project now deletes its folder, unless a sub-project is inside it
- Tags in the task editor are now sorted alphabetically
- Custom fields in the task editor now use the same controls as built-in properties
- Project members, team members, and assignees now share one picker that searches person notes and can create new ones
- The people picker now offers global team members, project members, and everyone assigned in the project
- A person picked as a plain name now shows as picked when found as a note
- Clicking the project name above the table, timeline, and board now opens its overview instead of renaming the project
- Assignee lists are now sorted by display name
- Replaced the project cards with a table showing progress, task counts, members, and the last due date
- The project list now counts projects with overdue tasks
- The project list now joins sub-projects to their parent with tree lines, following the "Show subtree connections" setting
- The project list now follows the "Line borders" setting
- Project settings now open in their own page and save each change immediately
- The new project dialog now asks for name, icon, color, parent, members, and description at once
- Redesigned the new project dialog to match the task editor
- Replaced the ten preset project colors with a color picker
- The projects folder setting now only sets where new projects are created, not which projects are shown
- Table rows no longer have separator lines unless "Line borders" is on
- Obsidian 1.13 or later is now required
- Settings are now grouped by area, with statuses, priorities, team members, and TaskNotes on their own pages
- Settings now show up in Obsidian's settings search
- The TaskNotes settings page now shows how many statuses and priorities differ before importing
- Settings that depend on another setting are now disabled until it is turned on
- Add buttons in the table, Gantt, project editor, and settings now share one style
- Remove buttons in the task editor, project editor, and settings are now icon buttons with tooltips
- The import dialog now uses Obsidian's native buttons
- The Gantt zoom control now uses Obsidian's native buttons
- Filter and saved view buttons now match Obsidian's native buttons, with an accent tint when active
- Clicking a task description now places the cursor where you clicked
- Subtasks are now archived and unarchived with their parent
- Removed the progress bar from the time tracking section in the task editor
- Removed the subtask count from kanban cards
- Property rows in the task editor now have the same height
- Section labels in the task editor are now smaller and lighter
- Completed subtasks are now crossed out in the task editor
- Aligned the add subtask field with the subtasks above it
- Tasks under "Depends on" and "Blocks" now open in the task editor when clicked
- The "Blocks" list in the task editor is now a task list like "Depends on", replacing the chips
- The timeline marker for outside dependencies now opens those tasks when clicked
- Clicking a subtask in the task editor now opens it in its own editor
- Subtasks are now renamed in their own editor instead of in the subtasks list

### Fixed

- Fixed due dates showing a day early on the board, table, project list, and overview for users behind UTC
- Fixed status and priority icons missing from the filter dropdowns and bulk action bar
- Fixed project icons from the icon grid showing as text in the project list, toolbar, overview, project settings, and project picker
- Fixed clearing a number custom field writing an invalid value to the note
- Fixed link custom fields showing raw link text in the table
- Fixed person custom fields showing text instead of an avatar in the table
- Fixed person custom fields losing the note link when set in the task editor
- Fixed checkbox custom fields showing true or false in the table
- Fixed URL custom fields showing as plain text in the table
- Fixed assignees on the project overview not opening their notes when clicked
- Fixed linked assignee names showing raw link text in the assignee filter, bulk assign menu, timeline tooltip, and task editor
- Fixed the assignee filter missing tasks that write the same person's name differently
- Fixed the assignee filter treating two people with the same name as one when each has their own note
- Fixed task titles sitting above the middle of taller rows
- Fixed a change in one view being undone by the next click in another view of the same project ([#173](https://github.com/StepanKropachev/obsidian-pm/issues/173))
- Fixed a project open in two views showing outdated data in one of them ([#173](https://github.com/StepanKropachev/obsidian-pm/issues/173))
- Fixed the task editor dropping changes made elsewhere while it was open
- Fixed outside edits to a project file not showing in an open view until it was reopened
- Fixed settings changes not showing in open views until they were reopened
- Fixed the table stopping short of its last rows when scrolled to the bottom
- Fixed the table sort arrow staying on the previously sorted column
- Fixed start and completed dates being marked overdue in the task editor ([#156](https://github.com/StepanKropachev/obsidian-pm/issues/156))
- Fixed the due date of a done task being marked overdue in the task editor ([#156](https://github.com/StepanKropachev/obsidian-pm/issues/156))
- Fixed the due date of a done task being highlighted as urgent in the table
- Fixed text and images in task descriptions not being selectable ([#169](https://github.com/StepanKropachev/obsidian-pm/issues/169))
- Fixed task descriptions rewrapping when clicked for editing
- Fixed search not finding tasks by id ([#167](https://github.com/StepanKropachev/obsidian-pm/issues/167))
- Fixed the import dialog offering the built-in statuses and priorities instead of the configured ones
- Fixed the task editor showing two close buttons
- Fixed the add property button touching the custom fields section in the task editor
- Fixed uneven spacing around the line under the properties in the task editor

## [1.8.0] - 2026-07-03

### Added

- The Gantt timeline header now stays at the top when scrolling
- Added the "Create task from selection" command and right-click menu item

## [1.7.0] - 2026-07-02

### Added

- Added the "Show tag colors" setting, on by default, for colored dots on tags
- Clicking the task ID or file path in the task editor now copies it

### Changed

- Redesigned the task modal
- Status, priority, type, and dates are now changed with a value picker
- Tags, assignees, and dependencies are now edited with a searchable picker
- Repeat and dependencies are now hidden until added from the "Add property" menu
- Archive, delete, and open as note are now grouped in one menu in the task editor
- Subtask progress now counts only completed subtasks
- Assignee avatars now stack when a task has several people
- Checkboxes now match the task table style
- Priority is now shown as a colored chevron instead of a dot
- Value pickers in the task editor now size to their options
- Tags in the task table and on kanban cards now show a colored dot
- Logged time now looks the same in the task table and on kanban cards

### Fixed

- Fixed the priority strip in the task editor not showing along the top edge of the window
- Fixed the task editor title showing an input background on hover or focus
- Fixed time tracking not showing the over-estimate state once logged time passed the estimate

## [1.6.3] - 2026-06-17

### Fixed

- Fixed the project view being empty with Pane Relief or Hover Editor enabled ([#80](https://github.com/StepanKropachev/obsidian-pm/issues/80))

## [1.6.2] - 2026-06-17

### Changed

- Task note filenames now keep more of the title before shortening

### Fixed

- Fixed subtasks added in the task editor being lost on reload ([#90](https://github.com/StepanKropachev/obsidian-pm/issues/90))
- Fixed the app freezing when duplicating a task with a long title
- Fixed the project list showing outdated task counts until it was reopened ([#121](https://github.com/StepanKropachev/obsidian-pm/issues/121))

## [1.6.1] - 2026-06-15

### Changed

- Task and project modals now use Obsidian's native borders, shadows, and corners
- Status, priority, and tag labels now use Obsidian's native styling
- The accent color now follows the Obsidian theme
- Gantt elements now follow the Obsidian theme: the today marker, milestone and subtask buttons, and row selection and hover
- Kanban cards now align the assignee and due date to the bottom

### Fixed

- Fixed subtasks created from the subtasks list or add subtask buttons not getting the subtask type ([#82](https://github.com/StepanKropachev/obsidian-pm/issues/82))
- Fixed assignees written as note links (`[[People/Jane Doe]]`) showing the link path on their avatar ([#64](https://github.com/StepanKropachev/obsidian-pm/issues/64))

## [1.6.0] - 2026-06-12

### Added

- Completing a task now records a completion date, editable in the task modal ([#93](https://github.com/StepanKropachev/obsidian-pm/issues/93))
- Added the "Show description preview on board" setting, off by default, to show the first three lines of a description on kanban cards ([#59](https://github.com/StepanKropachev/obsidian-pm/issues/59))

### Changed

- Saving a task now writes only the affected task notes
- Projects open faster and reopen instantly, and outside edits are still picked up
- Improved table performance in large projects
- Views now update in place after an edit, keeping the scroll position and selection
- Select all in the table now selects every task matching the filter, not just the visible rows
- Collapsing or expanding a subtree no longer changes task notes
- The expand/collapse toggle now looks the same in the table and Gantt views
- Increased the contrast between completed and remaining work on Gantt bars ([#87](https://github.com/StepanKropachev/obsidian-pm/issues/87))
- Removed the stripe from Gantt bars of tasks with subtasks

### Fixed

- Fixed images pasted or dropped onto a task being saved to the vault root instead of the task's folder. The folder now moves with the task and is deleted with it.
- Fixed duplicating a task with subtasks failing with a "note already exists" error ([#90](https://github.com/StepanKropachev/obsidian-pm/issues/90))
- Fixed progress bar labels showing 0% in some views
- Fixed the subtasks toggle not responding in the Gantt view

## [1.5.0] - 2026-05-25

### Added

- Added the "Save tasks on close" setting, on by default. When off, closing the task modal without saving discards edits ([#62](https://github.com/StepanKropachev/obsidian-pm/issues/62))
- Added an "Open as note" button to the task modal header
- Added pasting and dropping images and files into the task description, saved to the attachments folder
- The search box, filters, and saved views now appear above every view, not just the table
- Filters are now remembered per project across plugin reloads
- Saved views now remember their view mode and switch to it when selected
- Gantt now lifts a matching task to the top level when its parent is filtered out
- Release files now carry GitHub build provenance attestations, verifiable with `gh attestation verify <file> --owner StepanKropachev`

### Changed

- The UI now follows the Obsidian theme for the accent, near and overdue colors, badges, and avatars
- Toolbar, Gantt, filter, and bulk action buttons now use Obsidian's native size
- Saved view tabs now match the filter pills
- The "Save view" and inline add buttons are now native Obsidian buttons
- Status and priority badges in the task modal are no longer focusable with the keyboard
- The delete confirmation now uses Obsidian's warning style
- Primary buttons in the light theme now use a solid accent fill
- The project header gear, bulk clear, remove, and table row buttons now use Obsidian's icons
- Remove buttons on tags, assignees, and dependencies now turn red on hover
- Progress bars on project and kanban cards are now 3px tall
- The filter row now collapses when no filters are active, and the Filter pill expands it
- Toggling a filter pill no longer moves focus out of the search box
- Gantt milestone labels and dependency arrows now follow the active filter
- View switcher buttons now show only an icon
- Avatar initials now use the first letter of the first two words, so "Michael Jordan" shows "MJ"
- New task notes are now named after the task title, and existing notes keep their name until renamed

### Removed

- Removed the Gantt "Hide completed" button in favor of the Status filter. Existing settings migrate automatically.
- Removed the quick add input above the table in favor of the toolbar "Add task" button

### Fixed

- Fixed extra spacing next to a single avatar in the project edit modal
- Fixed kanban cards dropping the fourth and later assignees
- Fixed duplicate tasks appearing when creating a task
- Fixed a saved view staying highlighted after its filter changed
- Fixed garbled avatar initials for assignees stored as wikilinks (`[[Wiki Link]]`) ([#64](https://github.com/StepanKropachev/obsidian-pm/issues/64))
- Fixed renaming a task to an existing note's title failing without an error

## [1.4.0] - 2026-04-29

### Breaking Changes

- Clicking a project file no longer opens the project view. Bind the new "Open current file as project" command to a hotkey to get the old behavior.

### Added

- Added "Duplicate task" to the table and Kanban context menus
- Added the "Open current file as project" command

### Fixed

- Fixed "today" rolling over in the evening for users west of UTC
- Fixed clicking a project from a task tab replacing the tab
- Fixed opening a project creating duplicate tabs
- Fixed the ribbon button opening a second project list
- Fixed the table losing its scroll position when the task modal opened and closed
- Fixed project folder errors on case-insensitive file systems

## [1.3.2] - 2026-04-21

### Fixed

- Fixed `file://` links in task descriptions not opening on click

## [1.3.1] - 2026-04-21

### Added

- Added redo for Gantt drag actions (Cmd+Shift+Z, Cmd+Y, or the "Redo last action" command)

### Fixed

- Fixed Cmd+Z taking over undo in unrelated notes while a project tab was open

## [1.3.0] - 2026-04-18

### Added

- Added custom task statuses in settings
- Added subtasks as draggable cards on the Kanban board
- Added undo for Gantt drag actions (Ctrl/Cmd+Z)
- Added interactive checkboxes in the task description preview
- Added a "Hide completed tasks" toggle to Gantt
- Added bulk set parent and remove parent in the table

### Removed

- Removed the emoji placeholder from the custom status icon field

### Fixed

- Fixed the bulk action bar flickering when toggling filters
- Fixed orphaned subtasks not reattaching to their parent on load
- Fixed tasks with a deleted custom status not being moved to another status

## [1.2.0] - 2026-04-14

### Added

- Added the "Import notes as tasks" command to import vault notes into a project from a file picker
- Added linking dependencies by clicking on the Gantt chart
- Added dragging Gantt bars to reschedule tasks
- Added setting start and due dates by clicking an empty Gantt row
- Added dependency-based auto-scheduling
- Added note link suggestions when typing `[[` in the description field
- Added a Markdown preview for task descriptions, with a toggle between editing and preview
- Added Shift+click range selection for table checkboxes
- Added Gantt week labels: week number, date range, or both

### Changed

- The dependency picker now hides tasks that would create a cycle
- Links to canvases and databases now work in task descriptions
- Bulk checkboxes are now hidden until the row is hovered
- Task modal buttons now show the Shift+Enter shortcut hint

### Fixed

- Fixed dependent tasks losing a day on each reschedule
- Fixed the Gantt scroll position resetting on re-render
- Fixed the import modal writing tasks to the wrong folder
- Fixed subtasks not showing when added from the parent task modal
- Fixed deleting dependent tasks crashing the plugin
- Fixed the task modal jumping while typing long descriptions
- Fixed slow, double-toggling checkboxes in the import modal

## [1.1.1] - 2026-04-11

No release notes. See the [1.1.0...1.1.1 diff](https://github.com/StepanKropachev/obsidian-pm/compare/1.1.0...1.1.1).

## [1.1.0] - 2026-04-08

First stable release.

### Added

- Gantt: drag-to-reschedule, snap-to-grid, resizable sidebar, milestones, and week/month/quarter scales
- Kanban: drag-and-drop board grouped by status
- Table: sort, filter, saved views, inline date editing, and a quick-add bar
- Task modal: subtasks panel, time tracking, custom fields, and auto-save on dismiss
- Bulk actions: multi-select for status changes, deletion, and archive/unarchive
- Custom fields per project: text, number, date, checkbox, select, and multi-select
- Archive system with a toggle to show archived tasks
- Command palette: create tasks and open projects from anywhere
- Tasks stored as YAML frontmatter in Markdown files

## [1.0.0-beta] - 2026-03-30

Initial beta.
