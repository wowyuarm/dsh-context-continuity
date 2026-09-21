# Integration guide — how a host adopts context continuity

This guide is for a **host** author: a plugin that wants a durable subject to
live one continuous context across many physical Sessions. The Agent Team is
one host (its subject is a Member); a single-Individual harness like Loom is
another (its subject is the Individual); a long-running coding agent is its own
single subject.

The engine owns the universal mechanics — the idle-boundary generation swap,
the admission gate, carried input, checkpoint continuations, the projection
fold, the lineage walk, and the shared return-anchor policy. It knows nothing
about what your subject is or what your domain treats as meaningful. You supply
exactly that, through the seams below.

## Status legend

| Mark | Meaning |
| --- | --- |
| **shipped** | Implemented and unit-tested in this package. |
| **planned** | Designed (see the Team-side `DESIGN.md`), not yet in this package. |

| Seam | Status |
| --- | --- |
| Subject identity | shipped |
| Message codec | shipped |
| Projection (`ContextProjectionHost` + fold unit) | shipped |
| Coordinator (`ContextContinuityHost`) | shipped |
| Tools factory (`createContinuityTools`) | planned |
| Search scope (`SearchScopeProvider`) | planned |

Everything a host reaches for is exported from the package root
(`@wowyuarm/dsh-context-continuity`).

## The one-paragraph model

A **subject** is a durable identity with, at any moment, one bound Session
generation. When context fills or the model asks, the subject *rolls over*:
the engine prepares a `TransitionPlan`, the host performs the swap in its own
lifecycle, and the subject continues in a fresh Session seeded by a handoff.
A **checkpoint** records a restorable anchor; a **timeline** walks the subject's
Session lineage (`parentSession` chain) as one continuous history; **search**
recalls across the sessions the host authorizes. Every durable fact lives in
the Session log; the engine derives, never stores a second copy.

## Seam 1 — subject identity (shipped)

Pick the id type your domain already has, and describe a subject as its id plus
the Session it is bound to right now.

```ts
import type { ContextSubject } from '@wowyuarm/dsh-context-continuity'

type SubjectId = AgentTeamMemberId          // Team
// type SubjectId = IndividualId            // Loom (one value, always the same)

// A subject the engine reads: nothing more than id + current sessionId.
const subject: ContextSubject<SubjectId> = { id, sessionId }
```

The engine reads nothing else off a subject. Roles, workspaces, memory paths,
team membership all stay on the host side.

## Seam 2 — message codec (shipped)

The codec writes and reads the durable handoff and checkpoint-continuation
messages, through the shipped `plugin` snapshot form. Construct it once.

```ts
import { ContextMessageCodec } from '@wowyuarm/dsh-context-continuity'

const codec = new ContextMessageCodec({
  pluginId: '@wowyuarm/dsh-agent-team',                              // your plugin's stable id
  handoffIntro: 'Context handoff: you are continuing as the same Team Member…',
  handoffVerifyNote: 'Your handoff follows. Verify external state before relying on it…',
})
```

Only `pluginId` and the two prose lines are yours. **Section names are fixed
by the engine** — a host that changed them could not decode its own history.

> **Durable identity — never change after first ship:** `pluginId` is written
> into every handoff/continuation message's `source.plugin` and matched on read.
> Change it and every past generation's messages become unreadable.

## Seam 3 — projection (shipped)

The projection folds one Session's continuity state from its log. The engine
owns the universal structure (checkpoints, pending rollover, continuation
delivery, carry candidates, open calls, turn cursors). You contribute only your
domain's ref naming and your timeline anchors, through `ContextProjectionHost`.

