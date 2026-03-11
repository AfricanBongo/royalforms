# Resend Contact & Segment Sync -- Design

## Goal

Keep Resend contacts and segments in sync with the application's groups and user lifecycle. This enables broadcast/campaign emails from the Resend dashboard using segments that mirror the app's group structure.

## Architecture

Database triggers fire `pg_net.http_post()` calls to a single Edge Function (`sync-resend-contacts`) whenever relevant changes occur in the `groups` or `profiles` tables. The Edge Function uses the Resend JS SDK (`npm:resend`) to manage contacts and segments. Failed calls are stored in a `resend_sync_queue` table for retry.

```
Database (source of truth)
    |
    +-- groups INSERT        --> pg_net --> sync-resend-contacts
    +-- profiles UPDATE      --> pg_net --> sync-resend-contacts
    |   (invite_status, is_active, group_id changes)
    +-- profiles DELETE      --> pg_net --> sync-resend-contacts
    
sync-resend-contacts Edge Function
    |
    +-- resend.segments.create()
    +-- resend.contacts.create() + contacts.segments.add()
    +-- resend.contacts.segments.remove() + contacts.segments.add()
    +-- resend.contacts.remove()

Failed calls --> resend_sync_queue table --> retry (scheduled/manual)
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where does Resend SDK run? | Edge Functions (backend) | API key is a secret; same pattern as Shlink, auth admin |
| How are syncs triggered? | Database triggers via pg_net | Decoupled from application logic; automatic; same pattern as on-instance-created |
| Failure handling | Retry queue table (`resend_sync_queue`) | Durable; allows manual or scheduled retries |
| Segment ID storage | `resend_segment_id` column on `groups` | Clean, queryable, no extra joins |
| General segment | Env var `RESEND_GENERAL_SEGMENT_ID` | Created once; avoids schema complexity |
| General segment membership | Active onboarded users only | `is_active = true` AND `invite_status = 'completed'` |

## Schema Changes

### 1. `groups` table -- add column

```sql
ALTER TABLE groups ADD COLUMN resend_segment_id TEXT;
```

Populated by the Edge Function after `resend.segments.create()` succeeds. NULL until synced.

### 2. New `resend_sync_queue` table

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| action | TEXT NOT NULL | create_segment, create_contact, delete_contact, move_contact, deactivate_contact, reactivate_contact |
| payload | JSONB NOT NULL | All data needed to retry the Resend call |
| status | TEXT NOT NULL DEFAULT 'pending' | pending, completed, failed |
| attempts | INT NOT NULL DEFAULT 0 | Retry counter |
| last_error | TEXT | Error message from last attempt |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| updated_at | TIMESTAMPTZ DEFAULT now() | Auto-updated via trigger |

RLS: Root Admin only (select, update). No public access.

## Edge Function: `sync-resend-contacts`

Single Edge Function receiving a JSON payload with an `action` field from pg_net triggers.

### Actions

| Action | Trigger Condition | Resend SDK Calls |
|---|---|---|
| `create_segment` | groups INSERT | `resend.segments.create({ name })` then UPDATE `groups.resend_segment_id` |
| `create_contact` | profiles UPDATE: `invite_status` changes to `completed` AND `is_active = true` | `resend.contacts.create({ email, firstName, lastName })` then `contacts.segments.add()` to group segment + general segment |
| `delete_contact` | profiles DELETE (cascade from auth.users deletion) | `resend.contacts.remove({ email })` |
| `deactivate_contact` | profiles UPDATE: `is_active` changes to `false` | `contacts.segments.remove()` from group segment + general segment |
| `reactivate_contact` | profiles UPDATE: `is_active` changes to `true` | `contacts.segments.add()` to group segment + general segment |
| `move_contact` | profiles UPDATE: `group_id` changes (active + onboarded user) | `contacts.segments.remove()` from old group segment then `contacts.segments.add()` to new group segment |

### Failure Handling

If any Resend SDK call fails:
1. Insert a row into `resend_sync_queue` with action + payload + error message
2. Return a 200 to pg_net (to avoid retries from pg_net itself)
3. The queue can be processed later via manual trigger or scheduled function

### Authentication

The Edge Function uses `RESEND_API_KEY` (env var) for Resend SDK calls and `SB_SECRET_KEY` for writing back to the database (updating `groups.resend_segment_id`, inserting into `resend_sync_queue`). No user auth verification needed since triggers originate from the database, not from HTTP clients.

However, the function still validates that the request comes from pg_net by checking for an internal authorization header/secret to prevent external abuse.

## Database Triggers

### 1. `on_group_created_sync_resend`

```
AFTER INSERT ON groups
FOR EACH ROW
EXECUTE pg_net.http_post() with action: 'create_segment'
Payload: { group_id, group_name }
```

### 2. `on_profile_updated_sync_resend`

```
AFTER UPDATE ON profiles
FOR EACH ROW
WHEN conditions:
  - invite_status changed to 'completed' AND is_active = true --> action: 'create_contact'
  - is_active changed true -> false --> action: 'deactivate_contact'
  - is_active changed false -> true --> action: 'reactivate_contact'
  - group_id changed AND is_active = true AND invite_status = 'completed' --> action: 'move_contact'
Payload includes: email, first_name, last_name, group_id, old values as needed
```

### 3. `on_profile_deleted_sync_resend`

```
BEFORE DELETE ON profiles
FOR EACH ROW
EXECUTE pg_net.http_post() with action: 'delete_contact'
Payload: { email }
```

## Environment Variables

Added to Edge Function `.env` (local) and Supabase dashboard (remote):

- `RESEND_API_KEY` -- Resend API key
- `RESEND_GENERAL_SEGMENT_ID` -- ID of the "General" segment (created once via dashboard or bootstrap script)

Track these in `supabase-changes.local`.

## What This Does NOT Cover

- **Sending transactional emails** -- that's the `send-notification-email` Edge Function (separate TODO item)
- **Broadcast/campaign emails** -- sent from Resend dashboard using the segments we create here
- **Initial data sync** -- existing users/groups need a one-time migration script to backfill into Resend
- **Group rename sync** -- if a group is renamed, the Resend segment name is not updated (Resend segments are identified by ID, not name; cosmetic only)
- **Group deactivation** -- deactivating a group does not delete the Resend segment (contacts remain; they just won't receive new members)
