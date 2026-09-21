# dsh-context-continuity — one continuous context across many Sessions

[English](README.md) | [简体中文](README.zh.md)

[![npm](https://img.shields.io/npm/v/@wowyuarm/dsh-context-continuity?style=flat-square)](https://www.npmjs.com/package/@wowyuarm/dsh-context-continuity)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**A subject's context lived as one continuous timeline across many physical Sessions.**

`dsh-context-continuity` is the engine behind context continuity for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a *subject*
(an Agent Team Member, a Loom Individual, a long-running coding agent) can roll
forward into a fresh Session and stay the same identity, bury a restorable
anchor and come back to it, and walk its own lineage as one timeline — while
physically living in many Session files.

The engine owns the continuity *semantics*. Everything underneath is a native
Harness capability: session fork/seed, session header lineage, the Session log
as the only durable store, and the session projection framework. A host binds
the engine to its own subject and its own domain through one contract.

## Status

The engine core — the projection unit, the coordinator, the lineage read, the
model-facing tools factory, the retrieval ladder, and the context-pressure
policy — is extracted and covered by unit tests; no host consumes it yet. Team
integration is a separate, later step (`dsh-agent-team` still carries its own
copy of this mechanism).

## Layout

| File | Responsibility |
| --- | --- |
| `src/host.ts` | `ContextContinuityHost<SubjectId>` — everything the engine asks a host for, plus the one shared ephemeral-notice rule |
| `src/types.ts` | Subject, transition plan, rollover identity, trigger vocabulary |
| `src/projection-state.ts` | The read-only state one Session folds from its durable log, plus the host-contributed `DomainBoundary` anchor |
| `src/projection.ts` | The fold itself, as the Harness `ProjectionDefinition` `contextContinuity`: one pure transition over committed events, one registration for every Session |
| `src/anchor.ts` | The one return-anchor policy — candidate enumeration, retained-cost estimate, rejection reason — shared by the timeline read and a search hit's enrichment, so the two can never disagree |
| `src/timeline.ts` | The lineage read: a subject's generations walked, deduplicated, and priced into one bounded list of return anchors |
| `src/search.ts` | The retrieval engine: authorization, provenance folding, the bounded search, and the neighbourhood read a `contextRef` expands into |
| `src/search-tools.ts` | `context_search` and `context_read` — the model-facing ladder, with its descriptions, argument rules, output schemas, and renders |
| `src/context-ref.ts` | The opaque canonical `contextRef` codec: `(sessionId, seq)` of the generation that recorded the event, and nothing else |
| `src/pressure.ts` | The context-pressure policy: the two thresholds, the once-per-generation handoff notice, and the fail-closed reduction proof at the hard limit |
| `src/tools.ts` | The three model-facing tools — `context_rollover`, `context_checkpoint`, `context_timeline` — as one factory over a host adapter |
| `src/message-codec.ts` | Durable handoff and checkpoint-continuation messages, written and read through the shipped `plugin` snapshot form |
| `src/coordinator.ts` | Rollover lifecycle: durable-result gate, turn-end and idle boundary, the swap, carried input, checkpoint continuations, crash recovery |
| `src/stored-session-reader.ts` | One read seam for stored Sessions with five typed failure categories |

## Host contract

A host supplies only what the engine cannot know:

- resolve a subject to its live Agent, and back;
- read one Session's continuity state (`ContextProjectionState`) for the
  coordinator — folding it by hand, or by registering the engine's own
  projection unit and reading it back;
- read an archived ancestor's stored log and measure one source's tokens, which
  is all `readContextTimeline` (the lineage walk) needs from you;
- authorize recall: which Sessions a subject may search by default, which named
  scopes it may select, and what one source costs — plus the query capability
  itself (`ctx.sessionQuery`), which the engine uses through
  `ContextSearchPort` but never reaches for;
- perform the three tools' effects — judge whether a `checkpointRef` is an anchor
  this subject recorded, request a rollover, record a checkpoint, read the
  timeline — and reword the subject-facing prose; the engine keeps the validation,
  the anti-forgery gate, the `concludeTurn()` timing, and the renders;
- contribute whatever its domain treats as a timeline anchor, and name its
  durable refs (`ContextProjectionHost`: `checkpointRefFor`, `boundaryRefFor`,
  `tracksCall`, `domainBoundaryOf`);
- meter pressure and reduce it: the effective budgets of one subject's route, a
  monotone surface observation, the reduction capability, the steer, and the
  labels for whatever that subject is holding — the engine decides when, and
  refuses to continue on a reduction it cannot prove;
- perform one prepared generation swap in its own lifecycle;
- derive the durable, collision-resistant identity of one rollover
  (`RolloverIdentity`) — a Session-id scheme is a host concern, not the engine's;
- say which queued messages are ephemeral domain notices the successor
  rederives, and log diagnostics.

## Design decisions

1. **Domain anchors are host fold contributions, not a labeller.** Rules like
   "a boundary is a selectable default anchor exactly when it is attributable to
   one topic" need event semantics, so the host contributes boundaries carrying
   `kind`/`label`/`attributions` while the engine owns checkpoints, pending
   transitions, continuations, carried input, and turn cursors.
2. **Naming belongs to the host.** Session-id schemes and idempotency request ids
   are durable domain concerns; the engine derives nothing itself.
3. **The codec is parameterized by plugin id and two prose lines only.** Section
   names are fixed because every generation reads them back out of logs written
   by earlier generations: a host that changed them could not decode its own
   history.
4. **The coordinator is indifferent to how the fold is implemented.** It reads
   state through `host.projectionForSubject()`, so a host may fold by hand or
   through the Harness projection framework. The engine also *ships* that fold:
   `createContextProjectionDefinition()` returns the host-only unit
   `contextContinuity` (state version 2), registered once per host — the
   framework keeps one unit per projection key and drives it for every Session.
   What a closure cannot hold lives in the state instead: the Session identity
   that keys every derived ref, and the inherited cut below which events belong
   to the ancestor generation this Session continues. The fold returns the same
   state reference for every event it does not care about, and reads nothing
   outside the log: every durable ref is the host's answer.
5. **Recall is a ladder, and every rung is bounded.** `createSearchTools()` owns
   the argument surface (no cursor, no page size, no Session id, no event type),
   the canonical `contextRef`, provenance folding across a lineage, the
   neighbourhood budget, and the render shapes; the host authorizes the scope and
   supplies the query capability. A `contextRef` carries no authority — it names
   `(sessionId, seq)` and is revalidated against the host's authorization on every
   read — and a hit's `checkpointRef` is offered only from the same anchor policy
   the timeline uses, never synthesized.
6. **The tools are the product surface, so their safety is the engine's.**
   `createContinuityTools()` owns the argument contract, the anti-forgery gate on
   a supplied `checkpointRef`, the `concludeTurn()` timing, and the render shapes;
   the host's adapter performs every effect, and the overridable prose is
   subject-facing vocabulary only. A fabricated ref is a model-visible error
   rather than a silent fresh rollover, in every host, by construction.

7. **Pressure is a policy, not a threshold.** `ContextPressurePolicy` owns the
   order of the two limits, the once-per-generation notice latch, and the proof a
   reduction must earn before a request may continue — the durable surface
   advanced, or pressure measurably fell, or the request is blocked with a
   recoverable diagnostic rather than knowingly submitted over the limit. The
   latch reads durable Session evidence, never process state: a restart stays
   quiet, a rollover re-arms, and a failed steer is retried. The host owns the
   meter, the reduction capability, the steer, and the words the notice uses for
   what the subject is holding.

## Development

```bash
npm install
npm test          # package boundary check + unit tests
npm run typecheck # strict TypeScript, no emit
npm run build     # emit lib/
```

Tests run against the published `@deepseek-ai/dsh-*` packages — no sibling
Harness checkout and no path mapping, so the whole suite finishes in well under
a second.