```ts
import { createContextProjectionDefinition, type ContextProjectionHost } from '@wowyuarm/dsh-context-continuity'

const projectionHost: ContextProjectionHost = {
  // Durable, collision-resistant refs. Two Sessions repeating one provider
  // call id MUST produce two distinct refs — key on the Session id.
  checkpointRefFor: (sessionId, toolCallId) => `${sessionId}:ckpt:${sha(toolCallId)}`,
  boundaryRefFor:   (sessionId, seq)        => `${sessionId}:b:${seq}`,

  // Which of YOUR effect calls may anchor a boundary on success. The engine
  // already tracks its own rollover/checkpoint calls; omit if you have none.
  tracksCall: (name) => name === 'team_message' || name === 'team_claim',

  // Your timeline anchor for one event, or undefined when it anchors nothing.
  // Team: a committed message / claim change / a Thread's FIRST arrival.
  // Loom: a committed Input / Effect / Delivery fact.
  domainBoundaryOf: (input) => {
    // input.seenTopics lets you decide what a *first* arrival is in your terms.
    if (/* input is a first thread arrival */ false) {
      return { kind: 'team_thread_arrival', label: 'First arrival: …', topics: [threadId] }
    }
    return undefined
  },

  isEphemeralNotice: (message) => /* your domain's transient notices */ false,
}
```

Register the fold with the Harness projection framework, which owns the drive
(replay, incremental application, persistence, invalidation):

```ts
import { createContextProjectionDefinition } from '@wowyuarm/dsh-context-continuity'

// Register ONCE for the whole host — not once per Session. The framework keeps
// one unit per projection key, and this engine's state carries the Session
// identity it folded.
ctx.sessionProjections.register(createContextProjectionDefinition({
  codec, host: projectionHost,
  // Fold a legacy tool alias too, if your history carries one:
  rolloverToolNames: ['context_rollover', 'new_context'],
}))
```

One registration serves every Session, seeded successors included. `init` reads
the header and records the Session id and its fork-inherited prefix length in
the state; `apply` skips events below that cut, returning the same state
reference; every ref is keyed by the state's own Session. A generation that
folded its inherited prefix would re-key its ancestor's checkpoints under its
own id — refs the ancestor's log does not know — and re-derive the ancestor's
completed rollover intent as its own pending swap.

The coordinator reads this state back through `host.projectionForSubject` — you
may return the framework's folded state, or fold by hand with
`foldContextProjection(events, config, { sessionId, inheritedEventCount })`.
Both converge on one value (cold == live).

**Anchor policy the engine owns:** a boundary is a selectable default return
anchor exactly when it resolved at a completed turn and is attributable to
exactly one topic. What a *topic* is (`attributions`) is your call — a Thread,
a continuity line, a repo. Multi-topic or mid-turn boundaries are searchable
evidence but not default return targets.

## Seam 4 — coordinator (shipped)

Implement `ContextContinuityHost<SubjectId>` and drive the coordinator from your
Session-event dispatch.

```ts
import { ContextContinuityCoordinator, type ContextContinuityHost } from '@wowyuarm/dsh-context-continuity'

const host: ContextContinuityHost<SubjectId> = {
  agentForSubject:   (id) => handles.get(id)?.agent,
  subjectForAgent:   (agent) => resolveSubject(agent),           // → { id, sessionId } | undefined
  projectionForSubject: (id, sid) => readFoldedState(id, sid),   // from seam 3
  executeTransition: (id, plan) => performSwap(id, plan),        // see contract below
  rolloverIdentity:  (prevSessionId, toolCallId) => ({           // durable naming — yours
    newSessionId: `myhost-rollover-${sha([prevSessionId, toolCallId])}`,
    requestId:    `myhost:rollover:${sha([prevSessionId, toolCallId])}`,
  }),
  isEphemeralNotice: (message) => /* same rule as seam 3 */ false,
  log: (message) => ctx.logger.warn(message),
}

const coordinator = new ContextContinuityCoordinator(host, codec)
```

Wire it (call sites are yours; the coordinator holds only reconstructible
process state):

