"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { runCanvasAgentCommand } from "@/agent/canvasAgent";
import { PostliminalCanvas } from "@/components/canvas/PostliminalCanvas";
import { useProjectStore } from "@/store/projectStore";

declare global {
  interface Window {
    postliminal?: {
      runCommand: (message: string) => string;
      exportProject: () => string;
      resetProject: () => void;
    };
  }
}

function ProjectSelectionPage({ onOpenCanvas }: { onOpenCanvas: () => void }) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const switchProject = useProjectStore((state) => state.switchProject);
  const createProject = useProjectStore((state) => state.createProject);

  const openProject = (projectId: string) => {
    switchProject(projectId);
    onOpenCanvas();
  };

  const createNewProject = () => {
    const title = window.prompt("Project name", "Untitled project");
    if (!title) return;
    createProject(title);
    onOpenCanvas();
  };

  return (
    <main className="h-screen bg-[#111114] bg-[radial-gradient(circle,rgba(160,160,170,0.28)_1.1px,transparent_1.2px)] bg-[size:60px_60px] text-zinc-100">
      <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-zinc-100 text-sm font-semibold text-zinc-950">
            P
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">Postliminal</div>
            <div className="text-xs text-zinc-500">Projects</div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <button
            className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-[#242428] px-3 text-sm text-zinc-100 transition hover:bg-[#303036]"
            onClick={createNewProject}
          >
            <Plus className="h-4 w-4" />
            New project
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {projects.map((project) => (
            <button
              key={project.projectId}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#242428]/95 px-4 py-4 text-left transition hover:border-white/20 hover:bg-[#2d2d32]"
              onClick={() => openProject(project.projectId)}
            >
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  {project.title}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Updated {new Date(project.updatedAt).toLocaleString()}
                </div>
              </div>
              {project.projectId === activeProjectId ? (
                <span className="rounded-full border border-emerald-300/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
                  Current
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

export function PostliminalApp() {
  const hydrateProject = useProjectStore((state) => state.hydrateProject);
  const exportProject = useProjectStore((state) => state.exportProject);
  const resetProject = useProjectStore((state) => state.resetProject);
  const [view, setView] = useState<"canvas" | "projects">("canvas");

  useEffect(() => {
    hydrateProject();
  }, [hydrateProject]);

  useEffect(() => {
    window.postliminal = {
      runCommand: runCanvasAgentCommand,
      exportProject,
      resetProject,
    };

    const runCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        runCanvasAgentCommand(detail.message);
      }
    };

    window.addEventListener("postliminal:command", runCommand);
    return () => {
      window.removeEventListener("postliminal:command", runCommand);
      delete window.postliminal;
    };
  }, [exportProject, resetProject]);

  return (
    <div className="h-screen overflow-hidden bg-night text-zinc-100">
      {view === "projects" ? (
        <ProjectSelectionPage onOpenCanvas={() => setView("canvas")} />
      ) : (
        <main className="h-screen min-h-0">
          <PostliminalCanvas onOpenProjects={() => setView("projects")} />
        </main>
      )}
    </div>
  );
}
