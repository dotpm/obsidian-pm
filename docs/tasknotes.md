# Using with TaskNotes

dotpm works alongside the [TaskNotes](https://github.com/callumalpass/tasknotes) plugin, 4.10 or newer. Both edit note properties without removing what they do not know, so each plugin's fields remain after the other writes.

## Import TaskNotes tasks

**dotpm: Import notes as tasks** recognizes TaskNotes tasks and converts them with their fields:

- scheduled and due dates become start and due
- `blockedBy` links between imported notes become dependencies
- project links between imported notes become parent and subtask relationships
- tags, time estimates, completion dates, simple recurrence and archive state carry over
- statuses and priorities the imported tasks use are added to your palettes

Choose **move** to turn the notes into task files inside the project's task folder, or **copy** to leave the originals where they are.

## Share statuses and priorities

**Settings > TaskNotes > Statuses and priorities** copies TaskNotes' palettes into dotpm, so both plugins use the same ids, names and colors. Entries TaskNotes does not have are kept.

## Let TaskNotes list dotpm tasks

TaskNotes can show and edit dotpm tasks in place, without conversion:

1. In TaskNotes settings, set task identification to **property**, name `pm-task`, value `true`.
2. In its field mapping, map **scheduled** to `start`.
3. Add your dotpm status and priority values to TaskNotes' palettes.

Hierarchy and dependencies do not resolve on the TaskNotes side, since it uses project links and `blockedBy` where dotpm uses its own references.
