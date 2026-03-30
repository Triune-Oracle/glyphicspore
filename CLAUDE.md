# CLAUDE.md

## Purpose
GlyphicSpore v1+ — Neo4j graph visualization layer for TriumvirateSwarm

## Stack
Node.js, TypeScript

## Structure
- `src/`: Core logic and components

## Conventions
- Follow standard coding patterns for the identified stack.
- Maintain consistent naming (camelCase for JS/TS, snake_case for Python).
- Use functional components and hooks for React/Next.js projects.

## Testing
- Check for existing test suites in `tests/` or `__tests__/`.
- Run `npm test` or `pytest` as applicable.

## MCP Connections
- External services: Supabase, Vercel, GitHub (inferred from common patterns).

## Protected
- DO NOT MODIFY: `.env`, `prisma/migrations`, `PM2` configs, `Stripe` webhook configs, `*.key`, `*.pem`.

## TSCP Protocol
- Log significant changes to `partyline_entries` table in Supabase project `sipaqppmhsshycmbgllq`.
- Escalate to seansouthwick77@yahoo.com for:
  - `.env` modifications
  - Database migrations
  - Dependency major version upgrades
  - PM2 service restarts
