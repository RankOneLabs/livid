import type { DiagramPath } from './ids.js';

/**
 * A single problem found inside a detail bag, flattened from the validator's
 * own issue format so core reports one shape regardless of which library the
 * consumer brought.
 */
export interface DetailIssue {
  readonly message: string;
  /** Dotted path within the detail bag, e.g. `model.context_window`. */
  readonly field: string;
}

/**
 * Everything validation can reject, as a discriminated union. Each variant
 * carries enough trace context — path, entity id, the offending value — to
 * locate the failure in the source projection without re-running anything.
 */
export type DiagramError =
  | {
      readonly kind: 'duplicate_node_id';
      readonly path: DiagramPath;
      readonly nodeId: string;
    }
  | {
      readonly kind: 'duplicate_edge_id';
      readonly path: DiagramPath;
      readonly edgeId: string;
    }
  | {
      readonly kind: 'unknown_node_type';
      readonly path: DiagramPath;
      readonly nodeId: string;
      readonly type: string;
      readonly known: readonly string[];
    }
  | {
      readonly kind: 'unknown_edge_type';
      readonly path: DiagramPath;
      readonly edgeId: string;
      readonly type: string;
      readonly known: readonly string[];
    }
  | {
      readonly kind: 'unresolved_endpoint';
      readonly path: DiagramPath;
      readonly edgeId: string;
      readonly endpoint: 'source' | 'target';
      readonly ref: string;
    }
  | {
      readonly kind: 'unknown_line';
      readonly path: DiagramPath;
      readonly nodeId: string;
      readonly line: string;
      readonly known: readonly string[];
    }
  | {
      readonly kind: 'duplicate_line_id';
      readonly path: DiagramPath;
      readonly lineId: string;
    }
  | {
      readonly kind: 'invalid_detail';
      readonly path: DiagramPath;
      readonly nodeId: string;
      readonly type: string;
      readonly issues: readonly DetailIssue[];
    }
  | {
      readonly kind: 'invalid_edge_detail';
      readonly path: DiagramPath;
      readonly edgeId: string;
      readonly type: string;
      readonly issues: readonly DetailIssue[];
    }
  | {
      /**
       * A schema returned a promise. Layout runs at build time and core is
       * synchronous throughout, so async refinements are rejected rather than
       * silently awaited.
       */
      readonly kind: 'async_schema';
      readonly path: DiagramPath;
      readonly entityId: string;
      readonly type: string;
    }
  | {
      /**
       * The vocabulary discipline: a map stops reading as a map once it has
       * too many primitives. Configurable, not absolute.
       */
      readonly kind: 'registry_overflow';
      readonly axis: 'nodeTypes' | 'edgeTypes';
      readonly count: number;
      readonly limit: number;
    };

export function formatError(error: DiagramError): string {
  switch (error.kind) {
    case 'duplicate_node_id':
      return `duplicate node id "${error.nodeId}"`;
    case 'duplicate_edge_id':
      return `duplicate edge id "${error.edgeId}"`;
    case 'unknown_node_type':
      return `node "${error.nodeId}" has unregistered type "${error.type}" (known: ${error.known.join(', ')})`;
    case 'unknown_edge_type':
      return `edge "${error.edgeId}" has unregistered type "${error.type}" (known: ${error.known.join(', ')})`;
    case 'unresolved_endpoint':
      return `edge "${error.edgeId}" ${error.endpoint} "${error.ref}" resolves to no node`;
    case 'unknown_line':
      return `node "${error.nodeId}" references undeclared line "${error.line}" (known: ${error.known.join(', ')})`;
    case 'duplicate_line_id':
      return `duplicate line id "${error.lineId}"`;
    case 'invalid_detail':
      return `node "${error.nodeId}" (${error.type}) has an invalid detail bag: ${error.issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join('; ')}`;
    case 'invalid_edge_detail':
      return `edge "${error.edgeId}" (${error.type}) has an invalid detail bag: ${error.issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join('; ')}`;
    case 'async_schema':
      return `schema for "${error.type}" (on "${error.entityId}") returned a promise; core validation is synchronous`;
    case 'registry_overflow':
      return `registry declares ${error.count} ${error.axis}, above the discipline limit of ${error.limit}`;
  }
}
