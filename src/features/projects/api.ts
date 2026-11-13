import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ProjectStatus } from "@shared/constants";
import type { ProjectInput, ProjectUpdateInput, StepInput, StepUpdateInput, TaskInput, TaskUpdateInput } from "@shared/schemas/project";
import type { ProjectDetail, ProjectSummary, StepDTO, TaskDTO } from "@shared/types";
import { api } from "@/lib/api";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

/** Recomputes the derived counters after a local (optimistic) change to steps or tasks. */
function withCounts(project: ProjectDetail): ProjectDetail {
  const stepsDone = project.steps.filter((step) => step.status === "completed").length;
  return {
    ...project,
    stepCount: project.steps.length,
    stepsDone,
    progress: project.steps.length === 0 ? 0 : Math.round((stepsDone / project.steps.length) * 100),
    taskCount: project.tasks.length,
    tasksDone: project.tasks.filter((task) => task.done).length,
  };
}

function patchDetail(queryClient: QueryClient, projectId: string, update: (project: ProjectDetail) => ProjectDetail) {
  queryClient.setQueryData<ProjectDetail>(projectKeys.detail(projectId), (project) => (project ? withCounts(update(project)) : project));
}

/** After any change inside a project, lists that show its progress / counts need a refresh. */
function refreshLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: projectKeys.all, exact: true });
  void queryClient.invalidateQueries({ queryKey: ["clients"] });
}

/* ------------------------------------------------------------------------------------------------ projects */

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async ({ signal }) => (await api<{ projects: ProjectSummary[] }>("/api/projects", { signal })).projects,
  });
}

export function useProject(id: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async ({ signal }) => (await api<{ project: ProjectDetail }>(`/api/projects/${id}`, { signal })).project,
    enabled,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput) => (await api<{ project: ProjectDetail }>("/api/projects", { method: "POST", json: input })).project,
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project);
      refreshLists(queryClient);
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectUpdateInput) =>
      (await api<{ project: ProjectDetail }>(`/api/projects/${id}`, { method: "PATCH", json: input })).project,
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      refreshLists(queryClient);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ProjectSummary[]>(projectKeys.all, (list) => list?.filter((item) => item.id !== id));
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      refreshLists(queryClient);
    },
  });
}

interface MoveVariables {
  id: string;
  status: ProjectStatus;
  /** Full order of the destination column after the drop. */
  orderedIds: string[];
}

/** Kanban drop. The board is updated optimistically and rolled back if the server refuses. */
export function useMoveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, orderedIds }: MoveVariables) =>
      api<{ ok: true }>(`/api/projects/${id}/move`, { method: "POST", json: { status, orderedIds } }),
    onMutate: async ({ id, status, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all, exact: true });
      const previous = queryClient.getQueryData<ProjectSummary[]>(projectKeys.all);
      const order = new Map(orderedIds.map((projectId, index) => [projectId, index]));
      queryClient.setQueryData<ProjectSummary[]>(projectKeys.all, (list) =>
        list
          ?.map((item) => {
            const moved = item.id === id ? { ...item, status } : item;
            const position = moved.status === status ? order.get(moved.id) : undefined;
            return position === undefined ? moved : { ...moved, position };
          })
          .sort((a, b) => a.position - b.position),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(projectKeys.all, context.previous);
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all, exact: true });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

export function useSetProjectMembers(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberIds: string[]) =>
      (await api<{ project: ProjectDetail }>(`/api/projects/${projectId}/members`, { method: "PUT", json: { memberIds } })).project,
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(projectId), project);
      refreshLists(queryClient);
    },
  });
}

/* ------------------------------------------------------------------------------------------------ steps */

export function useCreateStep(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StepInput) =>
      (await api<{ step: StepDTO }>(`/api/projects/${projectId}/steps`, { method: "POST", json: input })).step,
    onSuccess: (step) => {
      patchDetail(queryClient, projectId, (project) => ({ ...project, steps: [...project.steps, step] }));
      refreshLists(queryClient);
    },
  });
}

