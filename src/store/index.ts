export { archiveTask, collectArchivable, unarchiveTask, withoutBlockedDependents } from './ArchiveOps'
export type { ArchiveCandidate } from './ArchiveOps'
export { ProjectStore, TaskFileNameConflictError } from './ProjectStore'
export type { ImportNoteOptions, TaskSource } from './TaskSource'
export { ProjectScope, resolveScopePaths, scopeKey } from './ProjectScope'
export type { ScopeSpec } from './ProjectScope'
export { VaultIndex } from './VaultIndex'
export type { ProjectRef, TaskRef } from './VaultIndex'
export {
  createPersonLink,
  createPersonNote,
  matchPersonNotes,
  personCandidates,
  personKey,
  personKeyer,
  personLink,
  personNotes,
  resolvePeople,
  resolvePerson
} from './people'
export type { PersonCandidate, PersonLinkState, PersonMatch, PersonRef } from './people'
export {
  findIgnoringCase,
  folderOf,
  projectFilePath,
  projectFolderOf,
  projectPathForTaskPath,
  projectTaskFolder,
  TASK_FOLDER_NAME
} from './vaultFs'
