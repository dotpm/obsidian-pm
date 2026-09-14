export interface Release {
  version: string
  date: string
  body: string
}

const RELEASE_HEADING = /^## \[([^\]]+)\](?: - (\S+))?/

function versionParts(version: string): { core: number[]; prerelease: string } {
  const dash = version.indexOf('-')
  const core = dash === -1 ? version : version.slice(0, dash)
  return {
    core: core.split('.').map((part) => Number(part) || 0),
    prerelease: dash === -1 ? '' : version.slice(dash + 1)
  }
}

/** Orders semantic versions; a prerelease sorts before the release it leads up to. */
export function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let i = 0; i < Math.max(leftParts.core.length, rightParts.core.length); i++) {
    const diff = (leftParts.core[i] ?? 0) - (rightParts.core[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  if (leftParts.prerelease === rightParts.prerelease) return 0
  if (!leftParts.prerelease) return 1
  if (!rightParts.prerelease) return -1
  return Math.sign(leftParts.prerelease.localeCompare(rightParts.prerelease, 'en', { numeric: true }))
}

/** The released sections of a Keep a Changelog file, in the order the file lists them. */
export function parseChangelog(markdown: string): Release[] {
  return markdown.split(/^(?=## )/m).flatMap((section) => {
    const newline = section.indexOf('\n')
    const heading = RELEASE_HEADING.exec(newline === -1 ? section : section.slice(0, newline))
    if (!heading || heading[1] === 'Unreleased') return []
    const body = newline === -1 ? '' : section.slice(newline + 1).trim()
    return [{ version: heading[1], date: heading[2] ?? '', body }]
  })
}

/** Releases after `since` up to and including `current`. With no `since`, only `current`. */
export function releaseNotesSince(releases: Release[], current: string, since: string): Release[] {
  return releases.filter((release) =>
    since
      ? compareVersions(release.version, since) > 0 && compareVersions(release.version, current) <= 0
      : compareVersions(release.version, current) === 0
  )
}
