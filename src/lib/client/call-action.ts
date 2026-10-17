import { unstable_rethrow } from "next/navigation";

/**
 * Calling a Server Action from the browser can fail before any answer comes
 * back: no connection, a deploy that replaced the action, a crash on the
 * server. Inside `startTransition(async …)` or a `useActionState` action,
 * React 19 rethrows that rejection while rendering and the nearest error
 * boundary replaces the whole page, taking everything the person typed with
 * it. `callAction` turns the rejection into a value the caller can show.
 *
 * Next's own control flow (a `redirect()` from the action, `notFound()`) is
 * rethrown untouched: the router handles it as before.
 */
export type ActionCall<T> = { failed: false; result: T } | { failed: true; error: unknown };

/** "No answer" for things the person can simply try again. */
export const CONNECTION_FAILED = "No hemos podido conectar. Inténtalo de nuevo.";

export async function callAction<T>(action: () => Promise<T>): Promise<ActionCall<T>> {
  try {
    return { failed: false, result: await action() };
  } catch (error) {
    unstable_rethrow(error);
    return { failed: true, error };
  }
}
