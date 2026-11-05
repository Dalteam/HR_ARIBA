# legacy/employee-web — the retired web copy of the employee app

**This folder is not part of the application.** Nothing under `src/app` imports it, Next.js never routes it (only
`src/app/**` is routed), and no screen links to it. It is here so the work is readable in the repository instead
of only in git history.

## What it was

Stage 1 of the design port built the employee's screens twice: once as `/me` pages inside `hr-web` (this folder),
and once as the Expo app in `frontend/employee-app`. The Expo app is the one that shipped — it is what
`ACCEPTANCE_CHECKS.md` walks at `localhost:8081` — so on 5 Nov 2026 the web copy was retired:

| Was | Now |
|---|---|
| `src/app/(employee)/layout.tsx` | `pages/layout.tsx` here |
| `src/app/(employee)/me/login/page.tsx` | `pages/me/login/page.tsx` here (the employee sign-in screen) |
| `src/app/(employee)/me/(app)/*` | `pages/me/*` here (home, attendance, leaves, salary, profile, team, documents, overtime, approvals, error, loading) |
| `src/components/me/{me-shell,use-photo}` | `components/me/` here |
| `src/lib/{me,me-labels}.ts` | `lib/` here (`me.ts` is the `/me` API client, `me-labels.ts` the label maps) |
| `src/styles/employee.css` + `src/styles/employee/*.css` | `styles/` here (the V114 prototype's 15 sheets) |

What replaced it at `/me` is one card (`src/app/(hr)/me/page.tsx`) that tells an employee who signs in on the HR
portal where the app is. `EMP_LOGIN` (the old `/me/login`) is gone: there is a single sign-in screen, `/login`
(`src/lib/routes.ts`, `src/proxy.ts`, `src/lib/api.ts`, `src/lib/auth-context.tsx`).

## The one cost of keeping it

These files sit under `src/`, so `tsc --noEmit` and `eslint` still read them: if a module they import (`@/lib/api`,
`@/lib/auth`, `@/lib/employees`, `@/components/common/*`, …) changes shape, the build fails **here** first. Their
imports were rewritten to `@/legacy/employee-web/...` for exactly that reason, so a fix is local. If that ever
becomes noise, delete the folder — the code is in git under the tag `before-removing-employee-web` and in the
branch's history.

## Reviving it

1. Copy `pages/layout.tsx` back to `src/app/(employee)/layout.tsx` and `pages/me/*` to
   `src/app/(employee)/me/(app)/*` (`pages/me/login/page.tsx` to `src/app/(employee)/me/login/page.tsx`).
2. Copy `styles/` back to `src/styles/` and re-import `@/styles/employee.css` in that layout.
3. Copy `components/me/` and `lib/` back to `src/components/me/` and `src/lib/`, then undo the
   `@/legacy/employee-web/` prefixes in the imports.
4. Restore `EMP_LOGIN = "/me/login"` in `src/lib/routes.ts` and the two branches that read it
   (`src/proxy.ts`, `src/lib/api.ts`, `src/lib/auth-context.tsx`), and remove the `/me` card.

It was last known good at commit `905869b` (the Stage 20 screens) and on the tag `before-removing-employee-web`.
