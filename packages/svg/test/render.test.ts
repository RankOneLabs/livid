import { beforeAll, describe, expect, it } from 'vitest';

import type { LaidOutDiagram } from '@rankonelabs/livid-core';

import {
  type Arrowhead,
  type SvgOptions,
  DEFAULT_METRICS,
  DEFAULT_PALETTE,
  arrowheadOf,
  arrowheadReach,
  labelPlacementOf,
  lineColour,
  renderFigure,
  renderSvg,
} from '../src/index.js';
import { type TestRegistry, attributeValues, drawnEdgeEnds, laidOut, stateFrame } from './helpers.js';

let diagram: LaidOutDiagram<TestRegistry>;

beforeAll(async () => {
  diagram = await laidOut();
});

describe('document', () => {
  it('opens an svg with matching width, height, and viewBox', () => {
    const svg = renderSvg(diagram);
    const opening = svg.slice(0, svg.indexOf('>') + 1);
    const width = /width="([\d.]+)"/.exec(opening)?.[1];
    const height = /height="([\d.]+)"/.exec(opening)?.[1];

    expect(opening).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(opening).toContain(`viewBox="0 0 ${width} ${height}"`);
  });

  it('closes every element it opens', () => {
    const svg = renderSvg(diagram);
    const opened = (svg.match(/<g[ >]/g) ?? []).length;
    const closed = (svg.match(/<\/g>/g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it('names the figure for assistive technology when given a title', () => {
    const svg = renderSvg(diagram, { title: 'Example pipeline' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Example pipeline"');
    expect(svg).toContain('<title>Example pipeline</title>');
  });

  it('claims no role without a name to go with it', () => {
    // role="img" alone makes a screen reader announce an unnamed image.
    const svg = renderSvg(diagram);
    expect(svg).not.toContain('role="img"');
  });

  it('stays a finite document when there is nothing to draw', async () => {
    const empty = await laidOut({ nodes: [], edges: [] });
    const svg = renderSvg(empty);

    expect(svg).not.toContain('Infinity');
    expect(svg).not.toContain('NaN');
    const opening = svg.slice(0, svg.indexOf('>') + 1);
    expect(Number(/height="([\d.]+)"/.exec(opening)?.[1])).toBeGreaterThan(0);
  });
});

describe('figure size', () => {
  it('reports the size the markup declares', () => {
    const figure = renderFigure(diagram);
    const opening = figure.svg.slice(0, figure.svg.indexOf('>') + 1);

    expect(opening).toContain(`width="${figure.width}"`);
    expect(opening).toContain(`height="${figure.height}"`);
    expect(opening).toContain(`viewBox="0 0 ${figure.width} ${figure.height}"`);
  });

  it('draws the same markup either way in', () => {
    expect(renderFigure(diagram).svg).toBe(renderSvg(diagram));
  });

  it('reports a width wider than core laid out, because labels sit outside', () => {
    // The reason this is worth returning at all: a consumer cannot derive it
    // from `diagram.bounds`, since core does not place labels.
    const figure = renderFigure(diagram, { levels: 'root' });
    expect(figure.width).toBeGreaterThan(diagram.bounds.width);
    expect(figure.height).toBeGreaterThan(diagram.bounds.height);
  });

  it('stays a positive size with nothing to draw', async () => {
    const figure = renderFigure(await laidOut({ nodes: [], edges: [] }));
    expect(figure.width).toBeGreaterThan(0);
    expect(figure.height).toBeGreaterThan(0);
  });
});

describe('content', () => {
  it('draws every node', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    for (const node of diagram.nodes) {
      expect(svg).toContain(`>${node.node.label}<`);
    }
  });

  it('draws every routed edge', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    const routed = diagram.edges.filter((edge) => edge.route.length >= 2).length;
    expect((svg.match(/<polyline /g) ?? []).length).toBe(routed);
  });

  it('gives each node a hoverable description of its type', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    expect(svg).toContain('<title>fork — Junction</title>');
    expect(svg).toContain('<title>watcher — Observer</title>');
  });
});

describe('styling hooks', () => {
  it('renders a validated state snapshot through the closed visual vocabulary', () => {
    const frame = stateFrame({ process: 'blocked' }, { e2: 'active' });
    const svg = renderSvg(diagram, frame, { levels: 'root' });

    expect(svg).toContain('data-node="process" data-line="main" data-state="blocked" data-tint="danger" data-anim="stall"');
    expect(svg).toContain('data-state="active" data-tint="accent" data-anim="flash"');
    expect(svg).toContain(`fill="${DEFAULT_PALETTE.states.danger}"`);
    expect(svg).toContain(`stroke="${DEFAULT_PALETTE.states.accent}"`);
  });

  it('omits the animation hook when a state declares no animation', () => {
    const frame = stateFrame({ process: 'ready' });
    const svg = renderSvg(diagram, frame, { levels: 'root' });
    const process = /<g class="livid-node"[^>]*data-node="process"[^>]*>/.exec(svg)?.[0];

    expect(process).toContain('data-state="ready"');
    expect(process).not.toContain('data-anim');
  });

  it('escapes state visual tokens supplied by JavaScript registries', () => {
    const work = diagram.registry.nodeTypes.work;
    const unsafe = {
      ...diagram,
      registry: {
        ...diagram.registry,
        nodeTypes: {
          ...diagram.registry.nodeTypes,
          work: {
            ...work,
            states: {
              ...work.states,
              active: { tint: 'accent"' as 'accent', anim: 'pulse"' as 'pulse' },
            },
          },
        },
      },
    };
    const svg = renderSvg(unsafe, stateFrame({ process: 'active' }), { levels: 'root' });

    expect(svg).toContain('data-tint="accent&quot;"');
    expect(svg).toContain('data-anim="pulse&quot;"');
  });

  it('does not throw when a JavaScript caller passes null for the optional argument', () => {
    expect(() => renderSvg(diagram, null as unknown as SvgOptions)).not.toThrow();
  });

  it('tells an edge on its own line apart from one that branches', () => {
    // The distinction CSS cannot recover from geometry, and the reason these
    // hooks exist rather than an animation option on the renderer.
    const svg = renderSvg(diagram, { levels: 'root' });
    expect(svg).toContain('data-kind="track"');
    expect(svg).toContain('data-kind="branch"');
  });

  it('names the line each edge and node belongs to', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    for (const line of diagram.lines) {
      expect(svg).toContain(`data-line="${line.id}"`);
    }
  });

  it('names the registry type of every node', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    for (const node of diagram.nodes) {
      expect(svg).toContain(`data-type="${node.node.type}"`);
      expect(svg).toContain(`data-node="${node.node.id}"`);
    }
  });

  it('gives a consumer one class to select all of each', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    const routed = diagram.edges.filter((edge) => edge.route.length >= 2).length;

    expect((svg.match(/class="livid-node"/g) ?? []).length).toBe(diagram.nodes.length);
    expect((svg.match(/class="livid-edge"/g) ?? []).length).toBe(routed);
  });

  it('escapes hook values rather than trusting ids', async () => {
    const hostile = await laidOut({
      nodes: [{ id: 'a"><script>', type: 'work', label: 'x' }],
      edges: [],
    });

    const svg = renderSvg(hostile);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('data-node="a&quot;&gt;&lt;script&gt;"');
  });
});

