export const PORTAL_WALLPAPERS = [
  "/portal/nukhba-night.webp",
  "/portal/nukhba-dunes.webp",
  "/portal/nukhba-coast.webp",
] as const;
const sessionKey = "nukhba-screen-visit";
const previousKey = "nukhba-screen-previous";
const eventName = "nukhba-screen-wallpaper";
let initialized = false;
let snapshot: string = PORTAL_WALLPAPERS[0];

export function choosePortalWallpaper(previous: string | null, random = Math.random) {
  const choices = PORTAL_WALLPAPERS.filter(path => path !== previous);
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}
function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const stored = sessionStorage.getItem(sessionKey);
    snapshot = PORTAL_WALLPAPERS.some(path => path === stored) ? stored! : choosePortalWallpaper(localStorage.getItem(previousKey));
    sessionStorage.setItem(sessionKey, snapshot);
    localStorage.setItem(previousKey, snapshot);
  } catch { snapshot = choosePortalWallpaper(snapshot); }
}
export const getPortalWallpaper = () => snapshot;
export const getServerWallpaper = () => PORTAL_WALLPAPERS[0];
export function subscribePortalWallpaper(listener: () => void) {
  initialize();
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
// Called only after successful sign-in, never on token refresh or page navigation.
export function beginPortalVisit() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(sessionKey); } catch { /* Private browsing can disable storage. */ }
  initialized = false;
  initialize();
  window.dispatchEvent(new Event(eventName));
}
