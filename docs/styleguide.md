# UI styleguide

The catalog of UI components: what exists and which one to reach for. Read it before building or changing any UI. The layer rules (primitives, composites, orchestrators, and what each may import) are in CLAUDE.md under "UI layers".

Check appearance in the live gallery (see the end of this page), never in a standalone HTML page. Without Obsidian's own `app.css` the controls misrender.

## Decision tree

| Need | Use |
| --- | --- |
| A small label, badge or token (status, priority, tag, due date, count) | `Chip` |
| A text button | Obsidian `ButtonComponent` |
| An icon-only button | `IconButton` |
| A compact button, toggleable or not | `ChipButton` |
| A remove button on a token | `Chip.setRemovable` |
| An "add" ghost row or button | `renderAddButton` |
| Mutually exclusive options | `SegmentedControl` (text) or `ViewSwitcher` (icons) |
| A floating panel with inputs | `Popover` |
| A flat action list at the cursor | Obsidian `Menu` |
| A status or priority indicator | `renderStatusBadge`, `renderPriorityBadge`, `renderStatusDot` |
| Logged and estimated hours | `renderTimeChip` |
| A due date with urgency colors | `renderDueChip` |
| Which project something belongs to | `renderProjectChip` |
| A link to a note (a task, a person) | `renderNoteLink` |
| A person's initials | `Avatar`, `AvatarStack` |
| A progress indicator | `ProgressBar` |
| An empty placeholder | `EmptyState` |
| A boolean the user flips | `Checkbox` |
| An icon or emoji picker | `renderIconControl` |
| A label plus value form row | `renderPropRow` |
| A removable token list | `renderMultiSelect` |
| Editing custom field definitions | `renderCustomFieldListEditor` or its row internals |
| Picking people | `renderPersonPicker` |
| A row of headline numbers | `renderMetricStrip` |
| Dated points on one track | `renderMilestoneTimeline` |

Nothing fits? Extend an existing primitive with a setter or variant rather than adding a class or a one-off element. A new primitive means updating this page and `src/views/styleguide/StyleguideView.ts` in the same change.

## Primitives

`packages/ui/src/primitives/`. Chained-setter API modeled on Obsidian's `ButtonComponent`. The constructor takes `parentEl` and the root element is `.el`. Primitives import nothing from the store or the plugin.

### Chip

The one label primitive: status, priority, tags, due dates, time, small badges.

- API: `new Chip(parent).setLabel(text).setVariant('solid'|'outline'|'plain').setColor(cssColor).setDot(bool).setLeadingIcon(lucide).setTag(bool).setStrong(bool).setShape('rounded'|'pill').setSize('md'|'sm').setTooltip(text).setRemovable(onRemove).onClick(handler)`
- CSS: `pm-chip` with `--solid`, `--outline`, `--plain`, `--tag`, `--strong`, `--pill`, `--sm`, `--interactive`; parts `pm-chip-label`, `-icon`, `-dot`, `-rm`. Color flows through `--pm-chip-color`.
- Use for any small labeled token, clickable or not. `onClick` adds hover and click styling.
- Not for a real button: `ChipButton` when compact, `ButtonComponent` otherwise.

### ChipButton

The button sibling of `Chip`: a compact native button with an optional persistent active state. Wraps `ButtonComponent`. Active carries the plugin's 12% accent-tint selection look. Used by saved views, filter dropdowns, the due and archived toggles, and the filter row's Clear.

- API: `new ChipButton(parent).setLabel(text).setActive(bool).setShape('rounded'|'pill').setAriaLabel(text).onClick(h).onContextMenu(h)`
- CSS: `button.pm-chip-btn` (the `button` prefix outranks core button chrome), `--active`, `--pill`
- Use for a compact button among chips, with or without state.
- Not for a non-interactive label (`Chip`) or a full-size action button (`ButtonComponent`).

### Avatar and AvatarStack

An initials disc for a person. The stack renders several with a `+N` overflow badge.

- API: `new Avatar(parent).setName(raw).setSize('md'|'sm').setUnresolved(bool).onClick(fn)`. `new AvatarStack(parent).setPeople(AvatarPerson[]).setMax(n).setSize('md'|'sm')`, or `setNames(string[])` for people with no note behind them.
- `AvatarPerson` is `{ name, unresolved?, onClick? }`. Orchestrators build it with `linkedRefs(app, values, sourcePath)` from `src/views/linkedRefs.ts`, which resolves each stored value and opens its note on click. It is the one resolver for stored values that name a note: assignees, members and person custom fields all go through it.
- `setName` runs `displayName(raw)` from core, which resolves `[[wikilink|alias]]` names.
- CSS: `pm-avatar` with `--sm`, `--more`, `--link`, `--unresolved`; `pm-avatar-stack`. Background comes from `stringToColor`.
- Use for any assignee or member display. When the raw name is needed as text, call `displayName` directly.