- **On every subject Session event:** `coordinator.onSessionEvent(id, agent, event)`.
- **At a subject's turn-stop boundary, before the turn closes:**
  `coordinator.captureQueuedInput(agent)` — real input is preserved for delivery
  after the handoff, ephemeral notices are dropped.
- **Before admitting queued input to an old generation:** consult
  `coordinator.needsAdmissionGate(agent)`.
- **During subject activation (crash recovery):**
  `coordinator.recoverPendingTransition(id, agent, sessionId)` and, for quiet
  continuations, `coordinator.repairContinuations(agent, state)`.
- **On subject dispose/removal:** `coordinator.stopTracking(id)`.

### `executeTransition` contract

Perform one prepared swap at a true idle boundary, in your lifecycle: commit the
rollover, dispose the old Agent, archive the old Session, create and activate the
successor (seed it — `SessionStore.create({ seed, meta })` — with the handoff via
`coordinator.handoffMessageFor(plan)` delivered first, then `plan.carriedInput`).
Resolve once the subject runs its new generation; **reject to leave the previous
generation recoverable** (never half-swap).

> **Durable identity — keep stable:** `rolloverIdentity`'s Session-id and
> request-id scheme is what makes an interrupted rollover converge on one
> operation across restart. Changing the scheme risks a duplicate successor.

## Seam 5 — tools factory (planned)

The product surface. A factory produces the three model-facing tools from your
adapter plus optional prose overrides; the engine keeps the safety-bearing
validation.

```ts
// planned shape
const tools = createContinuityTools({
  adapter,        // your requestRollover / recordCheckpoint / timeline entry points
  codec,
  text: {         // optional; sensible defaults
    subjectNoun: 'Team Member',
    rolloverChecklist: '…what a handoff must cover in your domain…',
    checkpointGuidance: '…when to bury an anchor…',
  },
})
```

Non-overridable, always in the engine: the handoff-non-empty / byte-cap /
related-files-shape / anti-forgery-`checkpointRef` validation, and the
"a context change never rolls back an external effect" discipline. You override
subject-facing wording only.

## Seam 6 — search scope (planned)

Search recalls across sessions, and **the engine never knows what a workspace or
a team is** — it knows a subject and a set of sessions you authorize.

```ts
// planned shape
interface SearchScopeProvider<SubjectId> {
  // Default: the subject's own lineage across all its sessions.
  ownedSessions(id: SubjectId): SessionId[] | Promise<SessionId[]>
  // Named scopes the subject MAY search — you define what they are.
  //   Team: each workspace / team the member participates in.
  //   Loom: usually none (one Individual, one line).
  availableScopes?(id: SubjectId): { scopeId: string; label: string }[]
  // Resolve a scope the model selected into the sessions it authorizes.
  sessionsInScope?(id: SubjectId, scopeId: string): SessionId[] | Promise<SessionId[]>
}
```

- `context_search({ query })` → `ownedSessions` (the subject's own history).
- `context_search({ query, scope })` → `sessionsInScope` for a scope the model
  picked from `availableScopes`.
- **Security invariant:** scope is always derived by the host from subject
  identity. A model-supplied `scopeId` only *selects* among what you already
  authorized; a guessed Session id or another subject's Session is rejected. The
  engine only ever searches within the set you return.

## Compatibility red lines (durable identity)

These are written into logs by earlier generations and read back by later ones.
Once a host ships, treat them as frozen:

1. `pluginId` — attribution the codec matches on read.
2. Section names — fixed by the engine; a host cannot change them.
3. `rolloverIdentity` naming scheme — in-flight rollover crash recovery depends on it.
4. Projection `stateVersion` — currently `2` (the state carries the Session
   identity and the fork-inherited cut); bump it whenever the serialized state
   shape or fold semantics change, so stale cached rows are discarded rather
   than misapplied.
5. Legacy tool names — if a tool was renamed, keep folding the old name
   (`rolloverToolNames`); it is a log decoder, not an active alias.
