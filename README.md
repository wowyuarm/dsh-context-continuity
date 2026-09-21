# dsh-context-continuity — one continuous context across many Sessions

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

The engine core is extracted and covered by unit tests; no host consumes it yet.
Team integration is a separate, later step (`dsh-agent-team` still carries its
own copy of this mechanism).

## Layout

| File | Responsibility |
| --- | --- |
| `src/host.ts` | `ContextContinuityHost<SubjectId>` — everything the engine asks a host for |
| `src/types.ts` | Subject, transition plan, rollover identity, trigger vocabulary |
| `src/projection-state.ts` | The read-only state one Session folds from its durable log, plus the host-contributed `DomainBoundary` anchor |
| `src/message-codec.ts` | Durable handoff and checkpoint-continuation messages, written and read through the shipped `plugin` snapshot form |
| `src/coordinator.ts` | Rollover lifecycle: durable-result gate, turn-end and idle boundary, the swap, carried input, checkpoint continuations, crash recovery |
| `src/stored-session-reader.ts` | One read seam for stored Sessions with five typed failure categories |

## Host contract

A host supplies only what the engine cannot know:

- resolve a subject to its live Agent, and back;
- fold one Session's projection (`ContextProjectionState`) from durable events, and
  contribute whatever its domain treats as a timeline anchor (`DomainBoundary`);
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
   through the Harness projection framework.

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
