"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DepartmentId } from "@/lib/virtual-office/departments";
import type {
  CoordinationSnapshot,
  OfficeInteraction,
  OfficeMotion,
} from "@/lib/virtual-office/coordination";
const endpoint = "/api/workforce/office-coordination";
export function useOfficeCoordination(department: DepartmentId) {
  const [data, setData] = useState<CoordinationSnapshot | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState<OfficeInteraction | null>(null),
    [motion, setMotion] = useState<OfficeMotion | null>(null),
    [task, setTask] = useState("");
  const viewer = useRef(""),
    seen = useRef<string[]>([]),
    queue = useRef<OfficeInteraction[]>([]),
    current = useRef<OfficeMotion | null>(null),
    loading = useRef<number | null>(null),
    mutating = useRef(false),
    generation = useRef(0),
    alive = useRef(true);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const start = useCallback((event: OfficeInteraction, replay = false) => {
    const value = {
      ...event,
      runId: `${event.key}:${replay ? crypto.randomUUID() : "auto"}`,
    };
    current.current = value;
    setMotion(value);
    if (!seen.current.includes(event.key))
      seen.current = [...seen.current, event.key].slice(-512);
    try {
      localStorage.setItem(
        `vo-coordination:${viewer.current}`,
        JSON.stringify(seen.current),
      );
    } catch {
      /* Reading the work feed still works without local storage. */
    }
  }, []);
  const finish = useCallback(
    (runId: string) => {
      if (current.current?.runId !== runId) return;
      current.current = null;
      setMotion(null);
      const next = queue.current.shift();
      if (next) start(next);
    },
    [start],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (loading.current !== null || mutating.current) return null;
      const version = ++generation.current;
      loading.current = version;
      try {
        const params = new URLSearchParams({ department });
        if (task) params.set("task", task);
        const r = await fetch(`${endpoint}?${params}`, {
            cache: "no-store",
            signal,
          }),
          snapshot = await r.json();
        if (!r.ok) throw Error(snapshot.error || "تعذر تحديث تواصل الفريق");
        if (signal?.aborted || !alive.current || version !== generation.current)
          return null;
        const next = snapshot as CoordinationSnapshot;
        setData(next);
        setError("");
        if (viewer.current !== next.viewerId) {
          viewer.current = next.viewerId;
          try {
            const saved = JSON.parse(
              localStorage.getItem(`vo-coordination:${next.viewerId}`) || "[]",
            );
            seen.current = Array.isArray(saved)
              ? saved.filter((v) => typeof v === "string").slice(-512)
              : [];
          } catch {
            seen.current = [];
          }
        }
        const eligible = next.interactions.filter(
          (e) =>
            !["cancelled", "rejected"].includes(e.state) &&
            (e.kind === "morning" ||
              Date.parse(next.now) - Date.parse(e.at) < 86400000),
        );
        queue.current = queue.current.filter((e) =>
          eligible.some((x) => x.key === e.key),
        );
        for (const event of [
          ...eligible.filter((e) => e.kind === "morning"),
          ...eligible.filter((e) => e.kind !== "morning"),
        ].slice(0, 12))
          if (
            !seen.current.includes(event.key) &&
            !queue.current.some((e) => e.key === event.key) &&
            current.current?.key !== event.key
          )
            queue.current.push(event);
        if (current.current) {
          const newer = eligible.find(
            (e) =>
              e.id === current.current?.id && e.key !== current.current?.key,
          );
          if (newer) {
            queue.current = queue.current.filter((e) => e.key !== newer.key);
            start(newer);
          }
        } else {
          const event = queue.current.shift();
          if (event) start(event);
        }
        return next;
      } catch (e) {
        if (!signal?.aborted && alive.current)
          setError(e instanceof Error ? e.message : "تعذر تحديث تواصل الفريق");
        return null;
      } finally {
        if (loading.current === version) loading.current = null;
      }
    },
    [department, task, start],
  );
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const initial=setTimeout(()=>void refresh(controller.signal),0);
    const update = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("workforce-data-changed", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive.current = false;
      controller.abort();
      loading.current = null;
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("workforce-data-changed", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  const command = useCallback(
    async (
      command: string,
      id: string | null,
      version: number | null,
      payload: Record<string, unknown>,
    ) => {
      if (mutating.current) return null;
      mutating.current = true;
      setPending(true);
      setError("");
      ++generation.current;
      loading.current = null;
      const signature = JSON.stringify({ command, id, version, payload });
      if (submission.current?.signature !== signature)
        submission.current = { signature, key: crypto.randomUUID() };
      try {
        const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              command,
              id,
              version,
              payload,
              requestKey: submission.current.key,
            }),
          }),
          result = await r.json();
        if (!r.ok) throw Error(result.error || "تعذر حفظ التنسيق");
        submission.current = null;
        return result as {
          id: string;
          version: number;
          nextTaskId: string | null;
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر حفظ التنسيق");
        return null;
      } finally {
        mutating.current = false;
        setPending(false);
        void refresh();
      }
    },
    [refresh],
  );
  return {
    data,
    error,
    pending,
    selected,
    motion,
    task,
    setTask,
    open: setSelected,
    play: (event: OfficeInteraction) => start(event, true),
    finish,
    refresh,
    command,
  };
}
export type OfficeCoordinationControl = ReturnType<
  typeof useOfficeCoordination
>;
