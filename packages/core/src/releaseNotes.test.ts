import { describe, expect, it } from 'vitest'
import { compareVersions, parseChangelog, releaseNotesSince } from './releaseNotes'

const changelog = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Not released yet

## [2.10.0] - 2026-10-01

### Added

- Ten

## [2.3.1] - 2026-09-07

### Fixed

- One

## [2.3.0] - 2026-09-07

### Added

- Zero

## [1.0.0-beta] - 2026-03-30

Initial beta.
`

const versions = (releases: { version: string }[]): string[] => releases.map((release) => release.version)

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('2.10.0', '2.3.1')).toBe(1)
    expect(compareVersions('2.3.1', '2.10.0')).toBe(-1)
    expect(compareVersions('2.3.1', '2.3.1')).toBe(0)
  })

  it('sorts a prerelease before its release', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
  })
})

describe('parseChangelog', () => {
  it('reads every released section and skips the intro and unreleased changes', () => {
    const releases = parseChangelog(changelog)
    expect(versions(releases)).toEqual(['2.10.0', '2.3.1', '2.3.0', '1.0.0-beta'])
    expect(releases[0]).toEqual({ version: '2.10.0', date: '2026-10-01', body: '### Added\n\n- Ten' })
    expect(releases[3].body).toBe('Initial beta.')
  })

  it('reads a file with Windows line endings', () => {
    const releases = parseChangelog(changelog.replaceAll('\n', '\r\n'))
    expect(releases[1]).toEqual({ version: '2.3.1', date: '2026-09-07', body: '### Fixed\r\n\r\n- One' })
  })
})

describe('releaseNotesSince', () => {
  const releases = parseChangelog(changelog)

  it('returns every release after the last seen version up to the current one', () => {
    expect(versions(releaseNotesSince(releases, '2.10.0', '2.3.0'))).toEqual(['2.10.0', '2.3.1'])
  })

  it('leaves out releases newer than the current version', () => {
    expect(versions(releaseNotesSince(releases, '2.3.1', '1.0.0-beta'))).toEqual(['2.3.1', '2.3.0'])
  })

  it('returns only the current release when no version was seen before', () => {
    expect(versions(releaseNotesSince(releases, '2.3.1', ''))).toEqual(['2.3.1'])
  })

  it('returns nothing when the changelog has no entry for the update', () => {
    expect(releaseNotesSince(releases, '2.11.0', '2.10.0')).toEqual([])
    expect(releaseNotesSince(releases, '2.3.1', '2.3.1')).toEqual([])
  })
})
