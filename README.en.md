# Peakboo

[Português](README.md)

**Conversations become plans.** Open source messenger with a shared calendar for every conversation. React, Tailwind CSS, Radix components following shadcn/ui conventions, Node/Express, Better Auth, and PostgreSQL on Neon. MIT licensed.

## First version

- Invitation-based private conversations, text messages, and reactions.
- Messages and calendar changes use SSE, without periodic database polling. The connection pauses in hidden tabs and reconnects with exponential backoff.
- Shared room calendars and an overall calendar with month, week, and list views; conversation filters.
- Create, edit, and cancel events; RSVP with Going, Maybe, or Not going. New events also appear in chat.
- Export individual events as `.ics` files.
- Light/dark themes, Portuguese/English, responsive layout, and tabbed settings dialogs.
- Better Auth with a minimum password length of eight characters, show/hide controls, name editing, password changes, and session revocation on sign-out.
- Separate demo with sample data stored only in the browser. Samples never enter real accounts.

## Development

Requires Node 22+ and PostgreSQL (local or Neon).

```sh
npm ci
cp .env.example .env
```

Fill in the variables, then run in separate terminals:

```sh
node --env-file=.env server/index.mjs
npm run dev
```

Vite proxies `/api` to `localhost:3001`. At startup, the server applies Better Auth migrations and the versioned domain migration. Domain migrations are serialized using a transaction advisory lock. Never commit credential values.

```sh
npm test
npm run test:integration
npm run build
```

Integration tests start disposable PostgreSQL and three fictional accounts. They cover invitations, account isolation, idempotent messages, SSE, RSVP, events, paging, reactions, and revoked sessions. They never access production Neon.

## Deployment

API: Render Free, build `npm ci --include=dev && npm run build`, start `npm start`. The API also serves the compiled frontend for same-origin hosting. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET` (random, at least 32 characters), `BETTER_AUTH_URL` (external service URL), and `FRONTEND_ORIGINS` (comma-separated). Credentials stay on the server.

Independent frontend: Cloudflare Worker with Static Assets using `wrangler.jsonc`. Build with `VITE_API_URL` set to the actual Render API origin, and add the frontend origin to `FRONTEND_ORIGINS`. Connect the repository to Workers Builds for automatic build and deployment. Separately hosted frontends use the official Better Auth Bearer plugin; tokens remain in the tab’s `sessionStorage`.

`VITE_PREVIEW_ONLY=true npm run build` produces a demo review build that explains that registration and invitations have not been activated. It contains no credentials and does not connect sample records to the API. `.openai/hosting.json` identifies the private review preview.

## Architecture and current limits

Domain tables are `rooms`, `members`, `messages`, `events`, `rsvps`, and `reactions`. All conversation operations check membership on the server. Only event creators can edit or cancel their events. Invitations are room access secrets; share them only with intended participants.

The SSE distributor is in memory and supports one API instance. Add cross-instance event distribution before horizontal scaling. The PostgreSQL pool is capped at five connections. No scheduled keep-alive prevents Render from sleeping.

This version covers text, reactions, and single-day events. Attachments, calls, recurring events, push notifications, email recovery, two-way Google Calendar sync, and end-to-end encryption are not implemented. `.ics` export is not continuous synchronization.

## Visual identity

Violet is the primary color. Coral, green, blue, and yellow identify plans and conversations. Reading surfaces are neutral; message text is 16 px. Both themes are centralized in `src/styles.css`. Fill colors and text colors are separate to retain contrast.
