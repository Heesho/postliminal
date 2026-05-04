"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { runCanvasAgentCommand } from "@/agent/canvasAgent";
import { PostliminalCanvas } from "@/components/canvas/PostliminalCanvas";
import {
  appendPostLiminalLogoPrompts,
  createPostLiminalLogoSession,
} from "@/lib/logoSession";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";

const LOGO_SESSION_VERSION = "v10";
const LOGO_SESSION_STORAGE_KEY = "postliminal.logoSession.loadedVersion";
const LOGO_PROMPT_EXPANSION_VERSION = "v6";
const LOGO_PROMPT_EXPANSION_STORAGE_KEY =
  "postliminal.logoSession.promptExpansionVersion";
const IMAGE_QUALITY_DEFAULT_VERSION = "v1";
const IMAGE_QUALITY_DEFAULT_STORAGE_KEY =
  "postliminal.imageGeneration.defaultQualityVersion";

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
    <main className="postliminal-surface relative h-screen overflow-hidden text-white/[0.92]">
      <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center">
            <span className="postliminal-mark" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/[0.92]">PostLiminal</div>
            <div className="text-xs text-white/[0.50]">Projects</div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <button
            className="flex h-10 items-center gap-2 rounded-[14px] border border-white/[0.10] bg-white/[0.07] px-3 text-sm text-white/[0.9] shadow-xl backdrop-blur-2xl transition hover:border-white/[0.20] hover:bg-white/[0.10]"
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
              className="flex items-center justify-between rounded-[18px] border border-white/[0.10] bg-white/[0.06] px-4 py-4 text-left shadow-xl backdrop-blur-2xl transition hover:border-white/[0.20] hover:bg-white/[0.09]"
              onClick={() => openProject(project.projectId)}
            >
              <div>
                <div className="text-sm font-medium text-white/[0.9]">
                  {project.title}
                </div>
                <div className="mt-1 text-xs text-white/[0.50]">
                  Updated {new Date(project.updatedAt).toLocaleString()}
                </div>
              </div>
              {project.projectId === activeProjectId ? (
                <span className="rounded-[999px] border border-[#6aa6ff]/[24%] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6aa6ff]">
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
  const hasHydrated = useProjectStore((state) => state.hasHydrated);
  const project = useProjectStore((state) => state.project);
  const loadProject = useProjectStore((state) => state.loadProject);
  const updateNode = useProjectStore((state) => state.updateNode);
  const exportProject = useProjectStore((state) => state.exportProject);
  const resetProject = useProjectStore((state) => state.resetProject);
  const logoSessionVersion = LOGO_SESSION_VERSION;
  const logoPromptExpansionVersion = LOGO_PROMPT_EXPANSION_VERSION;
  const staleRunsClearedRef = useRef(false);
  const staleOutputsCleanedProjectRef = useRef("");
  const [view, setView] = useState<"canvas" | "projects">("canvas");

  useEffect(() => {
    hydrateProject();
  }, [hydrateProject]);

  useEffect(() => {
    if (!hasHydrated) return;

    const loadedVersion = window.localStorage.getItem(LOGO_SESSION_STORAGE_KEY);
    if (loadedVersion === logoSessionVersion) return;

    loadProject(createPostLiminalLogoSession(project.projectId));
    window.localStorage.setItem(LOGO_SESSION_STORAGE_KEY, logoSessionVersion);
  }, [hasHydrated, loadProject, logoSessionVersion, project.projectId]);

  useEffect(() => {
    if (!hasHydrated || staleRunsClearedRef.current) return;
    staleRunsClearedRef.current = true;

    project.nodes
      .filter(
        (node) =>
          node.type === "image_generation" && node.data.status === "running",
      )
      .forEach((node) => {
        updateNode(
          node.id,
          {
            data: {
              status: "error",
              lastRunError: "Previous image generation did not finish.",
            },
          },
          "human",
        );
      });
  }, [hasHydrated, project.nodes, updateNode]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (staleOutputsCleanedProjectRef.current === project.projectId) return;
    staleOutputsCleanedProjectRef.current = project.projectId;

    const updatedAt = new Date().toISOString();
    let changed = false;
    const nodes = project.nodes.map((node) => {
      if (node.type !== "image_generation") return node;

      const generatedImageUrls = Array.isArray(node.data.generatedImageUrls)
        ? node.data.generatedImageUrls.filter(
            (imageUrl): imageUrl is string => typeof imageUrl === "string",
          )
        : [];
      const generatedImageCount =
        typeof node.data.generatedImageCount === "number" &&
        Number.isFinite(node.data.generatedImageCount)
          ? node.data.generatedImageCount
          : generatedImageUrls.length;

      if (generatedImageCount === generatedImageUrls.length) return node;

      changed = true;
      const data: NodeData = {
        ...node.data,
        generatedImageCount: generatedImageUrls.length,
        generatedImageUrls,
      };

      if (generatedImageUrls.length === 0) {
        delete data.generatedImageMetadata;
        if (data.status === "completed") {
          data.status = "idle";
        }
      }

      return {
        ...node,
        data,
        updatedAt,
      };
    });

    if (changed) {
      loadProject({ ...project, nodes, updatedAt });
    }
  }, [hasHydrated, loadProject, project]);

  useEffect(() => {
    if (!hasHydrated) return;

    const storageKey = `${IMAGE_QUALITY_DEFAULT_STORAGE_KEY}.${project.projectId}`;
    if (window.localStorage.getItem(storageKey) === IMAGE_QUALITY_DEFAULT_VERSION) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const nodes = project.nodes.map((node) =>
      node.type === "image_generation" && node.data.quality !== "medium"
        ? {
            ...node,
            data: {
              ...node.data,
              quality: "medium",
            },
            updatedAt,
          }
        : node,
    );

    window.localStorage.setItem(storageKey, IMAGE_QUALITY_DEFAULT_VERSION);

    if (nodes.some((node, index) => node !== project.nodes[index])) {
      loadProject({ ...project, nodes, updatedAt });
    }
  }, [hasHydrated, loadProject, project]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (project.title !== "PostLiminal Logo Lab") return;

    const loadedVersion = window.localStorage.getItem(
      LOGO_PROMPT_EXPANSION_STORAGE_KEY,
    );
    if (loadedVersion === logoPromptExpansionVersion) return;

    const expandedProject = appendPostLiminalLogoPrompts(project);
    window.localStorage.setItem(
      LOGO_PROMPT_EXPANSION_STORAGE_KEY,
      logoPromptExpansionVersion,
    );

    if (expandedProject !== project) {
      loadProject(expandedProject);
    }
  }, [hasHydrated, loadProject, logoPromptExpansionVersion, project]);

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
    <div className="h-screen overflow-hidden bg-night text-white/[0.92]">
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
