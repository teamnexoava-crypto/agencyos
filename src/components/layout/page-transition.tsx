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
        initial={{ opacity: 0, y: 10 }}
        // The old page leaves quickly; the new one settles in with a soft landing.
        animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
      >
        <FrozenOutlet />
      </motion.div>
    </AnimatePresence>
  );
}
