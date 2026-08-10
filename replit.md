# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

This project hosts **Chat Writer** — a minimal three-column writing app:
- **Left column**: chat with a Mistral agent
- **Middle column**: a Word-style document editor
- **Right column**: placeholder for future tools

Access is gated by a single shared password.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (not used by Chat Writer)
- **Frontend**: React + Vite + Tailwind v4
- **AI provider**: Mistral Conversations API (`/v1/conversations`)

## Artifacts

- `artifacts/chat-app` — React + Vite frontend served at `/`
- `artifacts/api-server` — Express backend served at `/api`
- `artifacts/mockup-sandbox` — design canvas (not used by Chat Writer)

## Backend routes

- `POST /api/login` — body `{ password }`. Sets a signed httpOnly cookie on success.
- `POST /api/logout` — clears the auth cookie.
- `GET  /api/me` — returns `{ authenticated: boolean }`.
- `POST /api/chat` — requires auth cookie. Body `{ messages: [{role, content}] }`. Calls Mistral and returns `{ reply }`.

## Required secrets

- `APP_PASSWORD` — shared password for the login screen
- `MISTRAL_API_KEY` — Mistral API key
- `MISTRAL_AGENT_ID` — ID of the Mistral agent to chat with
- `SESSION_SECRET` — used to sign the auth cookie (provided by the platform)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