describe('labels', () => {
  it('keeps labels inside shapes that can hold them', () => {
    expect(labelPlacementOf('rect')).toBe('inside');
    expect(labelPlacementOf('stadium')).toBe('inside');
    expect(labelPlacementOf('hexagon')).toBe('inside');
    expect(labelPlacementOf('cylinder')).toBe('inside');
  });

  it('sets labels beside shapes that cannot', () => {
    expect(labelPlacementOf('circle')).toBe('beside');
    expect(labelPlacementOf('diamond')).toBe('beside');
  });

  it('draws a leader from each point shape to its label', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    // One circle and one diamond in the fixture, and nothing else adds a line.
    expect((svg.match(/<line /g) ?? []).length).toBe(2);
  });

  it('keeps a long label out of the shape that could not hold it', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    const decision = diagram.nodes.find((node) => node.node.type === 'decision');
    const label = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>a very long decision name</.exec(svg);

    expect(decision).toBeDefined();
    expect(label).not.toBeNull();
    // Below the shape, not centred in it.
    expect(Number(label?.[2])).toBeGreaterThan((decision?.position.y ?? 0) + (decision?.size.height ?? 0));
  });
});

describe('viewport', () => {
  it('contains every drawn coordinate, including outside labels', () => {
    const svg = renderSvg(diagram);
    const opening = svg.slice(0, svg.indexOf('>') + 1);
    const width = Number(/width="([\d.]+)"/.exec(opening)?.[1]);
    const height = Number(/height="([\d.]+)"/.exec(opening)?.[1]);

    const body = svg.slice(svg.indexOf('>') + 1);
    const xs = attributeValues(body, 'x').concat(attributeValues(body, 'cx'));
    const ys = attributeValues(body, 'y').concat(attributeValues(body, 'cy'));

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(height);
  });

  it('reserves more height than the layout alone needs', () => {
    // Labels sitting below point shapes are space core never accounted for.
    const svg = renderSvg(diagram, { levels: 'root' });
    const height = Number(/height="([\d.]+)"/.exec(svg.slice(0, svg.indexOf('>') + 1))?.[1]);
    expect(height).toBeGreaterThan(diagram.bounds.height);
  });
});

