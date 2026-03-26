import { z } from 'zod';

/**
 * Partyline Event Schema (from TSCP-SPEC Section 3)
 * Canonical JSON structure for all events in the Partyline
 */

export const ComparisonOpSchema = z.enum(['>', '<', '>=', '<=', '==', '!=']);

export const ConditionSchema = z.object({
  identifier: z.string(),
  comparison_op: ComparisonOpSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
});

export const ArtifactSchema = z.object({
  artifact_id: z.string(),
  type: z.enum(['graph_node', 'file', 'metric', 'decision_record']),
  reference: z.string(),
  checksum: z.string().optional(),
});

export const ErrorDetailsSchema = z.object({
  error_code: z.string(),
  message: z.string(),
  stack_trace: z.string().optional(),
});

export const EventTypeSchema = z.enum([
  'join',
  'action',
  'decision',
  'artifact',
  'error',
  'checkpoint',
  'halt',
  'governance_update',
]);

export const PartylineEventSchema = z.object({
  timestamp: z.string().datetime(),
  sequence_id: z.number().int().positive(),
  agent_id: z.string(),
  event_type: EventTypeSchema,
  mission_id: z.string(),
  context_delta: z.record(z.unknown()),
  artifacts: z.array(ArtifactSchema).optional(),
  references_gov: z.string(),
  parent_event_id: z.number().int().optional(),
  error_details: ErrorDetailsSchema.optional(),
  ttl_seconds: z.number().int().positive().optional(),
  signature: z.object({
    algorithm: z.string(),
    public_key: z.string(),
    signature_bytes: z.string(),
  }).optional(),
});

export type PartylineEvent = z.infer<typeof PartylineEventSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/**
 * Event ingestion request schema
 */
export const EventIngestionRequestSchema = PartylineEventSchema.omit({
  timestamp: true,
  sequence_id: true,
}).partial({
  artifacts: true,
  error_details: true,
  parent_event_id: true,
  ttl_seconds: true,
  signature: true,
});

export type EventIngestionRequest = z.infer<typeof EventIngestionRequestSchema>;