export function useUpdateStep(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, input }: { stepId: string; input: StepUpdateInput }) =>
      (await api<{ step: StepDTO }>(`/api/projects/${projectId}/steps/${stepId}`, { method: "PATCH", json: input })).step,
    // Optimistic for the fast interactions (status toggle); the server response then replaces it.
    onMutate: async ({ stepId, input }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(projectId) });
      const previous = queryClient.getQueryData<ProjectDetail>(projectKeys.detail(projectId));
      if (input.status !== undefined) {
        const status = input.status;
        patchDetail(queryClient, projectId, (project) => ({
          ...project,
          steps: project.steps.map((step) => (step.id === stepId ? { ...step, status } : step)),
        }));
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(projectKeys.detail(projectId), context.previous);
    },
    onSuccess: (step) => {
      patchDetail(queryClient, projectId, (project) => ({ ...project, steps: project.steps.map((item) => (item.id === step.id ? step : item)) }));
      refreshLists(queryClient);
    },
  });
}

export function useDeleteStep(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => api<{ ok: true }>(`/api/projects/${projectId}/steps/${stepId}`, { method: "DELETE" }),
    onSuccess: (_data, stepId) => {
      patchDetail(queryClient, projectId, (project) => ({ ...project, steps: project.steps.filter((step) => step.id !== stepId) }));
      refreshLists(queryClient);
    },
  });
}

export function useReorderSteps(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => api<{ ok: true }>(`/api/projects/${projectId}/steps/order`, { method: "PUT", json: { orderedIds } }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(projectId) });
      const previous = queryClient.getQueryData<ProjectDetail>(projectKeys.detail(projectId));
      const order = new Map(orderedIds.map((id, index) => [id, index]));
      patchDetail(queryClient, projectId, (project) => ({
        ...project,
        steps: [...project.steps]
          .map((step) => ({ ...step, position: order.get(step.id) ?? step.position }))
          .sort((a, b) => a.position - b.position),
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(projectKeys.detail(projectId), context.previous);
    },
  });
}

/* ------------------------------------------------------------------------------------------------ tasks */

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) =>
      (await api<{ task: TaskDTO }>(`/api/projects/${projectId}/tasks`, { method: "POST", json: input })).task,
    onSuccess: (task) => {
      patchDetail(queryClient, projectId, (project) => ({ ...project, tasks: [...project.tasks, task] }));
      refreshLists(queryClient);
    },
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, input }: { taskId: string; input: TaskUpdateInput }) =>
      (await api<{ task: TaskDTO }>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", json: input })).task,
    // Optimistic: ticking a checkbox must feel instant.
    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(projectId) });
      const previous = queryClient.getQueryData<ProjectDetail>(projectKeys.detail(projectId));
      patchDetail(queryClient, projectId, (project) => ({
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...(input.title !== undefined && { title: input.title }),
                ...(input.done !== undefined && { done: input.done }),
                ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId === "" ? null : input.assigneeId }),
                ...(input.dueDate !== undefined && { dueDate: input.dueDate === "" ? null : input.dueDate }),
              }
            : task,
        ),
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(projectKeys.detail(projectId), context.previous);
    },
    onSuccess: (task) => {
      patchDetail(queryClient, projectId, (project) => ({ ...project, tasks: project.tasks.map((item) => (item.id === task.id ? task : item)) }));
      refreshLists(queryClient);
    },
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api<{ ok: true }>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.detail(projectId) });
      const previous = queryClient.getQueryData<ProjectDetail>(projectKeys.detail(projectId));
      patchDetail(queryClient, projectId, (project) => ({ ...project, tasks: project.tasks.filter((task) => task.id !== taskId) }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(projectKeys.detail(projectId), context.previous);
    },
    onSettled: () => refreshLists(queryClient),
  });
}