describe('lines', () => {
  it('uses a configured colour for a token it knows', () => {
    const svg = renderSvg(diagram, { theme: { palette: { lines: { 'token-main': '#123456' } } } });
    expect(svg).toContain('#123456');
  });

  it('falls back to the ramp by line order for an unconfigured token', () => {
    expect(lineColour(DEFAULT_PALETTE, 'never-configured', 0)).toBe(DEFAULT_PALETTE.ramp[0]);
    expect(lineColour(DEFAULT_PALETTE, 'never-configured', 1)).toBe(DEFAULT_PALETTE.ramp[1]);
  });

  it('wraps the ramp rather than running out of colours', () => {
    const beyond = DEFAULT_PALETTE.ramp.length;
    expect(lineColour(DEFAULT_PALETTE, 'x', beyond)).toBe(DEFAULT_PALETTE.ramp[0]);
  });

  it('draws a branch onto another line lighter than the line it leaves', () => {
    const svg = renderSvg(diagram, {
      levels: 'root',
      theme: { metrics: { lineWeight: 9, branchWeight: 3 } },
    });
    expect(svg).toContain('stroke-width="9"');
    expect(svg).toContain('stroke-width="3"');
  });
});

describe('drill-down levels', () => {
  it('stacks nested levels by default', () => {
    const svg = renderSvg(diagram);
    expect(svg).toContain('>step one<');
    expect(svg).toContain('>step two<');
  });

  it('captions a nested level with the node it came from', () => {
    const svg = renderSvg(diagram, { caption: 'top' });
    expect(svg).toContain('top ▸ process');
  });

  it('draws only the top level when asked for root', () => {
    const svg = renderSvg(diagram, { levels: 'root' });
    expect(svg).not.toContain('>step one<');
  });

  it('rules off between stacked levels, and nowhere else', () => {
    const divider = new RegExp(`stroke="${DEFAULT_PALETTE.divider}"`, 'g');
    // Two levels in the fixture, so exactly one rule between them.
    expect((renderSvg(diagram).match(divider) ?? []).length).toBe(1);
    expect(renderSvg(diagram, { levels: 'root' }).match(divider)).toBeNull();
  });

  it('draws the rule with a visible stroke at a real position', () => {
    const svg = renderSvg(diagram);
    const rule = new RegExp(`<line x1="[\\d.]+" y1="([\\d.]+)"[^>]*stroke="${DEFAULT_PALETTE.divider}" stroke-width="([\\d.]+)"`);
    const match = rule.exec(svg);

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThan(0);
    expect(Number(match?.[2])).toBeGreaterThan(0);
  });
});

