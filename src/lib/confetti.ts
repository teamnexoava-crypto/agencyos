/**
 * A short celebratory burst (invoice paid, contract signed). The library is loaded on demand so it
 * costs nothing until the first celebration, and it is skipped entirely for people who prefer
 * reduced motion.
 *
 * We draw on our own canvas with `useWorker: false`: the library's default spins up a Web Worker
 * from a blob: URL, which our Content-Security-Policy (script-src 'self') rightly blocks.
 */
export async function celebrate(): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "100" });
    document.body.appendChild(canvas);

    const fire = confetti.create(canvas, { resize: true, useWorker: false });
    const colors = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899"];
    void fire({ particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.7 }, colors });
    window.setTimeout(() => void fire({ particleCount: 50, spread: 110, startVelocity: 30, origin: { y: 0.65 }, colors }), 180);
    window.setTimeout(() => canvas.remove(), 4000);
  } catch {
    /* purely decorative – never let it break the flow */
  }
}
