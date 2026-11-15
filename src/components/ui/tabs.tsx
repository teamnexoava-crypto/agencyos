import * as React from "react";
import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** The active tab's value and a per-instance id, so each tab strip animates its own underline. */
const TabsContext = React.createContext<{ value: string | undefined; id: string }>({ value: undefined, id: "" });

function Tabs({ className, value, defaultValue, onValueChange, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const id = React.useId();
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  return (
    <TabsContext.Provider value={{ value: current, id }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-6", className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setInternal(next);
          onValueChange?.(next);
        }}
        {...props}
      />
    </TabsContext.Provider>
  );
}

/**
 * Underlined tab strip; scrolls horizontally on small screens instead of wrapping. The scrollbar is
 * hidden, so an edge with more tabs past it fades out (see `data-fade-*` in index.css) – otherwise
 * nothing tells a phone user that there is anything to swipe to.
 */
function TabsList({ className, ref, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const strip = React.useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const update = () => {
      const hidden = node.scrollWidth - node.clientWidth;
      const next = { start: node.scrollLeft > 1, end: node.scrollLeft < hidden - 1 };
      setFade((current) => (current.start === next.start && current.end === next.end ? current : next));
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    // The strip's own width changes with the window; its content width changes as tab counters load.
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const setRef = (node: HTMLDivElement | null) => {
    strip.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <TabsPrimitive.List
      ref={setRef}
      data-slot="tabs-list"
      data-fade-start={fade.start || undefined}
      data-fade-end={fade.end || undefined}
      className={cn("-mx-4 flex gap-1 overflow-x-auto border-b px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, children, value, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const tabs = React.useContext(TabsContext);
  const active = tabs.value === value;
  const ref = React.useRef<HTMLButtonElement>(null);

  // On a phone the strip scrolls sideways: make sure the open tab is never hidden off-screen.
  React.useEffect(() => {
    const tab = ref.current;
    const strip = tab?.parentElement;
    if (!active || !tab || !strip || strip.scrollWidth <= strip.clientWidth) return;
    // Scroll the strip itself (never the page) so the tab sits in the middle.
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200",
        "hover:text-foreground data-[state=active]:text-foreground",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      {active && (
        // One shared underline that glides from the previous tab to this one.
        <motion.span layoutId={`tabs-underline-${tabs.id}`} data-slot="tabs-underline" aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" transition={{ type: "spring", stiffness: 520, damping: 42 }} />
      )}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none data-[state=active]:animate-in data-[state=active]:duration-300 data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
