"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { runCanvasAgentCommand } from "@/agent/canvasAgent";
import { PostliminalCanvas } from "@/components/canvas/PostliminalCanvas";
import {
  appendPostLiminalLogoPrompts,
  appendSelectedLogoYellowBranch,
  createPostLiminalLogoSession,
} from "@/lib/logoSession";
import {
  listSavedGeneratedImages,
  waitForSavedGeneratedImages,
} from "@/lib/imageGenerationClient";
import { useProjectStore } from "@/store/projectStore";
import type { NodeData } from "@/types/project";

const LOGO_SESSION_VERSION = "v10";
const LOGO_SESSION_STORAGE_KEY = "postliminal.logoSession.loadedVersion";
const LOGO_PROMPT_EXPANSION_VERSION = "v11";
const LOGO_PROMPT_EXPANSION_STORAGE_KEY =
  "postliminal.logoSession.promptExpansionVersion";
const IMAGE_QUALITY_DEFAULT_VERSION = "v1";
const IMAGE_QUALITY_DEFAULT_STORAGE_KEY =
  "postliminal.imageGeneration.defaultQualityVersion";
const LOGO_YELLOW_BRANCH_VERSION = "v3";
const LOGO_YELLOW_BRANCH_STORAGE_KEY =
  "postliminal.logoSession.yellowBranchVersion";

declare global {
  interface Window {
    postliminal?: {
      runCommand: (message: string) => string;
      exportProject: () => string;
      resetProject: () => void;
    };
  }
}

function imageUrlsFromData(data: NodeData) {
  return Array.isArray(data.generatedImageUrls)
    ? data.generatedImageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string",
      )
    : [];
}

function isInlineImageUrl(imageUrl: string) {
  return imageUrl.startsWith("data:image/");
}

