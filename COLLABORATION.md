# Collaboration log

This tracks feature work done on sub-branches of `enhancing-pm-msfz751`, one section per sub-branch. It's a working record for whoever picks up a branch next (human or agent) — not user-facing like `README.md`, and not a release log like `CHANGELOG.md`.

`enhancing-pm-msfz751` itself stays an empty trunk (currently at the same commit as `main`). Each feature lives on its own sub-branch:

```
main
 └─ enhancing-pm-msfz751 (trunk, no commits of its own)
     └─ add-visibility-tags
     └─ (future sub-branches...)
```

---

## add-visibility-tags

### Problem

Obsidian projects with all their tasks done had no way to get out of the way of the active list short of deleting them. The first attempt at this was a `Project.hidden` boolean with an "Archive project" menu action — but the plugin already has a completely separate, pre-existing **task-level** archive feature (`Task.archived`, `src/store/ArchiveOps.ts`, `src/components/AutoArchiver.ts`) that physically moves a task's file into a `_tasks/Archive/` subfolder. Reusing "archive" vocabulary for projects visually collided with that unrelated feature, so the boolean/menu-item approach was scrapped mid-session in favor of tags.

### What this adds

Projects can now carry **tags**, entirely separate from the pre-existing task-level archive feature:

- `Project.tags: string[]` — a plain array of strings, round-tripped through the note's own `tags:` frontmatter key (the same property Obsidian's native tag pane and search already understand). Any tag outside the `dotpm/` namespace — one you set by hand, or another plugin's — is preserved untouched; the plugin only reads/writes entries under `dotpm/`.
- A starter palette of five colors (`dotpm/orange`, `dotpm/blue`, `dotpm/red`, `dotpm/green`, `dotpm/brown` — `PROJECT_TAG_PALETTE` in `packages/core/src/utils.ts`), plus free-form custom tags. Typed text is sanitized into a valid tag segment (`sanitizeTagSegment`): lowercased, spaces/punctuation collapsed to hyphens, `/` stripped (the caller always supplies the `dotpm/` prefix itself), rejected if nothing usable is left.
- An inline tag picker on every Dashboard project row (`+ Add tag`), reusing `renderMultiSelect` (`packages/ui/src/composites/properties/MultiSelectControl.ts`) — the same component that already backs task tags, assignees and dependencies. Its popover stays open across several picks, so tagging a project two colors doesn't mean reopening the picker twice. Its options list is vault-wide: the five palette colors plus every custom `dotpm/*` tag currently applied to *any* project, not just this one — so a custom tag created on one project is pickable, not just retypeable, from every other project's picker.
- **Dashboard views driven by tags.** "Active" is the unfiltered master view — every project shows there regardless of tags. Each tag in use adds its own extra, overlapping view (e.g. a "Blue" tab) a project *also* appears under once tagged; tabs only exist once at least one project uses that tag. A project can carry several tags and show up in Active plus every matching tag view at once — nothing is exclusive.
- Tree handling: a tagged project nested under an untagged (or differently tagged) parent still surfaces correctly in that tag's view — either nested under the nearest ancestor that also matches, or promoted to its own row if no ancestor does. No project silently disappears.

### Explicitly out of scope / decided against

- No project-level "archived" or "hidden" concept of any kind — fully removed after being explored and rejected mid-session. Grep `hidden` in `src/views/ProjectListRenderer.ts` finds nothing project-related; the only remaining `hidden` in the codebase is `ProjectEditView.ts`'s unrelated hidden-custom-fields toggle.
- Tags never change a project's tab membership relative to *other* tags or to Active — adding a color never removes it from anywhere else.
- No changes to the task-level archive feature at all (`ArchiveOps.ts`, `AutoArchiver.ts`, the "Archive completed tasks" command, the per-project `autoArchiveDays` setting) — confirmed by hand-testing it during this session, kept entirely separate.

### Files touched

- `packages/core/src/types.ts` — `Project.tags`, `ProjectPatch`
- `packages/core/src/utils.ts` — `PROJECT_TAG_PALETTE`, `projectTagColor`, `sanitizeTagSegment`
- `packages/core/src/store/YamlHydrator.ts` / `packages/core/src/store/YamlSerializer.ts` — `tags:` frontmatter round-trip
- `src/store/VaultIndex.ts` — `ProjectRef.tags`, read cheaply without loading the full project
- `src/api/LocalApi.ts` — `ProjectRef.tags` plumbed through `refOf()` (not yet exposed on the public API/CLI/MCP surface — `ProjectResource` has no `tags` field yet, so `list_projects` etc. don't filter or show it)
- `packages/ui/src/composites/ProjectRow.ts` — exposes `tagsEl` for the caller to wire a picker into
- `src/views/ProjectListRenderer.ts` — the tab logic (`tabMatches`, `tabRoots`, `childrenFor`), the tag picker wiring, the toolbar's dynamic tab chips
- `manifest.json` — unrelated housekeeping bundled into the same commit: renamed to "dotpm (Local)" with "dotpm, Alfonso R. Reyes" as author, for local-build installs

### Verified

`tsc --noEmit`, `oxlint`, and `vitest run` (594 tests) all clean. Manually verified in a live vault (`/home/msfz751/obsidian/Daily`): tagging a project keeps it in Active and adds it to the new tag's view; multiple tags produce multiple overlapping views with correct counts; the picker's popover stays open across picks; a typed custom tag comes out sanitized.

### Bugs found and fixed post-landing

- **Custom tag options were scoped to the wrong project.** Reported as "renaming a tag in Obsidian didn't get picked up by the plugin" — reproduced with screenshots showing a project's picker offering only the five palette colors, never a custom tag (`linux-server`, `obsidian`) already applied to a *different* project. Investigated as a possible `VaultIndex`/metadata-cache staleness bug first (it wasn't: both the incremental listener and a full reload read unconditionally through Obsidian's own `metadataCache.getFileCache()`, with no self-write gating on that path at all — `ProjectStore`'s `selfWrites` map is a separate mechanism the Dashboard doesn't consult). The actual cause: `wireProjectTags`'s `options()` built its "custom tags" list from the row's *own* `ref.tags` only. Fixed by sourcing it from `tagsInUse(ctx)` (already computed for the tab bar) instead, so every picker now offers every custom tag used anywhere in the vault. Once this landed, renaming a tag (in Obsidian or via the picker) correctly renamed the tab and every project's chip immediately — confirming there was never an actual caching bug, just a missing cross-project view.

### Known gaps / not done

- The Local API / CLI / MCP layer doesn't expose `tags` on `ProjectResource` or filter by it — `dotpm project`, `list_projects`, `GET /v1/projects` all still ignore project tags entirely.
- No automated test locks in the tab-membership logic itself (`ProjectListRenderer.ts` has no test file, matching this codebase's existing convention of not unit-testing view-layer DOM code) — only manually verified.
- A leftover `hidden: true` key from the earlier, abandoned approach may still exist on project notes that were toggled during testing before the rip-out; it's inert (never read or written by the plugin anymore) but not swept from existing vault files automatically.
