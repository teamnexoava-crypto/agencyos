import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router";

/**
 * `useOutlet()` always returns the element for the *current* location, so during an exit animation
 * the outgoing page would instantly render the incoming route. Capturing it once per mount freezes
 * each page's content for the lifetime of its animation.
 */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

/** Top-level section of the path, so /app/projects → /app/projects/123 doesn't replay the transition. */
function transitionKey(pathname: string): string {
  return pathname.split("/").slice(0, 3).join("/");
}

/** Fade + slight slide between pages. `MotionConfig reducedMotion="user"` (main.tsx) disables the slide. */
export function PageTransition() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey(location.pathname)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      >
        <FrozenOutlet />
      </motion.div>
    </AnimatePresence>
  );
}
