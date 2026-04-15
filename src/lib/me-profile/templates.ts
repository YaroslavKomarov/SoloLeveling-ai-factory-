/**
 * Markdown templates for @me profile notes.
 * Sparse stubs — section headers only. The onboarding agent fills
 * them in conversationally via the save_profile_section tool.
 *
 * Files created during onboarding:
 *   @me/profile.md   — who you are, life context
 *   @me/projects.md  — active projects and priorities
 *   @me/schedule.md  — life rhythm, working hours
 *   @me/periodic.md  — periodic events, important dates
 *   @me/patterns.md  — read-only, maintained by retrospective system
 */

export function generateProfileMd(): string {
  return `---
type: profile
created_at: ${new Date().toISOString()}
---

# Profile

## Who I Am

## Life Context

## Values & Priorities
`
}

export function generateProjectsMd(): string {
  return `---
type: projects
created_at: ${new Date().toISOString()}
---

# Projects

## Active Projects

## On Hold

## Completed Recently
`
}

export function generateScheduleMd(): string {
  return `---
type: schedule
created_at: ${new Date().toISOString()}
---

# Schedule

## Working Hours

## Energy Peaks

## Life Rhythm
`
}

export function generatePeriodicMd(): string {
  return `---
type: periodic
created_at: ${new Date().toISOString()}
---

# Periodic Events

## Weekly Routines

## Monthly Events

## Important Dates
`
}

export function generatePatternsMd(): string {
  return `---
type: patterns
is_readonly: true
created_at: ${new Date().toISOString()}
---

# Patterns

> This file is automatically maintained by the retrospective system.
> Do not edit manually.

## Fatigue Patterns

<!-- Populated by retrospective analyzer -->

## Productivity Patterns

<!-- Populated by retrospective analyzer -->

## Task Completion Patterns

<!-- Populated by retrospective analyzer -->
`
}
