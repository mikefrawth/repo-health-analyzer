/**
 * Unwrapping a Supabase `{ data, error }` result.
 *
 * Every write and read in the repo layer ends with the same shape: throw a
 * labelled error when Supabase reports one, otherwise hand back `data`. A
 * handful of call sites additionally tolerate one specific Postgres error
 * code — a constraint an idempotent write expects to hit on a retry or a
 * redelivered webhook event — and treat it as a no-op instead of a failure.
 * `tolerate` makes that case explicit at the call site rather than another
 * hand-rolled `if (error && error.code !== X)`.
 */

type SupabaseResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

export async function unwrap<T>(
  label: string,
  query: PromiseLike<SupabaseResult<T>>,
  options: { tolerate?: string } = {},
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    if (options.tolerate && error.code === options.tolerate) {
      return null;
    }
    throw new Error(`Could not ${label}: ${error.message}`);
  }
  return data;
}
