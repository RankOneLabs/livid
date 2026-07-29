/**
 * Project-local Result. Every fallible transform in core returns one; callers
 * narrow on `ok`. Exceptions are reserved for IO boundaries, of which core has
 * none.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } {
  return !result.ok;
}

/**
 * A partial outcome: a value that may still have been produced alongside
 * errors, unlike `Result` which is strictly one or the other.
 *
 * Validation needs this because some problems are reportable without
 * preventing the item from being built — a node referencing an undeclared
 * line is still a node. Reporting it and continuing is what lets one pass
 * surface every problem rather than the first.
 */
export interface Collected<T, E> {
  readonly value: T | null;
  readonly errors: readonly E[];
}

export function collected<T, E>(value: T | null, errors: readonly E[] = []): Collected<T, E> {
  return { value, errors };
}

export function rejected<T, E>(...errors: readonly E[]): Collected<T, E> {
  return { value: null, errors };
}

/** The values that were produced, dropping the ones that could not be. */
export function valuesOf<T, E>(items: readonly Collected<T, E>[]): readonly T[] {
  return items.flatMap((item) => (item.value === null ? [] : [item.value]));
}

/** Every error across the collection, in encounter order. */
export function errorsOf<T, E>(items: readonly Collected<T, E>[]): readonly E[] {
  return items.flatMap((item) => item.errors);
}
