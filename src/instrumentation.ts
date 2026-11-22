export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV !== "test"
  ) {
    const { startOfficeWorker } = await import("@/lib/virtual-office/worker");
    startOfficeWorker();
  }
}
