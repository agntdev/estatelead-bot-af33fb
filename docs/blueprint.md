# Real Estate Lead Bot — Bot specification

**Archetype:** crm

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A compact Telegram bot for a single-agent real-estate business that captures leads (name, phone, intent, short note), shows a confirmation screen before saving, notifies the owner by Telegram when a lead is submitted, and provides an owner-only lead inbox where leads can be marked New or Done.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- prospective buyers
- prospective renters
- prospective sellers
- real estate agent

## Success criteria

- Lead submission form completes with confirmation step
- Agent receives instant Telegram notification with lead details and quick-action button
- Owner can view, update, and delete leads in private inbox

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **Submit a lead** (button, actor: user, callback: lead:start) — Begin the lead submission form flow
  - inputs: name, phone, intent, note
  - outputs: lead summary screen
- **/admin** (command, actor: admin, command: /admin) — Open the owner's private lead inbox
  - inputs: Telegram ID authentication
  - outputs: paginated lead list

## Flows

### Public lead submission
_Trigger:_ /start or 'Submit a lead' button

1. Welcome screen with 'Submit a lead' button
2. Name input
3. Phone input
4. Intent selection
5. Note input
6. Lead summary with confirmation/edit options
7. Lead submission confirmation

_Data touched:_ Lead

### Owner inbox management
_Trigger:_ /admin command

1. Authentication check
2. Paginated lead list display
3. Lead detail view
4. Status update (New/Done)
5. Lead deletion

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram ID of the agent who receives lead notifications and manages the inbox
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — A potential client interaction record
  - fields: id, name, phone, intent, note, status, created_at

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View all leads
- Mark leads as New/Done
- Delete leads
- Receive notifications with quick-action buttons

## Notifications

- Instant lead submission notification to agent with quick-action button to view lead
- Status change confirmation when owner marks a lead as New/Done

## Permissions & privacy

- Only the agent can access the private lead inbox
- Leads are stored securely with no public access
- Phone numbers are collected with user consent

## Edge cases

- User skips optional note field
- Agent tries to access inbox without proper authentication
- Lead submission with invalid phone format

## Required tests

- End-to-end lead submission flow with confirmation step
- Owner inbox pagination and status update functionality
- Notification quick-action button opens correct lead in inbox

## Assumptions

- Single admin model with no team features
- Intent options cover typical real-estate scenarios
- Phone capture accepts both typed input and Telegram contact button
