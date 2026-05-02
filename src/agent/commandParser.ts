import type {
  Actor,
  CreateNodeInput,
  EdgeType,
  PostliminalNode,
  ProjectState,
  UpdateNodePatch,
} from "@/types/project";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "@/lib/imageModels";

const visualDirectionPrompts = [
  {
    title: "Stone Signal",
    text: "Black-and-white cinematic hero frame: an ancient stone signal tower in a vast frontier plain, a single gold pulse traveling through carved channels, restrained scale, no glossy AI render artifacts.",
  },
  {
    title: "Archive Horizon",
    text: "Wide monochrome shot of a ruined civilization archive opening toward a frontier technology horizon, pale gold accent on one interface line, tactile stone and dust, premium institutional tone.",
  },
  {
    title: "Marble Circuit",
    text: "Macro-to-wide camera move across etched marble circuitry, one gold trace awakening old infrastructure, black-and-white world, cinematic shadows, sober investment-firm confidence.",
  },
  {
    title: "Frontier Gate",
    text: "A monumental gate between ancient columns and a sparse computational frontier, one gold path of light marking the way forward, realistic materials, no synthetic plastic sheen.",
  },
  {
    title: "Founders' Table",
    text: "Overhead black-and-white scene of a stone strategy table with frontier maps and abstract machine diagrams, one gold marker indicating asymmetric opportunity, quiet authority.",
  },
  {
    title: "Signal Descent",
    text: "Cinematic descending shot into a carved subterranean chamber where frontier technology is embedded in ancient walls, single gold accent reflected in dark polished stone.",
  },
  {
    title: "Capital Relic",
    text: "Austere black-and-white close-up of a relic-like financial instrument transforming into a minimal interface, one pale gold highlight, ancient civilization meets frontier technology.",
  },
  {
    title: "Dawn Infrastructure",
    text: "Long-lens monochrome dawn over half-built frontier infrastructure arranged like ancient ruins, one intentional gold line connecting distant structures, grounded and cinematic.",
  },
];

type AgentRuntime = {
  getProject: () => ProjectState;
  createNode: (input: CreateNodeInput) => PostliminalNode;
  updateNode: (nodeId: string, patch: UpdateNodePatch, actor?: Actor) => void;
  connectNodes: (
    sourceId: string,
    targetId: string,
    type: EdgeType,
    createdBy?: Actor,
  ) => unknown;
  moveNode: (nodeId: string, position: { x: number; y: number }, actor?: Actor) => void;
  createBranch: (input: { sourceNodeIds?: string[]; promptText?: string; createdBy?: Actor }) => void;
  createGroup: (input: { title?: string; nodeIds?: string[]; createdBy?: Actor }) => unknown;
  autoLayout: (actor?: Actor) => void;
  createMockOutputs: (generationNodeId: string, actor?: Actor) => void;
};

function includesAny(message: string, terms: string[]) {
  return terms.some((term) => message.includes(term));
}

function getGenerationForPrompt(project: ProjectState, promptId: string) {
  const generationEdge = project.edges.find(
    (edge) => edge.source === promptId && edge.type === "input_to",
  );
  if (!generationEdge) return undefined;
  return project.nodes.find(
    (node) =>
      node.id === generationEdge.target && node.type === "image_generation",
  );
}

