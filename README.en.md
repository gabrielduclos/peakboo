# PeakBoo

[Português](README.md)

**Conversations become plans.** Open source messenger with a shared calendar for every conversation. React, Tailwind CSS, Radix components following shadcn/ui conventions, Node/Express, Better Auth, and PostgreSQL on Neon. MIT licensed.

## First version

- Invitation-only private groups, text messages, and reactions.
- Messages and calendar changes use SSE, without periodic database polling. The connection pauses in hidden tabs and reconnects with exponential backoff.
- Shared room calendars and an overall calendar with month, week, and list views; conversation filters.
- Create, edit, and cancel events; RSVP with Going, Maybe, or Not going. New events also appear in chat.
- Export individual events as `.ics` files.
- Light/dark themes, Portuguese/English, responsive layout, and tabbed settings dialogs.
- Better Auth with a minimum password length of eight characters, show/hide controls, name editing, password changes, and session revocation on sign-out.
- The main application requires real authentication and has no demo mode. The portfolio presentation is compiled separately into `dist-portfolio`, with browser-local sample data and no real sign-in.

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

Cloudflare Workers frontend (Worker `main`, build `npm run build`, deploy `npx wrangler deploy`): [Peakboo](https://main.peakboo.workers.dev). Render API: `https://peakboo-api.onrender.com`. Include `https://main.peakboo.workers.dev` in `FRONTEND_ORIGINS`. The API URL is selected automatically for that hostname and can be overridden with `VITE_API_URL` at build time. The private review deployment at `peakboo-agenda.gabriel-axel.chatgpt.site` uses the same API. Invitations point to the public application; participants must sign in to access conversations.

API: Render Free, build `npm ci --include=dev && npm run build`, start `npm start`. The API also serves the compiled frontend for same-origin hosting. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET` (random, at least 32 characters), `BETTER_AUTH_URL` (external service URL), and `FRONTEND_ORIGINS` (comma-separated). Credentials stay on the server.

Independent frontend: Cloudflare Worker with Static Assets using `wrangler.jsonc`. Build with `VITE_API_URL` set to the actual Render API origin, and add the frontend origin to `FRONTEND_ORIGINS`. Connect the repository to Workers Builds for automatic build and deployment. Separately hosted frontends use the official Better Auth Bearer plugin; tokens remain in the tab’s `sessionStorage`.

The default build produces two interfaces: `dist` contains only the real Cloudflare application; `dist-portfolio` contains only the portfolio demo served on Render. Run `npm run build:app` or `npm run build:portfolio` to build them separately. The portfolio ignores real sessions and never calls the API. Render `/api` routes remain available to the real application on Cloudflare.

## Architecture and current limits

Domain tables are `rooms`, `members`, `messages`, `events`, `rsvps`, and `reactions`. All conversation operations check membership on the server. Only event creators can edit or cancel their events. Invitations are room access secrets; share them only with intended participants.

The SSE distributor is in memory and supports one API instance. Add cross-instance event distribution before horizontal scaling. The PostgreSQL pool is capped at five connections. No scheduled keep-alive prevents Render from sleeping.

This version covers text, reactions, and single-day events. Attachments, calls, recurring events, push notifications, email recovery, two-way Google Calendar sync, and end-to-end encryption are not implemented. `.ics` export is not continuous synchronization.

## Visual identity

Turquoise and blue define the visual identity. The text-only PeakBoo wordmark uses turquoise for Peak and blue for Boo. Supporting colors identify plans and conversations. Reading surfaces are neutral; message text is 16 px. Both themes are centralized in `src/styles.css`. Fill colors and text colors are separate to retain contrast.

### Photos and attachments

Profile photos: Settings → Profile → Change photo. Conversation owners click the header image to update their conversation photo. The **+** menu adapts the MIT-licensed [Uorqui main composer](https://github.com/gabrielduclos/uorqui/tree/58e5c199cbf0731bdafaa95ed4bff959ddb559e3): gallery, camera (photo/video), files, location, voice recording, previews and photo editor. Compatible photos/videos are optimized locally; sending as a file preserves original bytes.

Limits: **10 MB per file**, **1 MB per avatar**, **100 MB per account**. Additive migration `002_media.sql` stores binary media in PostgreSQL, independent of Render's temporary disk. Downloads require authentication and conversation membership. Only owners can change conversation photos. Portfolio files stay in browser IndexedDB without API uploads. Camera, microphone and location require browser support and permission.

### Cache, loading and message actions

Profile and chat media use a session/account-scoped RAM cache with request deduplication, five-minute revalidation and logout invalidation. Target budget: 64 MB/160 entries; visible media are retained. Skeletons reserve the uploaded aspect ratio; older media without dimensions use a fixed 4:3 frame. The interface uses Photo, Video, Audio or Document labels; downloads keep original filenames.

Date filtering adapts Uorqui's local-calendar rules and combines text, media type and pinned filters. Server-side search paginates across history beyond the visible page. Message actions adapt reply, copy, forward, pin/unpin, edit text, cancel and report; edits and cancellation require authorship. Additive migration `003_message_actions.sql` stores dimensions and message states. The demo keeps changes in the browser.

### Chat experience

The magnifier expands/collapses search; period filters open on each day divider. Bubble actions use an anchored menu (also available on right-click), with copy, edit and cancellation according to authorship. The circular send target measures 50 px.

Text, voice and attachments appear optimistically, retaining a retryable state and the same message ID on failure. Opening a conversation scrolls to the latest message; reading older history preserves position and shows a jump-to-latest control with an incoming-message count. The voice player includes a waveform, seeking and 1×/1.5×/2× speeds; waveform decoding depends on browser support. Photo thumbnails open a gallery of images loaded in the conversation, with wheel, pinch and button zoom, panning and keyboard navigation.

The voice button shares the send circle. Search opens inside the header; reactions offer 24 options in a viewport-constrained menu. Pinned messages appear in a top strip, fetched independently of the current history page. Images, video and audio no longer display size or download links below the bubble; photo downloads remain available in the gallery.

Both builds embed initial CSS inside HTML so a stylesheet loading failure or stale asset reference cannot leave the page unstyled. CSS files remain available for compatibility; Cloudflare HTML requires revalidation. The build verifies embedded styles automatically.


On mobile, the header shows the PeakBoo brand and settings remain in the bottom navigation. Swipe a message right to reply; vertical scrolling, pinch zoom and media controls remain independent. The creator can open the group photo and choose **Delete group**. Confirmation explains that deletion is permanent for everyone and removes messages, attachments and events. `DELETE /api/rooms/:room` enforces ownership on the server, deletes atomically and notifies participants through SSE. No additional migration is required; existing relationships remove dependent data.

### Private groups and profiles

Peakboo focuses on private groups, including two-person groups. Create a group or join with an invitation link/code. Navigation has no contacts, individual conversations or public group discovery. Invitations can be copied or shown as locally generated QR codes; `VITE_APP_URL` controls the canonical app origin (default: https://main.peakboo.workers.dev).

Settings → Profile allows editing the name, @username, bio, avatar and cover. Public profiles are accessible by link without exposing private group data. The API verifies group membership before serving messages and attachments. The portfolio demo remains isolated from the real API.

Legacy contact and direct conversation data remains stored but is not listed or accessible through group endpoints. No data deletion or destructive migration is introduced.

### Tokens, history privacy and in-app notifications

The token is the same secret used by the invitation link; copy it separately and enter it in **Join with token**. Existing links and QR codes stay valid. The server restricts messages, previews, searches, reply references, actions and attachments to each member's join time. Reusing a token does not reset that time.

The calendar stays shared. New events, changes and cancellations by other participants are recorded on the server and refreshed through SSE. Badges show unread messages and calendar notices; the in-app center includes 60- and 15-minute reminders. Calendar notice read state is stored per account in this browser, and reminders are computed locally while the app is open or on return. No push, email or additional periodic database queries are used.
