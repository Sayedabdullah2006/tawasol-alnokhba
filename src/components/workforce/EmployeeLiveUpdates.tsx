"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasUnsavedWorkforceChanges } from "./shared";
export default function EmployeeLiveUpdates() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (!hasUnsavedWorkforceChanges() && !document.querySelector('dialog[open],[role="dialog"]')) router.refresh(); };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, [router]);
  return null;
}
