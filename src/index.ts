/**
 * Context continuity: a subject's context lived as one continuous timeline
 * across many physical Session generations.
 *
 * A subject rolls forward into a fresh generation (`context_rollover`), returns
 * to a recorded anchor (`context_checkpoint` + rollover), and walks its own
 * lineage as one timeline (`context_timeline`) — physically many Session files,
 * one continuous context in the subject's understanding. The engine owns these
 * mechanics generically; a host binds them to its own subject and domain
 * through {@link ContextContinuityHost}.
 * @module @wowyuarm/dsh-context-continuity
 */

export type {
  ContextSubject,
  RolloverTrigger,
  RelatedFile,
  TransitionPlan,
  RolloverIdentity,
} from './types.ts'

export type {
  ContextCheckpointEntry,
  PendingRolloverIntent,
  ContinuationDeliveryState,
  CarriedCandidate,
  DomainBoundary,
  ContextProjectionState,
} from './projection-state.ts'
export { continuationDelivered } from './projection-state.ts'

export type { SubjectResolver, ContextContinuityHost } from './host.ts'
export { isDroppedNotice } from './host.ts'

export {
  CONTEXT_CONTINUITY_PROJECTION_KEY,
  CONTEXT_CHECKPOINT_TOOL_NAME,
  CONTEXT_ROLLOVER_TOOL_NAME,
  contextProjectionStateSchema,
  emptyContextProjectionState,
  foldContextProjection,
  createContextProjectionDefinition,
} from './projection.ts'
export type {
  ContextFoldTarget,
  ContextProjectionConfig,
  ContextProjectionHost,
  DomainBoundaryContribution,
  DomainBoundaryInput,
} from './projection.ts'

export { ContextContinuityCoordinator } from './coordinator.ts'

export {
  ContextMessageCodec,
  HANDOFF_SECTION_NAME,
  CHECKPOINT_SECTION_NAME,
  CHECKPOINT_CONTINUATION_TEXT,
  HANDOFF_PREVIOUS_SESSION,
  HANDOFF_NEW_SESSION,
  HANDOFF_TRIGGER,
  HANDOFF_EVENT_SEQ,
  HANDOFF_CHECKPOINT,
  HANDOFF_RELATED_FILES,
} from './message-codec.ts'
export type { MessageCodecConfig, ContextHandoff } from './message-codec.ts'

export {
  StoredSessionReader,
  StoredSessionReadError,
  classifyStoredSessionFailure,
  sessionFailureOf,
} from './stored-session-reader.ts'
export type {
  StoredSessionFailureKind,
  StoredSessionFailure,
  StoredSessionInspection,
  StoredSessionReadResult,
} from './stored-session-reader.ts'