function ensureDirectionsGraph(message: string, api: AgentRuntime) {
  const project = api.getProject();
  let brief = project.nodes.find((node) => node.type === "brief");

  if (brief) {
    api.updateNode(
      brief.id,
      {
        data: {
          title: "Visual Direction Brief",
          text: message,
          status: "ready",
        },
      },
      "agent",
    );
  } else {
    brief = api.createNode({
      type: "brief",
      createdBy: "agent",
      position: { x: 72, y: 108 },
      data: {
        title: "Visual Direction Brief",
        text: message,
        status: "ready",
      },
    });
  }

  const promptNodes = api
    .getProject()
    .nodes.filter((node) => node.type === "prompt")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  visualDirectionPrompts.forEach((promptData, index) => {
    let prompt = promptNodes[index];

    if (prompt) {
      api.updateNode(
        prompt.id,
        {
          data: {
            title: promptData.title,
            text: promptData.text,
            status: "ready",
          },
        },
        "agent",
      );
    } else {
      prompt = api.createNode({
        type: "prompt",
        createdBy: "agent",
        position: { x: 420, y: 72 + index * 196 },
        data: {
          title: promptData.title,
          text: promptData.text,
          status: "ready",
        },
      });
    }

    api.connectNodes(brief.id, prompt.id, "derived_from", "agent");

    const freshProject = api.getProject();
    let generation = getGenerationForPrompt(freshProject, prompt.id);

    if (generation) {
      const modelOption = getImageModelOption(generation.data.model);
      api.updateNode(
        generation.id,
        {
          data: {
            title: `${promptData.title} Gen`,
            model: modelOption.id,
            modelLabel: modelOption.nodeLabel,
            status: generation.data.status ?? "idle",
          },
        },
        "agent",
      );
    } else {
      generation = api.createNode({
        type: "image_generation",
        createdBy: "agent",
        position: { x: 770, y: 74 + index * 196 },
        data: {
          title: `${promptData.title} Gen`,
          model: DEFAULT_IMAGE_MODEL_ID,
          modelLabel: getImageModelOption(DEFAULT_IMAGE_MODEL_ID).nodeLabel,
          status: "idle",
        },
      });
      api.connectNodes(prompt.id, generation.id, "input_to", "agent");
    }
  });

  api.autoLayout("agent");
}

function runAllImageGenerations(api: AgentRuntime) {
  const generationNodes = api
    .getProject()
    .nodes.filter((node) => node.type === "image_generation");

  generationNodes.forEach((node) => {
    api.createMockOutputs(node.id, "agent");
  });

  api.autoLayout("agent");
  return generationNodes.length;
}

function organizeCanvas(api: AgentRuntime) {
  const project = api.getProject();
  const promptAndGenerationIds = project.nodes
    .filter(
      (node) => node.type === "prompt" || node.type === "image_generation",
    )
    .map((node) => node.id);

  const hasDirectionGroup = project.nodes.some(
    (node) =>
      node.type === "group" && String(node.data.title) === "Direction System",
  );

  if (!hasDirectionGroup && promptAndGenerationIds.length > 0) {
    api.createGroup({
      title: "Direction System",
      nodeIds: promptAndGenerationIds,
      createdBy: "agent",
    });
  }

  api.autoLayout("agent");
}

function refineSelectedOutputs(api: AgentRuntime) {
  const selectedOutputIds = api.getProject().selectedAssetIds;
  if (selectedOutputIds.length === 0) {
    return "Select one or more image outputs first, then ask me to refine them.";
  }

  api.createBranch({
    sourceNodeIds: selectedOutputIds,
    createdBy: "agent",
    promptText:
      "Refine the selected output into a sharper fund hero direction. Preserve the monochrome world, keep one deliberate gold accent, and make the image feel physical, cinematic, and strategically restrained.",
  });

  return `Created ${selectedOutputIds.length} refinement branch${selectedOutputIds.length === 1 ? "" : "es"} from the selected output${selectedOutputIds.length === 1 ? "" : "s"}.`;
}

export function runAgentCommand(message: string, api: AgentRuntime) {
  const normalized = message.trim().toLowerCase();

  if (includesAny(normalized, ["visual directions", "directions"])) {
    ensureDirectionsGraph(message, api);
    return "Created a brief, 8 visual direction prompts, and a mock generation node for each prompt.";
  }

  if (normalized.includes("run") && normalized.includes("image")) {
    const count = runAllImageGenerations(api);
    return count > 0
      ? `Ran mock image generation for ${count} generation node${count === 1 ? "" : "s"}.`
      : "There are no image generation nodes yet.";
  }

  if (includesAny(normalized, ["clean up", "organize"])) {
    organizeCanvas(api);
    return "Organized the canvas and added a direction group label.";
  }

  if (normalized.includes("refine")) {
    return refineSelectedOutputs(api);
  }

  return "Try: Create 8 visual directions for a black-and-white AI fund hero video with one gold accent.";
}
