import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { PROJECT_STATUSES, type ProjectStatus } from "@shared/constants";
import type { MemberSummary, ProjectSummary } from "@shared/types";
import { cn } from "@/lib/utils";
import { STATUS_META } from "./meta";
import { ProjectCardBody } from "./project-card";

type Columns = Record<ProjectStatus, string[]>;

interface KanbanBoardProps {
  /** Projects to show (already filtered by search etc.). */
  projects: ProjectSummary[];
  /** Every project, unfiltered – needed to compute a column's full order when filters hide cards. */
  allProjects: ProjectSummary[];
  members: Map<string, MemberSummary>;
  /** Owners and admins can drag; members get a read-only board. */
  canEdit: boolean;
  onMove: (move: { id: string; status: ProjectStatus; orderedIds: string[] }) => void;
  onCreate: (status: ProjectStatus) => void;
}

function buildColumns(projects: ProjectSummary[]): Columns {
  const columns: Columns = { lead: [], in_progress: [], on_hold: [], completed: [], cancelled: [] };
  for (const project of [...projects].sort((a, b) => a.position - b.position)) columns[project.status].push(project.id);
  return columns;
}

const isStatus = (value: unknown): value is ProjectStatus => typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);

const CARD_CLASS =
  "cursor-pointer rounded-xl border bg-card p-3.5 shadow-soft transition-[box-shadow,border-color,opacity] duration-200 select-none hover:border-primary/30 hover:shadow-lift";

function SortableCard({ project, members }: { project: ProjectSummary; members: Map<string, MemberSummary> }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // dnd-kit swallows the click that ends a drag, so this only fires for real clicks / Enter.
      onClick={() => void navigate(`/app/projects/${project.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void navigate(`/app/projects/${project.id}`);
        else listeners?.onKeyDown?.(event);
      }}
      aria-label={`${project.title}. Press Enter to open, Space to move.`}
      className={cn(CARD_CLASS, "touch-manipulation", isDragging && "opacity-40")}
    >
      <ProjectCardBody project={project} members={members} />
    </article>
  );
}

/** Read-only card for people who can't rearrange the board: a plain link, with no drag semantics at all. */
function StaticCard({ project, members }: { project: ProjectSummary; members: Map<string, MemberSummary> }) {
  return (
    <article>
      <Link to={`/app/projects/${project.id}`} className={cn(CARD_CLASS, "block")}>
        <ProjectCardBody project={project} members={members} />
      </Link>
    </article>
  );
}

interface ColumnProps {
  status: ProjectStatus;
  projects: ProjectSummary[];
  members: Map<string, MemberSummary>;
  canEdit: boolean;
  onCreate: (status: ProjectStatus) => void;
  index: number;
}

function KanbanColumn({ status, projects, members, canEdit, onCreate, index }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      aria-label={`${meta.label}, ${projects.length} project${projects.length === 1 ? "" : "s"}`}
      className="flex w-[17.5rem] shrink-0 snap-start flex-col sm:w-72"
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className={cn("size-2 rounded-full", meta.dot)} />
          {meta.label}
          <span className="tabular rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{projects.length}</span>
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => onCreate(status)}
            aria-label={`Add project to ${meta.label}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2.5 rounded-2xl border border-transparent bg-muted/50 p-2 transition-colors duration-150",
          isOver && "border-primary/40 bg-accent/60",
        )}
      >
        <SortableContext items={projects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
          {projects.map((project) =>
            canEdit ? <SortableCard key={project.id} project={project} members={members} /> : <StaticCard key={project.id} project={project} members={members} />,
          )}
        </SortableContext>
        {projects.length === 0 && (
          <p className="flex flex-1 items-center justify-center px-3 py-6 text-center text-xs text-muted-foreground">
            {canEdit ? "Drop a project here" : "Nothing here"}
          </p>
        )}
      </div>
    </motion.section>
  );
}

