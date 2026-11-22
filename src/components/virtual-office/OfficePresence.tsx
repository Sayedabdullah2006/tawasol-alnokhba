"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  presenceView,
  type OfficePresence,
} from "@/lib/virtual-office/presence";
import s from "./office.module.css";
const Clock = createContext<number | undefined>(undefined);
export function PresenceClock({
  now,
  children,
}: {
  now?: string;
  children: ReactNode;
}) {
  const [clock, setClock] = useState({
    source: now,
    value: now ? Date.parse(now) : 0,
  });
  useEffect(() => {
    const received = Date.now(),
      server = now ? Date.parse(now) : received;
    const timer = setInterval(
      () => setClock({ source: now, value: server + Date.now() - received }),
      5000,
    );
    return () => clearInterval(timer);
  }, [now]);
  return (
    <Clock.Provider
      value={clock.source === now ? clock.value : now ? Date.parse(now) : 0}
    >
      {children}
    </Clock.Provider>
  );
}
export const usePresenceNow = () => useContext(Clock);
export default function PresenceBadge({
  presence,
}: {
  presence?: OfficePresence;
}) {
  const view = presenceView(presence, usePresenceNow());
  return (
    <span className={s.presenceBadge} data-state={view.state}>
      <i aria-hidden="true" />
      {view.label}
    </span>
  );
}
