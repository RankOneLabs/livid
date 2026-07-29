/**
 * @livid/core — headless. Config in, validated and laid-out view data out.
 *
 *   DiagramSpec ──validate──▶ ValidDiagram ──layout──▶ LaidOutDiagram
 *   user-authored             core-only                core-only
 *
 * Renderers accept `LaidOutDiagram` and nothing else.
 */

export { type Result, ok, err, isOk, isErr } from './result.js';

export {
  type NodeId,
  type EdgeId,
  type LineId,
  type DiagramPath,
  ROOT_PATH,
  nodeId,
  edgeId,
  lineId,
  descend,
  formatPath,
} from './ids.js';

export { type DetailIssue, type DiagramError, formatError } from './errors.js';

export {
  type NodeShape,
  type Glyph,
  type EdgeMarker,
  type NodeTypeDef,
  type EdgeTypeDef,
  type Registry,
  type AnyRegistry,
  type NodeTypeKey,
  type EdgeTypeKey,
  type NodeDetailOf,
  type EdgeDetailOf,
  defineRegistry,
  nodeTypeKeys,
  edgeTypeKeys,
} from './registry.js';

export { type StandardSchemaV1 } from './standard-schema.js';

export type {
  DiagramSpec,
  LineSpec,
  NodeSpec,
  EdgeSpec,
  Line,
  ValidNode,
  ValidEdge,
  ValidDiagram,
  Point,
  Size,
  LaidOutNode,
  LaidOutEdge,
  LaidOutDiagram,
} from './types.js';

export {
  type ValidateOptions,
  type ConfigError,
  DEFAULT_TYPE_LIMIT,
  validateConfig,
  validateDiagram,
} from './validate.js';

export { normalize } from './normalize.js';

export {
  type LayoutDirection,
  type LayoutSpacing,
  type NodeSizeConfig,
  type LayoutOptions,
  layout,
  layoutDeep,
} from './layout.js';
