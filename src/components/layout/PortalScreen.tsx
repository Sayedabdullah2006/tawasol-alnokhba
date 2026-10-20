"use client";
import { useSyncExternalStore, type ReactNode, type CSSProperties } from "react";
import { getPortalWallpaper, getServerWallpaper, subscribePortalWallpaper } from "@/lib/portal-wallpaper";

const eventName = "nukhba-portal-contrast";
const readContrast = () => { try { return localStorage.getItem(eventName) === "high"; } catch { return false; } };
const subscribe = (listener: () => void) => {
  window.addEventListener(eventName, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
};

export default function PortalScreen({ children, area }: { children: ReactNode; area: "employee" | "team" | "client" | "admin" | "public" }) {
  const highContrast = useSyncExternalStore(subscribe, readContrast, () => false);
  const wallpaper = useSyncExternalStore(subscribePortalWallpaper, getPortalWallpaper, getServerWallpaper);
  return <div style={{ "--portal-wallpaper": `url('${wallpaper}')` } as CSSProperties} className={`portal-screen ${area === "public" ? "public-screen" : ""} ${highContrast ? "portal-high-contrast" : ""}`} data-portal-area={area}>
    <div className="portal-wallpaper" aria-hidden="true" />
    <button type="button" aria-pressed={highContrast} className="portal-contrast-toggle" onClick={() => { try { localStorage.setItem(eventName, highContrast ? "normal" : "high"); window.dispatchEvent(new Event(eventName)); } catch { /* Storage can be disabled by the browser. */ } }} aria-label="زيادة وضوح الخلفيات">◐<span>الوضوح</span></button>
    {children}
  </div>;
}