describe('arrowheads', () => {
  const ARROWHEADS: SvgOptions = { theme: { metrics: { edgeArrowhead: 'target' } } };

  /**
   * A head far larger than the nodes it points at. Default heads land inside the
   * node boxes that already set the figure's bounds, so this is what shows the
   * reserved room is real rather than nominal.
   */
  const OVERSIZED: Arrowhead = { id: 'oversized', length: 40, width: 30 };
  const OVERSIZED_ARROWHEADS: SvgOptions = {
    theme: { metrics: { edgeArrowhead: 'target', arrowLength: OVERSIZED.length, arrowWidth: OVERSIZED.width } },
  };

  const markerIdOf = (svg: string): string | undefined => /<marker id="([^"]+)"/.exec(svg)?.[1];

  it('draws none unless the theme asks for them', () => {
    const svg = renderSvg(diagram);
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('marker-end');
  });

  it('draws the same document off as it does unasked', () => {
    expect(renderSvg(diagram, { theme: { metrics: { edgeArrowhead: 'none' } } })).toBe(renderSvg(diagram));
  });

  /**
   * Deriving the fingerprint walks every node, edge, and route point. A figure
   * that draws no heads has nothing to name, so the default render must not pay
   * for one — this asserts the thunk stays unforced rather than trusting that
   * the mode is checked first.
   */
  it('does not derive a fingerprint for a figure that draws none', () => {
    let derived = 0;
    const fingerprint = (): string => {
      derived += 1;
      return 'unused';
    };

    expect(arrowheadOf({ ...DEFAULT_METRICS, edgeArrowhead: 'none' }, fingerprint)).toBeNull();
    expect(derived).toBe(0);

    expect(arrowheadOf({ ...DEFAULT_METRICS, edgeArrowhead: 'target' }, fingerprint)?.id).toBe(
      'livid-arrow-unused',
    );
    expect(derived).toBe(1);
  });

  it('defines the head once, however many edges end with one', () => {
    const svg = renderSvg(diagram);
    const heads = renderSvg(diagram, ARROWHEADS);

    expect((heads.match(/<defs>/g) ?? []).length).toBe(1);
    expect((heads.match(/<marker /g) ?? []).length).toBe(1);
    // More edges than definitions, across more than one stacked level.
    expect((heads.match(/marker-end=/g) ?? []).length).toBeGreaterThan(1);
    expect((svg.match(/<polyline /g) ?? []).length).toBeGreaterThan(1);
  });

  it('ends every drawn edge with the head it defined', () => {
    const svg = renderSvg(diagram, ARROWHEADS);
    const id = markerIdOf(svg);
    const ends = (svg.match(new RegExp(`marker-end="url\\(#${id ?? ''}\\)"`, 'g')) ?? []).length;

    expect(id).toBeDefined();
    expect(ends).toBe((svg.match(/<polyline /g) ?? []).length);
  });

  it('takes both its colour and its size from the edge it ends', () => {
    // Why there is one definition rather than one per line: a consumer's palette
    // may be `var(--accent)` rather than a literal, which cannot be baked into a
    // marker at build time. Size follows the same way, so the one head serves
    // both a track at `lineWeight` and a branch at `branchWeight`.
    const svg = renderSvg(diagram, ARROWHEADS);
    expect(svg).toContain('fill="context-stroke"');
    expect(svg).toContain('markerUnits="strokeWidth"');
  });

  it('reserves at least as much room as the same figure without heads', () => {
    const off = renderFigure(diagram);
    const on = renderFigure(diagram, ARROWHEADS);

    expect(on.width).toBeGreaterThanOrEqual(off.width);
    expect(on.height).toBeGreaterThanOrEqual(off.height);
  });

  it('grows the figure when a head reaches past what it points at', () => {
    // Half a stroke width around the route — all an undecorated edge needs —
    // would cut straight through this one, and a consumer sizing a scroll
    // container from these numbers would show that as a clipped figure.
    const off = renderFigure(diagram);
    const on = renderFigure(diagram, OVERSIZED_ARROWHEADS);

    expect(on.width).toBeGreaterThan(off.width);
    expect(on.height).toBeGreaterThan(off.height);
  });

  it('keeps every head inside the size it reports', () => {
    const cases: readonly { readonly head: Arrowhead; readonly options: SvgOptions }[] = [
      {
        head: { id: 'default', length: DEFAULT_METRICS.arrowLength, width: DEFAULT_METRICS.arrowWidth },
        options: ARROWHEADS,
      },
      { head: OVERSIZED, options: OVERSIZED_ARROWHEADS },
    ];

    for (const { head, options } of cases) {
      const figure = renderFigure(diagram, options);
      const ends = drawnEdgeEnds(figure.svg);

      expect(ends.length).toBeGreaterThan(0);
      for (const end of ends) {
        const reach = arrowheadReach(head, end.strokeWidth);
        expect(end.x - reach).toBeGreaterThanOrEqual(0);
        expect(end.x + reach).toBeLessThanOrEqual(figure.width);
        expect(end.y - reach).toBeGreaterThanOrEqual(0);
        expect(end.y + reach).toBeLessThanOrEqual(figure.height);
      }
    }
  });

  it('reaches further with a heavier line, since one head serves every weight', () => {
    const head: Arrowhead = { id: 'x', length: 2, width: 2 };
    expect(arrowheadReach(head, 8)).toBeGreaterThan(arrowheadReach(head, 4));
  });

  it('names its marker something no other figure in the document will use', async () => {
    // Two figures inlined into one page share a DOM: a fixed id would have the
    // second figure's edges resolve against the first figure's marker.
    const other = await laidOut({
      lines: [{ id: 'main', label: 'Main', color: 'token-main' }],
      nodes: [
        { id: 'a', type: 'work', label: 'a', line: 'main' },
        { id: 'b', type: 'work', label: 'b', line: 'main' },
      ],
      edges: [{ id: 'ab', type: 'flow', source: 'a', target: 'b' }],
    });

    const first = markerIdOf(renderSvg(diagram, ARROWHEADS));
    const second = markerIdOf(renderSvg(other, ARROWHEADS));

    expect(first).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('names it something a document can hold as an id', () => {
    expect(markerIdOf(renderSvg(diagram, ARROWHEADS))).toMatch(/^[A-Za-z][\w-]*$/);
  });

  it('answers the same figure with the same id every time', () => {
    // The alternative to hashing content is a counter or a random suffix, which
    // would separate two figures at the cost of a renderer that no longer
    // answers the same question the same way twice.
    expect(renderSvg(diagram, ARROWHEADS)).toBe(renderSvg(diagram, ARROWHEADS));
  });

  it('still draws a finite document with heads on and nothing to draw', async () => {
    const empty = await laidOut({ nodes: [], edges: [] });
    const figure = renderFigure(empty, ARROWHEADS);

    expect(figure.svg).not.toContain('Infinity');
    expect(figure.width).toBeGreaterThan(0);
  });
});

describe('escaping', () => {
  it('escapes markup in labels', async () => {
    const hostile = await laidOut({
      nodes: [{ id: 'a', type: 'work', label: '<script>&"bad"' }],
      edges: [],
    });

    const svg = renderSvg(hostile);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;"bad"');
  });

  it('escapes quotes in attribute values', () => {
    const svg = renderSvg(diagram, { title: 'a "quoted" title' });
    expect(svg).toContain('aria-label="a &quot;quoted&quot; title"');
  });
});
