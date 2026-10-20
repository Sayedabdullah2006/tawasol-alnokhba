"use client";
import { useEffect, useState, type ReactNode } from "react";
export default function PortalIntro({ title, eyebrow, detail, children }: { title: string; eyebrow: string; detail?: string; children?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const tick = () => setNow(new Date()); tick();
    const timer = window.setInterval(tick, 15000);
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => { clearInterval(timer); document.removeEventListener("fullscreenchange", update); };
  }, []);
  return <section className="portal-intro">
    <div className="portal-intro-copy"><p className="portal-eyebrow"><span aria-hidden />{eyebrow}</p><h1>{title}</h1>{detail && <p className="portal-intro-detail">{detail}</p>}<div className="portal-intro-actions">{children}</div></div>
    <div className="portal-time"><time dateTime={now?.toISOString()} suppressHydrationWarning>{now ? now.toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—:—"}</time><p>{now ? now.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", weekday: "long", day: "numeric", month: "long" }) : ""}</p>{now && document.fullscreenEnabled && <button type="button" aria-pressed={full} onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* The browser can disallow fullscreen; the workspace stays usable. */ } }} className="portal-fullscreen">{full ? "↙ إنهاء ملء الشاشة" : "↗ ملء الشاشة"}</button>}</div>
  </section>;
}
