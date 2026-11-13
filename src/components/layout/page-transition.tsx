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

/** Fade + slight slide between pages. `MotionConfig reducedMotion="user"` (main.tsx) disables the slide. */
export function PageTransition() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        // Keyed by path only: switching ?tab= inside a page must not replay the transition.
        key={location.pathname}
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
