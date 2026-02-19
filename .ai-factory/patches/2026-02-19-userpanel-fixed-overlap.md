# UserPanel fixed positioning overlaps scrollable content

**Date:** 2026-02-19
**Files:** src/components/layout/UserPanel.tsx, src/app/app/layout.tsx
**Severity:** medium

## Problem

UserPanel rendered with `position: fixed` stayed anchored at the top of the
viewport while page content scrolled underneath it, causing visual overlap.

## Root Cause

During the layout refactor (feat: center layout at 65% width) the UserPanel was
redesigned as a horizontal centered bar using `position: fixed`. The `<main>`
had a large `paddingTop` to push content below it. This created a z-index
overlap on scroll — the panel didn't move, content scrolled behind it.

## Solution

Removed `position: fixed`, `top`, `left`, `transform`, `zIndex` from UserPanel.
Changed `width: '65%'` to `width: '100%'` (panel now lives inside the 65%
centered container).

Moved `<UserPanel>` from outside `<main>` to inside the 65% content wrapper,
before `<PageTransition>`. Reduced `<main>` `paddingTop` to just
`var(--header-height)` since the panel now flows naturally in the document.

## Prevention

- When a component needs to visually align with content below it (same width,
  same center), prefer in-flow positioning over `position: fixed`
- Fixed positioning is appropriate for elements that must be visible during
  scroll (nav, modals, toasts) — not for contextual content panels

## Tags

`#layout` `#positioning` `#scroll` `#userpanel` `#fixed`
