# Keyboard

Project Manager views are keyboard-first: browsing, selecting and acting on tasks works
without reaching for the mouse, and the keys stay inside the PM view. The Obsidian editor,
other panes and dialogs keep their own keys.

Press `?` (or `F1`) in any PM view for the keys available there, or `Mod+K` for a
searchable list of actions on the current item. The same sheet is under the view's More
menu. `Mod` is Cmd on macOS and Ctrl elsewhere.

## Keys

The table, board and timeline share their task keys. The project list swaps task actions
for project ones. Selection keys (`Space`, `Shift+↓`, `Shift+↑`, `Mod+A`) belong to the
table; the board and timeline act on the active item. Where a key does not apply, the
shortcuts sheet leaves it out.

| Key | Action |
| --- | --- |
| `↓` / `j`, `↑` / `k` | Next / previous item |
| `←` / `h`, `→` / `l` | Previous / next column on the board; collapse / expand a row in the table, timeline and project list |
| `Home` / `g`, `End` / `G` | First / last item |
| `PageUp`, `PageDown` | Move a page |
| `Enter` / `e` | Open the editor (project list: open the project) |
| `Space` | Select the active task and move on |
| `Shift+↓`, `Shift+↑` | Extend the selection |
| `Mod+A` | Select every visible task |
| `Esc` | Close a popover, then clear the selection, then the cursor |
| `n`, `Shift+N` | New task / new subtask |
| `x` | Toggle done |
| `s` / `Shift+S` | Next / previous status |
| `p` / `Shift+P` | Next / previous priority |
| `a` | Assign people |
| `d` | Set the due date |
| `#` | Add or clear tags |
| `m` | Move to a project, set a parent, or remove it |
| `Mod+D` | Duplicate |
| `u` | Archive or unarchive |
| `Delete` / `Backspace` | Delete, after confirming |
| `Mod+Z`, `Mod+Shift+Z` | Undo / redo |
| `Mod+←`, `Mod+→` | Move a board card to the previous / next column |
| `Mod+F` or `/` | Focus search |
| `f` / `Shift+F` | Open the filter panel / clear every filter |
| `v`, `1` `2` `3` | Next view, or table / board / timeline |
| `Mod+K` | Actions for the current item and view |
| `?` or `F1` | Keyboard shortcuts |

In any picker, `↑`/`↓` move through the options, `Home`/`End` jump to the ends, and
`Enter` picks. `Esc` closes only the picker; a task editor stays open.

`f` opens the filter panel with its search field focused. Typing narrows the fields, `Enter`
takes the first match, and `↓` walks the list. Picking a field lands on its first option, so
`Space` or `Enter` ticks it and `↓`/`↑` move on without a Tab. `↑` from the first option
reaches the operators (`is any of`, `is none of`, …), where `←`/`→` switch between them,
and one more `↑` reaches the back button. In the list of applied filters, `→` moves from a
row to its remove button. Number and date fields keep the arrows for their own value; `Tab`
leaves them. `Esc` closes the panel, and focus goes back to the page, so `Enter` acts on the
task under the cursor again; every change has already been applied. `Shift+F` drops all
filters at once (conditions and the archived toggle; the search text stays).

On the project list, `o` opens the project overview and `e` edits the project. On a
project's overview page, `Enter` opens its tasks, `e` edits the project, `o` opens the
Markdown note, and `n` adds a task.

Field changes made with keys (`x`, `s`, `p`, `a`, `d`, `#`) go on the plugin's undo
stack. Deleting always asks first. Moving a task to another project or parent is not
undoable, just as it is not from the context menu; a task moved to another project
starts there as a top-level task. Keys in a text field, a popover, a menu
or a dialog are left alone.

## How it works

The layer lives in `src/ui/keyboard/`:

- `KeyboardController` registers one dispatcher per key on the view's Obsidian `Scope`.
  The Scope is active only while that PM leaf has focus, and a modal takes it away, so
  nothing leaks globally. It checks for text fields, IME composition, popovers, menus and
  dialogs before acting, and ignores key repeat for one-shot actions.
- `FocusCursor` is pure navigation over a surface's `groups()` of ids: next/previous,
  columns, pages, ranges, and snapping back after a re-render. It stores ids, so filters,
  re-sorts and virtual scrolling do not move the cursor.
- Keymaps and action labels are in `keymap.ts`; task actions in `taskActions.ts` use the
  same store calls as the context menu and bulk bar. `choice.ts` is the one keyboard
  picker behind people, dates, tags, projects and the action palette.
- Each view supplies a small adapter implementing `KeyboardSurface` (`groups`,
  `activeId`, `setActive`, optional selection), plus its own action handlers. The table,
  board, timeline label column and project list all use the same cursor.

Adding a key means adding a binding to `keymap.ts`; adding an action means adding a handler
to the view that owns it. The help sheet and the palette are generated from both, so they
cannot drift from what is actually bound.
