import { describe, expect, it } from 'vitest';

import { type Collected, collected, err, errorsOf, isErr, isOk, ok, rejected, valuesOf } from '../src/index.js';

describe('Result', () => {
  it('narrows an ok result', () => {
    const result = ok(3);
    expect(isOk(result) && result.value).toBe(3);
  });

  it('narrows an err result', () => {
    const result = err('boom');
    expect(isErr(result) && result.error).toBe('boom');
  });
});

describe('Collected', () => {
  const batch: readonly Collected<number, string>[] = [
    collected(1),
    rejected('first failure'),
    // A value produced alongside an error: the case Result cannot express.
    collected(2, ['reportable but not fatal']),
    rejected('second failure', 'and another'),
  ];

  it('keeps the values that were produced', () => {
    expect(valuesOf(batch)).toEqual([1, 2]);
  });

  it('keeps errors from items that still produced a value', () => {
    expect(errorsOf(batch)).toContain('reportable but not fatal');
  });

  it('collects every error in encounter order', () => {
    expect(errorsOf(batch)).toEqual([
      'first failure',
      'reportable but not fatal',
      'second failure',
      'and another',
    ]);
  });

  it('defaults to no errors', () => {
    expect(collected('x').errors).toEqual([]);
  });

  it('treats an empty batch as empty on both sides', () => {
    expect(valuesOf([])).toEqual([]);
    expect(errorsOf([])).toEqual([]);
  });
});
