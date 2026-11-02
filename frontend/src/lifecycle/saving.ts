import { flushPreferences } from "./preferences";
const participants = new Set<() => Promise<void>>();
const pending = new Set<Promise<unknown>>();
export function trackWrite<T>(task: Promise<T>): Promise<T> { pending.add(task); void task.then(() => pending.delete(task), () => pending.delete(task)); return task; }
export function registerLifecycleSave(save: () => Promise<void>) { participants.add(save); return () => { participants.delete(save); }; }
export async function saveBeforeLifecycleChange() {
  const failures: unknown[] = [];
  const collect = (results: PromiseSettledResult<unknown>[]) => {
    for (const result of results) if (result.status === "rejected") failures.push(result.reason);
  };
  collect(await Promise.allSettled([...participants].map(save => Promise.resolve().then(save))));
  while (pending.size) collect(await Promise.allSettled([...pending]));
  try { await flushPreferences(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, failures.map(String).join("; "));
}
