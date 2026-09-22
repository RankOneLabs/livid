import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { layout, validateDiagram } from '../packages/core/dist/index.js';

const coreUrl = pathToFileURL(new URL('../packages/core/dist/index.js', import.meta.url).pathname).href;

async function loadFixture(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const runnable = javascript.replaceAll(
    /(['"])@rankonelabs\/livid-core\1/g,
    (_specifier, quote) => `${quote}${coreUrl}${quote}`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
}

const [{ largeScopeSpec }, { svLividRegistry, SV_LIVID_VALIDATE_OPTIONS }] = await Promise.all([
  loadFixture('../fixtures/sv-livid-v1/large-scope.ts'),
  loadFixture('../fixtures/sv-livid-v1/registry.ts'),
]);

const valid = validateDiagram(svLividRegistry, largeScopeSpec, SV_LIVID_VALIDATE_OPTIONS);
if (!valid.ok) {
  console.error(valid.error);
  process.exitCode = 1;
} else {
  const started = performance.now();
  const result = await layout(valid.value);
  const elapsed = performance.now() - started;
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    console.log(`SV-Livid v1 150-node cold layout(): ${elapsed.toFixed(1)} ms`);
  }
}
