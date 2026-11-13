import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { LEAD_STAGES, type LeadStage } from "@shared/constants";
import type { LeadDTO, MemberSummary } from "@shared/types";
import { formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadCardBody } from "./lead-card";
import { STAGE_META } from "./meta";

const CARD_CLASS = "w-full cursor-pointer rounded-xl border bg-card p-3.5 text-left shadow-soft transition-[box-shadow,border-color,opacity] duration-200 select-none hover:border-primary/30 hover:shadow-lift";
const isStage = (value: unknown): value is LeadStage => typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);

interface CardProps {
  lead: LeadDTO;
  members: Map<string, MemberSummary>;
  currency: string;
  today: string;
  onOpen: (id: string) => void;
}

function DraggableCard({ lead, members, currency, today, onOpen }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      // dnd-kit announces drag instructions itself; the visible name is the lead.
      aria-label={`${lead.name}${lead.company ? `, ${lead.company}` : ""}. Open lead.`}
      onClick={() => onOpen(lead.id)}
      className={cn(CARD_CLASS, isDragging && "opacity-40")}
    >
      <LeadCardBody lead={lead} assignee={lead.assigneeId ? members.get(lead.assigneeId) : undefined} currency={currency} today={today} />
    </button>
  );
}

function Column({ stage, leads, showValue, currency, children }: { stage: LeadStage; leads: LeadDTO[]; showValue: boolean; currency: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = leads.reduce((sum, lead) => sum + (lead.value ?? 0), 0);
  return (
    <section aria-label={`${STAGE_META[stage].label}, ${leads.length} leads`} className="flex w-[17rem] shrink-0 flex-col">
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <span aria-hidden="true" className={cn("size-2 rounded-full", STAGE_META[stage].dot)} />
        <h3 className="text-sm font-semibold">{STAGE_META[stage].label}</h3>
        <span className="tabular text-xs text-muted-foreground">{leads.length}</span>
        {showValue && total > 0 && <span className="tabular ml-auto text-xs font-medium text-muted-foreground">{formatMoneyCompact(total, currency)}</span>}
      </header>
      <div ref={setNodeRef} className={cn("flex min-h-32 flex-1 flex-col gap-2.5 rounded-2xl border border-dashed border-transparent bg-muted/40 p-2 transition-colors", isOver && "border-primary/50 bg-primary/5")}>
        {children}
        {leads.length === 0 && <p className="m-auto px-3 py-6 text-center text-xs text-muted-foreground">Drop a lead here</p>}
      </div>
    </section>
  );
}

interface LeadBoardProps {
  leads: LeadDTO[];
  members: Map<string, MemberSummary>;
  currency: string;
  today: string;
  showValue: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: LeadStage) => void;
}

/** The pipeline as columns. Drag a lead to another stage, or click it to open it. */
export function LeadBoard({ leads, members, currency, today, showValue, onOpen, onMove }: LeadBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // A small movement threshold keeps a plain click a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const active = leads.find((lead) => lead.id === activeId);

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const lead = leads.find((item) => item.id === dragged.id);
    if (lead && over && isStage(over.id) && over.id !== lead.stage) onMove(lead.id, over.id);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={({ active: dragged }) => setActiveId(String(dragged.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {LEAD_STAGES.map((stage) => {
          const column = leads.filter((lead) => lead.stage === stage);
          return (
            <Column key={stage} stage={stage} leads={column} showValue={showValue} currency={currency}>
              {column.map((lead) => (
                <DraggableCard key={lead.id} lead={lead} members={members} currency={currency} today={today} onOpen={onOpen} />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>
        {active && (
          <div className={cn(CARD_CLASS, "rotate-2 cursor-grabbing shadow-lift")}>
            <LeadCardBody lead={active} assignee={active.assigneeId ? members.get(active.assigneeId) : undefined} currency={currency} today={today} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
