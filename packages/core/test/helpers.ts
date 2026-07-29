import type { StandardSchemaV1 } from '../src/index.js';

/**
 * Hand-rolled validators rather than zod. Core's claim is that it privileges
 * no validation library — testing against a library would leave that claim
 * unexercised, since a passing suite would only prove zod works.
 */
export function schema<T>(validate: (value: unknown) => StandardSchemaV1.Result<T>): StandardSchemaV1<unknown, T> {
  return { '~standard': { version: 1, vendor: 'livid-test', validate } };
}

/** Accepts anything, including absent detail. */
export const anything = schema<unknown>((value) => ({ value: value ?? null }));

/** Requires an object with `field` holding a string. */
export function objectWithString(field: string): StandardSchemaV1<unknown, Record<string, unknown>> {
  return schema((value) => {
    if (typeof value !== 'object' || value === null) {
      return { issues: [{ message: 'expected an object', path: [] }] };
    }
    const bag = value as Record<string, unknown>;
    if (typeof bag[field] !== 'string') {
      return { issues: [{ message: 'expected string', path: [{ key: field }] }] };
    }
    return { value: bag };
  });
}

/** Returns a promise, which core rejects rather than awaiting. */
export const asyncSchema = schema<unknown>(
  (value) => Promise.resolve({ value }) as unknown as StandardSchemaV1.Result<unknown>,
);

/** Throws instead of returning issues — validators are foreign code. */
export const throwingSchema = schema<unknown>(() => {
  throw new Error('refinement exploded');
});
