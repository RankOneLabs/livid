import { beforeAll, describe, expect, it } from 'vitest';

import type { LaidOutDiagram } from '@rankonelabs/livid-core';

import { DEFAULT_PALETTE, labelPlacementOf, lineColour, renderSvg } from '../src/index.js';
import { type TestRegistry, attributeValues, laidOut } from './helpers.js';

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