/**
 * Drag-and-drop board, one column per status. Works with mouse, touch (long-press) and keyboard
 * (Space to lift, arrows to move, Space to drop). While a card is in the air the board renders from
 * local state; on drop the change is handed to `onMove`, which updates the cache optimistically.
 */
export function KanbanBoard({ projects, allProjects, members, canEdit, onMove, onCreate }: KanbanBoardProps) {
  const derived = useMemo(() => buildColumns(projects), [projects]);
  const [dragging, setDragging] = useState<{ id: string; columns: Columns } | null>(null);
  const columns = dragging?.columns ?? derived;
  const byId = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const sensors = useSensors(
    // A small distance / delay keeps plain clicks and touch-scrolling from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (cols: Columns, id: string): ProjectStatus | null => {
    if (isStatus(id)) return id;
    return PROJECT_STATUSES.find((status) => cols[status].includes(id)) ?? null;
  };

  const handleDragStart = (event: DragStartEvent) => setDragging({ id: String(event.active.id), columns: derived });

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragging((state) => {
      if (!state) return state;
      const activeId = String(active.id);
      const overId = String(over.id);
      const from = findColumn(state.columns, activeId);
      const to = findColumn(state.columns, overId);
      if (!from || !to || from === to) return state;

      // Moving across columns: take the card out of one list and insert it into the other.
      const target = state.columns[to];
      const overIndex = target.indexOf(overId);
      const insertAt = overIndex === -1 ? target.length : overIndex;
      return {
        ...state,
        columns: {
          ...state.columns,
          [from]: state.columns[from].filter((id) => id !== activeId),
          [to]: [...target.slice(0, insertAt), activeId, ...target.slice(insertAt)],
        },
      };
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const state = dragging;
    setDragging(null);
    if (!state || !over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const status = findColumn(state.columns, activeId);
    if (!status) return;

    let visibleOrder = state.columns[status];
    const from = visibleOrder.indexOf(activeId);
    const to = visibleOrder.indexOf(overId);
    if (from !== -1 && to !== -1 && from !== to) visibleOrder = arrayMove(visibleOrder, from, to);

    const original = byId.get(activeId);
    const unchanged = original?.status === status && derived[status].join() === visibleOrder.join();
    if (unchanged) return;

    // Filters may be hiding cards in this column: keep those in place and slot the moved card in
    // right before whichever visible card now follows it.
    const hidden = allProjects
      .filter((project) => project.status === status && project.id !== activeId && !visibleOrder.includes(project.id))
      .sort((a, b) => a.position - b.position)
      .map((project) => project.id);
    const fullOrder = hidden.length === 0 ? visibleOrder : mergeHidden(visibleOrder, hidden, allProjects);

    onMove({ id: activeId, status, orderedIds: fullOrder });
  };

  const activeProject = dragging ? byId.get(dragging.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        {PROJECT_STATUSES.map((status, index) => (
          <KanbanColumn
            key={status}
            status={status}
            index={index}
            projects={columns[status].map((id) => byId.get(id)).filter((project): project is ProjectSummary => project !== undefined)}
            members={members}
            canEdit={canEdit}
            onCreate={onCreate}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeProject && (
          <div className="rotate-2 cursor-grabbing rounded-xl border border-primary/40 bg-card p-3.5 shadow-pop">
            <ProjectCardBody project={activeProject} members={members} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Interleaves hidden cards back into a visible order, preserving their previous relative positions. */
function mergeHidden(visible: string[], hidden: string[], all: ProjectSummary[]): string[] {
  const position = new Map(all.map((project) => [project.id, project.position]));
  const merged = [...visible];
  for (const id of hidden) {
    const at = merged.findIndex((other) => hidden.includes(other) === false && (position.get(other) ?? 0) > (position.get(id) ?? 0));
    if (at === -1) merged.push(id);
    else merged.splice(at, 0, id);
  }
  return merged;
}
