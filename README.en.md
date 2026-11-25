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

Independent frontend: Cloudflare Worker with Static Assets using `wrangler.jsonc`. Build with `VITE_API_URL` set to the actual Render API origin, and add the frontend origin to `FRONTEND_ORIGINS`. Connect the repository to Workers Builds for automatic build and deployment. Separately hosted frontends use the official Better Auth Bearer plugin; tokens are persisted in origin-scoped `localStorage` to survive PWA restarts, cleared on sign-out or confirmed invalid sessions, and retain the server's seven-day expiry (renewable after one day). Tokens are accessible to JavaScript, so XSS protection is essential.

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

Settings → Profile allows editing the name, bio, avatar and cover. There are no usernames or public profiles; old links do not expose data. The API verifies group membership before serving messages and attachments. The portfolio demo remains isolated from the real API.

Legacy contact and direct conversation data remains stored but is not listed or accessible through group endpoints. No data deletion or destructive migration is introduced.

### Tokens, history privacy and in-app notifications

The token is the same secret used by the invitation link; copy it separately and enter it in **Join with token**. Existing links and QR codes stay valid. The server restricts messages, previews, searches, reply references, actions and attachments to each member's join time. Reusing a token does not reset that time.

The calendar stays shared. New events, changes and cancellations by other participants are recorded on the server and refreshed through SSE. Badges show unread messages and calendar notices; the in-app center includes 60- and 15-minute reminders. Calendar notice read state is stored per account in this browser, and reminders are computed locally while the app is open or on return. No push, email or additional periodic database queries are used.

Reactions use optimistic updates and idempotent confirmation. SSE delivers reaction changes to authorized members without refreshing the calendar; other changes are batched and synchronized on reconnect. SSE fan-out uses the single Render instance.

### Private R2 storage

Create a dedicated private bucket (e.g. `peakboo-media`) and an S3 Object Read & Write token scoped to that bucket. Set `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` on Render only. Never expose secrets to the frontend. Without configuration, uploads remain in Neon; with full configuration, new uploads go to R2 and Neon stores metadata. R2 failures do not silently fall back to database writes. API authorization is unchanged. Run `npm run media:migrate-r2 -- 100` in the backend environment to copy batches of up to 100 existing objects and verify each with SHA-256. Original bytes are preserved at this stage; later removal requires separate verification and backup. A durable deletion queue is processed on group deletion, API startup, and maintenance. Keep public bucket access disabled.

### PWA and Web Push

Install Peakboo from your browser (on iOS, Safari → Add to Home Screen), open Settings → Notifications and enable this device. The API sends Web Push with VAPID and RFC 8291 encryption; SSE remains active while the app is open. Previews default to off, groups can be muted, and subscriptions are tied to the authenticated session. Set `PUSH_ENABLED=true` on Render. The VAPID pair remains stable while `PUSH_VAPID_PRIVATE_KEY` (or the Better Auth secret used for HKDF derivation) stays unchanged. Resubscribe devices after rotation. A five-minute Cloudflare Cron keeps the free API available; the API schedules the next pending reminder and recalculates after changes instead of polling when no reminders are due. External delivery depends on Render and push services, without a guarantee of immediate delivery. The service worker does not cache private API responses.

When opening Peakboo in a browser, the installation invitation appears at most once per local calendar day if installation is not detected. Android and desktop use the native installation prompt when available; otherwise mobile devices receive instructions. The push invitation appears after sign-in, without overlapping the install invitation, on supported devices that are not subscribed. Blocked permissions can be changed in browser settings.

### Group previews and reactions

The group list shows the sender, text or media type of the latest message. If someone reacts more recently to your message, the preview shows that reaction. Received reactions also appear in the in-app notification center (up to 100 active reactions from the last 30 days), with read state scoped to the account in this browser; removing or replacing a reaction updates the activity. Muted groups do not generate internal reaction notices or push, but retain their previews. Migration 009 preserves older reactions without generating historical notifications.

### Modular UI organization

Shared presentation components live in `src/features/<domain>/`. The group list (`groups/GroupsPanel.tsx`) and calendar views (`calendar/CalendarViews.tsx`) and the chat panel (`chat/ChatPanel.tsx`) receive data and callbacks through props. Production and portfolio retain independent data sources and operations; shared components do not import the API or demo storage. New extractions should preserve behavior and include regression tests.

Shared account dialogs (`account/AccountDialogs.tsx`) receive authentication and password-change callbacks and profile and notification content from the owning app. Presentation does not decide session validity or directly access the API; the portfolio retains its restrictions and isolated data.

Styles live in `src/styles/`, imported in explicit order from `src/styles.css`: foundation and tokens, layout, groups, chat, calendar, dialogs, loading states, responsive and feature-specific rules. The initial split preserves existing rules and cascade exactly; consolidating overrides requires separate visual validation. Both builds retain CSS embedded in HTML.