function isLogoLabProject(project: { projectId: string; title: string }) {
  return (
    project.projectId === "postliminal" ||
    project.title === "PostLiminal Logo Lab" ||
    project.title === "Logo Lab"
  );
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
  const createImageOutputs = useProjectStore((state) => state.createImageOutputs);
  const exportProject = useProjectStore((state) => state.exportProject);
  const resetProject = useProjectStore((state) => state.resetProject);
  const logoSessionVersion = LOGO_SESSION_VERSION;
  const logoPromptExpansionVersion = LOGO_PROMPT_EXPANSION_VERSION;
  const logoYellowBranchVersion = LOGO_YELLOW_BRANCH_VERSION;
  const staleRunsRecoveredProjectIdsRef = useRef(new Set<string>());
  const savedImageSyncChecksRef = useRef(new Set<string>());
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
    if (!hasHydrated) return;
    if (staleRunsRecoveredProjectIdsRef.current.has(project.projectId)) return;
    staleRunsRecoveredProjectIdsRef.current.add(project.projectId);

    project.nodes
      .filter(
        (node) =>
          node.type === "image_generation" &&
          (node.data.status === "running" ||
            node.data.status === "queued" ||
            node.data.lastRunError === "Failed to fetch"),
      )
      .forEach((node) => {
        if (node.data.status === "queued") {
          updateNode(
            node.id,
            {
              data: {
                status: "error",
                runMessage: "",
                runStartedAt: undefined,
                lastRunError:
                  "Generation was queued before a refresh. Run it again.",
              },
            },
            "human",
          );
          return;
        }

        const runStartedAt =
          typeof node.data.runStartedAt === "number" &&
          Number.isFinite(node.data.runStartedAt)
            ? node.data.runStartedAt
            : 0;

        if (!runStartedAt) {
          updateNode(
            node.id,
            {
              data: {
                status: "error",
                runMessage: "",
                runStartedAt: undefined,
                lastRunError:
                  "Generation was interrupted by a refresh. Run it again.",
              },
            },
            "human",
          );
          return;
        }

        updateNode(
          node.id,
          {
            data: {
              runMessage: "Restoring interrupted generation...",
              lastRunError: "",
            },
          },
          "human",
        );

        void waitForSavedGeneratedImages({
          projectId: project.projectId,
          generationNodeId: node.id,
          since: runStartedAt,
        })
          .then((images) => {
            if (images.length > 0) {
              createImageOutputs(node.id, images, "human", {
                apiSize:
                  typeof node.data.resolution === "string"
                    ? node.data.resolution
                    : undefined,
              });
              updateNode(
                node.id,
                {
                  data: {
                    lastRunError: "",
                    runMessage: "",
                    runStartedAt: undefined,
                  },
                },
                "human",
              );
              return;
            }

            updateNode(
              node.id,
              {
                data: {
                  status: "error",
                  runMessage: "",
                  runStartedAt: undefined,
                  lastRunError:
                    "Generation was interrupted before an image was saved. Run it again.",
                },
              },
              "human",
            );
          })
          .catch((error) => {
            updateNode(
              node.id,
              {
                data: {
                  status: "error",
                  runMessage: "",
                  runStartedAt: undefined,
                  lastRunError:
                    error instanceof Error
                      ? error.message
                      : "Generation recovery failed.",
                },
              },
              "human",
            );
          });
      });
  }, [createImageOutputs, hasHydrated, project, updateNode]);

  useEffect(() => {
    if (!hasHydrated) return;

    project.nodes
      .filter((node) => node.type === "image_generation")
      .forEach((node) => {
        const currentImageUrls = imageUrlsFromData(node.data);
        const generatedImageCount =
          typeof node.data.generatedImageCount === "number" &&
          Number.isFinite(node.data.generatedImageCount)
            ? node.data.generatedImageCount
            : 0;
        const hasInlineImageUrls = currentImageUrls.some(isInlineImageUrl);
        const shouldRepairMissingUrls =
          node.data.status !== "running" &&
          currentImageUrls.length === 0 &&
          (generatedImageCount > 0 ||
            node.data.status === "completed" ||
            node.data.lastRunError === "Failed to fetch");
        const shouldReplaceInlineUrls =
          node.data.status !== "running" &&
          currentImageUrls.length > 0 &&
          hasInlineImageUrls;

        if (!shouldRepairMissingUrls && !shouldReplaceInlineUrls) return;

        const checkKey = `${project.projectId}:${node.id}:${node.updatedAt}`;
        if (savedImageSyncChecksRef.current.has(checkKey)) return;
        savedImageSyncChecksRef.current.add(checkKey);

        void listSavedGeneratedImages({
          projectId: project.projectId,
          generationNodeId: node.id,
        })
          .then((savedImageUrls) => {
            const desiredCount = Math.max(
              1,
              Math.min(24, generatedImageCount || currentImageUrls.length || 1),
            );
            const recoveredImageUrls = savedImageUrls.slice(-desiredCount);

            if (shouldReplaceInlineUrls && recoveredImageUrls.length > 0) {
              updateNode(
                node.id,
                {
                  data: {
                    status:
                      node.data.status === "error"
                        ? "completed"
                        : node.data.status,
                    generatedImageCount: recoveredImageUrls.length,
                    generatedImageUrls: recoveredImageUrls,
                    lastRunError: "",
                    runMessage: "",
                    runStartedAt: undefined,
                  },
                },
                "human",
              );
              return;
            }

            const missingImageUrls = recoveredImageUrls.filter(
              (imageUrl) => !currentImageUrls.includes(imageUrl),
            );
            if (missingImageUrls.length === 0) return;

            createImageOutputs(node.id, missingImageUrls, "human", {
              apiSize:
                typeof node.data.resolution === "string"
                  ? node.data.resolution
                  : undefined,
            });
            updateNode(
              node.id,
              {
                data: {
                  lastRunError: "",
                  runMessage: "",
                  runStartedAt: undefined,
                },
              },
              "human",
            );
          })
          .catch(() => undefined);
      });
  }, [createImageOutputs, hasHydrated, project.nodes, project.projectId, updateNode]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (staleOutputsCleanedProjectRef.current === project.projectId) return;
    staleOutputsCleanedProjectRef.current = project.projectId;

    const updatedAt = new Date().toISOString();
    let changed = false;
    const nodes = project.nodes.map((node) => {
      if (node.type !== "image_generation") return node;

      const generatedImageUrls = imageUrlsFromData(node.data);
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
    if (!isLogoLabProject(project)) return;

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
    if (!hasHydrated) return;
    if (!isLogoLabProject(project)) return;

    const hasSelectedGeneratedLogo = project.selectedNodeIds.some((nodeId) => {
      const node = project.nodes.find((projectNode) => projectNode.id === nodeId);
      return (
        node?.type === "image_generation" &&
        imageUrlsFromData(node.data).length > 0
      );
    });
    const hasFallbackLogo = project.nodes.some(
      (node) =>
        node.id === "image_generation_postliminal_logo_23" &&
        node.type === "image_generation",
    );
    if (!hasSelectedGeneratedLogo && !hasFallbackLogo) return;

    const storageKey = `${LOGO_YELLOW_BRANCH_STORAGE_KEY}.${project.projectId}`;
    if (window.localStorage.getItem(storageKey) === logoYellowBranchVersion) {
      return;
    }

    const branchedProject = appendSelectedLogoYellowBranch(project);
    if (branchedProject !== project) {
      window.localStorage.setItem(storageKey, logoYellowBranchVersion);
      loadProject(branchedProject);
    }
  }, [hasHydrated, loadProject, logoYellowBranchVersion, project]);

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
