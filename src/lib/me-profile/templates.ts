/**
 * Markdown templates for @me profile notes.
 * These are created once during onboarding and can be edited by the user later.
 */

export interface ProfileTemplateData {
  name: string
  timezone: string
  activityWindow: string
}

export function generateProfileMd(data: ProfileTemplateData): string {
  return `---
name: ${data.name}
timezone: ${data.timezone}
activity_window: ${data.activityWindow}
created_at: ${new Date().toISOString()}
---

# Profile

Name: ${data.name}
Timezone: ${data.timezone}
Activity Window: ${data.activityWindow}

## About Me

<!-- Describe yourself here -->
`
}

export function generateCareerMd(): string {
  return `---
type: career
created_at: ${new Date().toISOString()}
---

# Career

## Current Role

<!-- Your current position, company, years of experience -->

## Goals

<!-- Career objectives for the next 1-3 years -->

## Skills

<!-- Technical and professional skills -->
`
}

export function generateSkillsMd(): string {
  return `---
type: skills
created_at: ${new Date().toISOString()}
---

# Skills

## Technical Skills

<!-- Programming languages, frameworks, tools -->

## Soft Skills

<!-- Communication, leadership, problem-solving -->

## Learning

<!-- Skills you are currently developing -->
`
}

export function generateInterestsMd(): string {
  return `---
type: interests
created_at: ${new Date().toISOString()}
---

# Interests

## Professional Interests

<!-- Topics that excite you professionally -->

## Personal Interests

<!-- Hobbies, activities, passions -->

## Curiosities

<!-- Things you want to explore in the future -->
`
}

export function generatePersonalityMd(): string {
  return `---
type: personality
created_at: ${new Date().toISOString()}
---

# Personality

## Strengths

<!-- Your key strengths -->

## Growth Areas

<!-- Areas you are actively improving -->

## Work Style

<!-- How you prefer to work (deep work, sprints, etc.) -->

## Motivators

<!-- What drives your best performance -->
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