### IconButton

Icon-only button. Wraps `ExtraButtonComponent`.

- API: `new IconButton(parent).setIcon(lucide).setTooltip(text).setRevealOnHover(bool).onClick(h)`
- CSS: `pm-icon-btn`, `--hover-only`
- Use for row actions, remove buttons, hover-revealed actions. A button with a text label is a `ButtonComponent`.

### ProgressBar

A horizontal track with an optional percent label.

- API: `new ProgressBar(parent).setValue(0-100).setColor(cssColor).setSize('sm'|'md').setShowLabel(bool)`
- CSS: `pm-progress`, `-track`, `-fill`, `-label`, `--sm`; color via `--pm-progress-color`
- Use for task and project completion. For editable progress, swap the bar for a number input on click with `makeInlineEdit` (ProgressCell) or use `renderInputControl` (the task editor's Progress row).

### CollapseToggle

Obsidian's collapse triangle for tree rows.

- API: `new CollapseToggle(parent, { collapsed, onToggle, subject? })`, constructor only. `subject` names what collapses in the aria label, defaulting to subtasks.
- CSS: `tree-item-icon collapse-icon pm-collapse-toggle`, `is-collapsed`. A 28px click target around a 14px icon. Hover only recolors, like Obsidian's own.
- Use for subtask trees and sub-projects in the project list.

### Checkbox

Obsidian's native checkbox, for anything stored as a plain boolean. Backs the subtask done boxes and `checkbox` custom fields.

- API: `new Checkbox(parent).setChecked(bool).setAriaLabel(text).onChange(checked => ...)`. `.el` is the `input`.
- CSS: `pm-checkbox`, alignment only; core paints the box.
- Not for a choice among options (`renderSelectControl`) or a filter toggle among chips (`ChipButton`).

### EmptyState

A quiet placeholder: small icon, one line of muted text, optional call to action.

- API: `new EmptyState(parent).setIcon(text).setTitle(text).setBody(text).setAction(label, onClick)`
- CSS: `pm-empty-state`, `pm-empty-icon`, `pm-empty-action`. The action is a native CTA `ButtonComponent`.

### SegmentedControl

Mutually exclusive text options, such as the Task / Subtask / Milestone type picker.

- API: `new SegmentedControl(parent, { options: [{id, label}], active, onChange })`
- CSS: `pm-segmented`, layout only. The buttons are native `ButtonComponent`s and the active one gets `setCta()`.

### ViewSwitcher

Mutually exclusive icon options, such as the Table / Gantt / Kanban switcher.

- API: `new ViewSwitcher(parent, { options: [{id, icon, label}], active, onChange })`
- CSS: `pm-view-switcher`, `pm-view-btn`, `--active`

### Popover

A floating panel anchored to a trigger, for content `Menu` cannot host: date inputs, search fields. Renders as a bottom sheet on phones. Handles outside click, Escape, repositioning on scroll and resize, and the focus trap inside modals. Read its JSDoc before use.

- API: `new Popover({ anchor, host?, align?: 'left'|'right', width?, onClose? })`. Fill `.contentEl`, then `open()` and `close()`. `isOpen` getter.
- CSS: `pm-pop`, `pm-pop-body`, `--sheet`; positioned through `--pop-top`, `--pop-left`, `--pop-width`
- Use when an anchored panel needs focusable inputs. A flat list of actions is a `Menu`.

## Composites

`packages/ui/src/composites/`. Composites take resolved data and callbacks as props: no `plugin`, no `store`, no `onRefresh`. If a composite needs `plugin`, it is the wrong shape. Push the store access up to the orchestrator view.

### Rows and cards

**KanbanCard.** Props: task, priorityColor, descriptionPreview, parentTitle, renderSource, loggedHours, overdue, showTagColors, plus onClick, onContextMenu, onDragStart, onDragEnd. Composes Chip (milestone, subtask and recurring badges), renderTimeChip, renderDueChip, AvatarStack, ProgressBar and renderTagChip. It knows nothing about projects: `renderSource` is a slot the board fills with `renderProjectChip` when a card has to say where it is from.

**KanbanColumn.** Props: status, cards, plus drag, drop and card callbacks. Composes KanbanCard.

**ProjectRow.** One `<tr>` of the project list, on the same `pm-table` chrome and cell classes as the task table. Props: title, icon, color, depth, treeGuides, isLastChild, childCount, collapsed, tasksDone, tasksTotal, overdue, members, dueLabel, dueUrgency, plus onToggleCollapsed, onClick, onContextMenu, onActions. Composes CollapseToggle when it has sub-projects, ProgressBar, a red overdue Chip, AvatarStack, renderDueChip and a hover-revealed IconButton. It indents from `--depth` and draws sub-project connectors from `treeGuides` and `isLastChild`, the same way TitleCell does. The caller reads `settings.showSubtreeConnections` to decide, stamps `settings.lineBorders` on the wrapper as `data-borders`, and passes counts rolled up over the subtree.

**TaskRow.** A bare `<tr>` with row-click routing that ignores interactive descendants. Props: taskId, depth, isDone, isArchived, isSelected, onRowClick. Cells render into it.

**ProjectHeader** (`ProjectHeader/`). Props: tasks (every task in scope, for the assignee and tag options), savedViews, statuses, priorities, filter, activeSavedViewId, plus callbacks. Methods: `refresh`, `notifyMutation`, `setActiveSavedViewId`. Composes PrimaryRow (saved-view ChipButtons and the save button) and FilterRow (filter dropdowns, due and archived ChipButtons).

### Render helpers

Each of these is the only way to render its thing.

| Function | Renders |
| --- | --- |
| `renderAddButton(parent, label, onClick)` | A ghost "+ label" button (`pm-prop-add`) |
| `renderTagChip(parent, tag, colored)` | An outline tag Chip with an optional color dot |
| `renderTimeChip(parent, logged, estimate, size?)` | A `logged/estimateh` Chip, red solid when logged exceeds the estimate, nothing when both are 0 |
| `renderDueChip(parent, label, urgency, size?)` | A due-date Chip, orange for `'near'`, red solid for `'overdue'`. The caller formats the label with `formatDateLong` or `formatDateShort` |
| `renderProjectChip(parent, { title, color, onClick? })` | A dot-led outline Chip naming a project. With `onClick` it gets a tooltip and stops the click reaching the row or card under it. Used by the table's ProjectCell, the board's cards and the timeline's labels |
| `renderNoteLink(parent, { label, path, open, cls? })` | An `a.pm-note-link.internal-link` carrying the note in `data-href` and nothing in `href`, so click and Enter or Space both run `open` through `makeActivatable`. `cls` carries the caller's layout class. Used by dependency rows and the task editor's subtasks |
| `renderMetricStrip(parent, stats)` | A bordered row of `{ label, value, sub?, extra?, alert? }` cells. `extra` places a bar or chip beside the value, `alert` colors it red. The project overview's stats row |
| `renderMilestoneTimeline(parent, points, todayPos)` | One track with date-proportional dots (`done`, `next`, `plan`) and a dashed today marker. The caller converts dates to 0-100 positions. Labels closer than one label width drop to a second row, and the track scrolls horizontally once it holds more milestones than fit |

### Cells

`cells/`. One `<td>` builder per column: StatusCell, PriorityCell, ProjectCell, TitleCell, DueDateCell, TimeCell, ProgressCell, AssigneesCell, ExpandCell, ActionsCell, SelectCell, CustomFieldCell. Adding a table column means adding a cell here, not inline DOM in the renderer. `inlineEdit.ts` (`makeInlineEdit`) is the shared inline text, date and number editor.

- **ProjectCell** is a `renderProjectChip` in a `<td>`, rendered only when the view covers several projects.
- **CustomFieldCell** takes one `CustomFieldValue`: `{ kind: 'text' }`, `{ kind: 'checkbox' }` (a check glyph, or a dash when false), `{ kind: 'url' }` (an `a.external-link`), `{ kind: 'people' }` (an AvatarStack, the same avatars AssigneesCell shows) or `{ kind: 'links' }` (note names as `pm-cf-link`, joined with commas). People and links are both `AvatarPerson[]` from `linkedRefs`, so a person field and an assignee resolve and open the same way.
- **TitleCell** keeps the `<td>` a real table cell and puts the title, badges and tags in a `.pm-table-title-inner` flex row, so a row made taller by another column still centers them. It indents from `--depth` on the parent `TaskRow` (CSS, not an inline style) and draws subtask connectors through `renderTreeGuides` (`composites/treeGuides.ts`, shared with `ProjectRow`) from `treeGuides` and `isLastChild`: one `.pm-tree-guide` span per indent column, the deepest carrying `--elbow`. Pass `treeGuides: null` to indent without lines. Build the children's array with `childTreeGuides(guides, isLastChild)` from the same module. The caller reads `config.showSubtreeConnections` to decide.
- **The grid** is off by default. `TableRenderer` stamps `config.lineBorders` onto the wrapper as `data-borders` on every body fill, so a settings change applies without rebuilding the table. Cells carry no rules of their own.

### Property controls

`properties/`, barrel `index.ts`. `src/modals/TaskFormFields.ts` shows the intended composition with `renderPropRow`. A project's custom fields go through the same controls (`src/modals/CustomFieldInputs.ts`), one per field type, so a custom date behaves like Due and a custom select like Status. A `checkbox` field is the `Checkbox` primitive, the one type with no control of its own.

- **`renderSelectControl`**: single-choice popover. Status, priority, type, repeat, parent.
- **`renderMultiSelect`**: multi-choice. Tags, people, dependencies. `moreOptions(query)` adds a second searched tier under `moreHeading`. `createAlt` adds a second create row whose async `run` is awaited before the list repaints; `renderPersonPicker` uses both to offer vault person notes and to create one. `keyOf(id)` is the identity a selected value is matched by, so a person written as a name and as a link is one row rather than two. In `depsList` mode, `linkFor(id)` gives back the note a value stands for and how to open it.
- **`renderDepRow`**: one task in a dependency list. Link icon, task id, title, and a remove button when `onRemove` is passed. With a `link`, the title is a `renderNoteLink`; the task editor points it at `openTaskByPath`, so a dependency opens that task's editor rather than the markdown behind it. The deps-list mode of `renderMultiSelect` builds its rows from it and the task editor's read-only Blocks list calls it directly, so both read the same.
- **`renderDateControl`**: date popover. Renders a `.pm-due` hint span only when the caller passes `hint`: a relative due state on Due, a muted on-time or late outcome on Completed, nothing on Start.
- **`renderInputControl`**: click-to-edit text, number or date with an optional display `suffix`. The `number` option rounds and clamps to `min` and `max` and is read only when `inputType` is `'number'` (Progress).
- **`renderIconControl`**: an icon preview that opens a searchable grid of every icon Obsidian knows. A query that is not a plain icon name is offered as a literal glyph, which is how emoji are picked, and "No icon" clears it. Backs the status and priority icon fields, the new project dialog and the project edit page.
- **`renderAddProperty`**: the progressive-disclosure "Add property" row, built on `renderAddButton`.
- **`optionList.ts`**: `renderGlyph` and `renderOptionRow`. `renderGlyph` is the only way to draw a value that came out of `renderIconControl`. It decides between a named icon, an emoji and a color dot, so nothing that shows a project, status or priority icon may print the raw string. Set `--pm-glyph-size` on the container to size it; the default is 14px for a named icon and 12px for an emoji.

## Shared widgets

Richer than primitives, used across views. Four live in `packages/ui/src/` because composites use them; four stay in `src/ui/` because they need `plugin`, the store or `Notice`. Avoid growing either group. Prefer a composite or primitive when one fits.

### In `packages/ui/src/`

- **FilterDropdown**: `renderFilterDropdown(parent, label, selected, options, onChange)`. A ChipButton that opens a checkable Menu with a Clear item. Any multi-select filter control. An option may carry `icon` (and `namedIcon` for a priority's rank icon). Rows go through `addPaletteMenuItem`, so a status filters under the same icon it wears on its badge.
- **FormField**: `renderPropRow(container, label, valueBuilder, icon?)`. The label plus value row every property grid is built from.
- **StatusBadge**: `renderStatusBadge(container, task, statuses, onChange)` is a solid dot-led Chip with a picker Menu. `renderPriorityBadge(container, task, priorities, iconSet, onChange)` is a plain Chip with a rank icon and a picker Menu; the icon comes from `priorityIcon(priorities, id, iconSet)` in core, which picks from `PRIORITY_ICON_SETS`. `renderStatusDot(container, status, statuses, cls?)` is a bare colored dot. `addPaletteMenuItem(menu, entry, { checked?, onClick })` renders one status or priority as a menu row, emoji inline in the title and named icons through `setIcon`, with `namedIcon` overriding which is shown. Every menu that lists statuses or priorities builds its rows with it: the badges, the bulk action bar, the filter dropdowns. The only way to render a status or priority.
- **CustomFieldListEditor**: `renderCustomFieldFields(parent, field, onChanged, redraw)` (name input and type select) and `renderCustomFieldOptions(parent, field, onChanged)` (the choices a select offers, nothing for other types) are the row internals the vault-wide list in plugin settings composes. `renderCustomFieldListEditor(container, { fields, onChanged, renderExtra? })` wraps them with a delete button and an "Add custom field" row for the project edit page. `renderExtra` puts per-row content between the type picker and delete, which is how the project page marks a field that overrides an inherited one. `CUSTOM_FIELD_TYPE_LABELS` names the types for anything drawing a field it cannot edit. Inherited fields are not this editor's business: the project edit page draws them as static `.pm-cf-row--inherited` rows above the list.
- **makeActivatable**: `makeActivatable(el, open)` in `packages/ui/src/dom.ts`. Gives a span, div or bare `<a>` what a link needs: `role` and `tabindex`, then click and Enter or Space both running `open` without reaching the row or card behind it. `renderNoteLink`, `Avatar.onClick` and CustomFieldCell's link names go through it. Reach for a real `<button>` first; this is for markup that cannot be one.

### In `src/ui/`

- **TaskContextMenu**: `buildTaskContextMenu(menu, task, ctx)`, the task right-click menu.
- **ModalFactory**: all modal opening. `openTaskModal`, `openTaskByPath` (the same editor for a task addressed by its note path, loading the project it belongs to; what a link to a task opens), `openProjectCreate`, `openProjectPicker`, `openTaskPicker`, `openPersonLookup` (the people already assigned somewhere, for the command that shows one person's tasks; a lookup, not a way to set a value), `openImportModal`, `confirmDialog`, `confirmDuplicateSubtasks`, `promptText`. Never instantiate a modal from a view. A new project is asked for in a dialog (`openProjectCreate`); an existing one is edited on its own page (`plugin.router.openProjectEdit`).
- **PersonPicker**: `renderPersonPicker({ container, plugin, sourcePath, extra?, addLabel, selected, add, remove })`. The only control for picking people, behind task assignees, person custom fields, project members, the new project dialog and the global team members in settings. A `renderMultiSelect` in `avatarStack` mode whose two tiers come from `peopleSource(plugin, sourcePath, extra?)`: `known()` (the global members plus whatever the caller passes, deduped by `personKey`) and `search(query)` (person notes), plus rows to add a typed name as plain text or create the note for it. `sourcePath` is the note the value is written into, so the link resolves from there; pass `''` when there is no note yet. `peopleSource` is exported on its own for the bulk bar's assignee menu, so every surface offers the same people.
- **PaletteListEditor**: `renderPaletteFields(parent, item, onChanged)` (icon picker, label and color inputs) and `renderStatusDoneToggle` are the row internals the plugin settings pages use. `renderStatusListEditor` and `renderPriorityListEditor` wrap them with a drag handle and a delete button for the project edit page's per-project overrides; plugin settings get those from Obsidian's list settings instead. Plus `wireRowDragReorder`.

## Obsidian components used directly

No wrappers for these:

- `ButtonComponent` for any text button (`.setButtonText().setCta().onClick()`)
- `ExtraButtonComponent` for an icon button when `IconButton`'s extras are not needed
- `Setting` for settings rows and section headings (`.setName().setHeading()`)
- `Menu` for context menus and flat pickers (`.addItem()`, `.showAtMouseEvent()`)
- `SuggestModal` and `FuzzySuggestModal` for searchable pickers, through ModalFactory
- `setIcon(el, 'lucide-name')` for icons. Size through `--icon-size` on the parent; width and height rules do not override `.svg-icon`.

## Live gallery

`src/views/styleguide/StyleguideView.ts` renders every primitive and the key composites in all their variants. Open it with the command "Open styleguide gallery".

The view is compiled in only when the `__STYLEGUIDE__` build constant is true. Dev builds (`pnpm dev`) include it. Production builds exclude it unless `STYLEGUIDE=1` is set in the environment.

Each section carries a `data-sg` attribute for scripted screenshots: `chip`, `chip-button`, `avatar`, `icon-button`, `progress`, `collapse`, `checkbox`, `empty-state`, `segmented`, `view-switcher`, `popover`, `badges`, `form`, `custom-fields`, `time-due`, `project-row`, `cards`, `metric-strip`, `milestone-timeline`, `table`.

## Maintenance

- Adding or changing a component: update its entry here and its section in `StyleguideView.ts` in the same change.
- Removing a component: delete its entry and gallery section, and check `src/styles/` for classes nothing uses any more.
