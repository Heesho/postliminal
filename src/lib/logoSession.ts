import type { EdgeType, NodeType, ProjectState } from "@/types/project";
import { snapCanvasPosition } from "./canvasGrid";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "./imageModels";

const baseLogoConstraints =
  "Strict output: one large centered abstract brand symbol for PostLiminal's liminal AI canvas, no wordmark. Fill the entire image with a solid near-black void background: #07070A or #0C0C10. Do not use a white, off-white, paper, transparent, or empty background. The symbol must occupy 55-70% of the canvas and be immediately visible at thumbnail size. Use only the PostLiminal palette: solid ink/off-white #F4F4F4 for the main shapes, sub-glass dark #11121A for secondary dark shapes, prompt amber #F5B950 for one visible text-channel accent, image periwinkle #6AA6FF for one visible pixel-channel accent. Visual language: flat pane geometry, threshold gaps, node-canvas connector logic, amber for prompt signal, periwinkle for image signal. Flat vector geometry only, 2-5 thick simple shapes, hard edges, high contrast, strong negative space, clear at 32 px. Nothing else: no readable characters, no UI screenshot, no representational subject, no badge border, no mockup lighting, no gradient, no shadow, no 3D, no tiny marks, no faint low-contrast marks, no colors outside the PostLiminal palette.";

const logoDnaStyle = [
  "symbol-only",
  "PostLiminal design system",
  "liquid glass reduced to flat icon geometry",
  "nonrepresentational geometry",
  "flat vector",
  "dark background",
  "high contrast",
  "strict negative space",
  "void darks",
  "amber prompt channel",
  "periwinkle image channel",
  "quiet software identity",
  "app-icon legibility",
];

const logoDnaAvoid = [
  "wordmarks",
  "initials",
  "monograms",
  "mascots",
  "literal places",
  "UI screenshots",
  "badges",
  "mockups",
  "decorative effects",
  "white backgrounds",
  "tiny low-contrast marks",
  "off-palette colors",
  "photoreal glass",
];

function logoPrompt(brief: string) {
  return `${brief} ${baseLogoConstraints}`;
}

const logoPrompts = [
  {
    title: "Vertical Slit",
    text: logoPrompt(
      "Create a logo mark from two tall thick off-white slab shapes separated by a vertical void slit that is at least 8% of the mark width. Place one clearly visible #F5B950 amber square halfway across the slit, like a prompt-channel registration mark.",
    ),
  },
  {
    title: "Offset Slabs",
    text: logoPrompt(
      "Create a logo mark from two overlapping thick off-white rectangular plates. Shift the top plate slightly right and down so a precise void seam appears between them. Add one visible #6AA6FF periwinkle edge bar only on the shifted plate.",
    ),
  },
  {
    title: "Threshold Bar",
    text: logoPrompt(
      "Create a logo mark from a single thick off-white horizontal threshold bar interrupted by one vertical void cut. Add a clearly visible #F5B950 amber connector dot exactly at the interruption.",
    ),
  },
  {
    title: "Asymmetric Brackets",
    text: logoPrompt(
      "Create a logo mark from two asymmetric thick off-white bracket forms facing each other with a clear void gap between them. The left bracket is taller, the right bracket is shorter and shifted upward.",
    ),
  },
  {
    title: "Dot Field Cut",
    text: logoPrompt(
      "Create a logo mark from nine large off-white node-grid dots arranged in a quiet 3x3 field. Remove the center column to create a vertical absence, and place one #F5B950 amber prompt dot just outside the field.",
    ),
  },
  {
    title: "Connector Mark",
    text: logoPrompt(
      "Create a logo mark from one thick off-white rounded node outline, one visible #F5B950 amber connector dot on its right edge, and one short amber line leaving the dot. Reduce it until it feels like a brand symbol, not a diagram.",
    ),
  },
  {
    title: "Split Square",
    text: logoPrompt(
      "Create a logo mark from a solid off-white glass tile split into two unequal pieces by a void vertical cut. Offset the right piece upward by a few pixels so the symbol feels slightly displaced.",
    ),
  },
  {
    title: "Displaced Corner",
    text: logoPrompt(
      "Create a logo mark from a square off-white glass panel with one corner displaced as a separate #6AA6FF periwinkle quadrilateral. Keep the displaced corner close enough to read as one broken object.",
    ),
  },
  {
    title: "Suspended Cross",
    text: logoPrompt(
      "Create a logo mark from one thick vertical off-white line and one thick horizontal off-white line that almost touch but do not connect. Put a #F5B950 amber connector dot in the clear gap between them.",
    ),
  },
  {
    title: "Aperture Edges",
    text: logoPrompt(
      "Create a logo mark from four thick short off-white edge bars positioned like cropped node edges around an empty center. The empty center is the main shape. Add one visible #6AA6FF periwinkle bar on the upper-right edge.",
    ),
  },
  {
    title: "Broken Arc",
    text: logoPrompt(
      "Create a logo mark from one thick off-white arc broken by a straight vertical void cut. Keep the arc open and asymmetrical, with one #F5B950 amber end cap on the cut edge.",
    ),
  },
  {
    title: "Afterimage Pill",
    text: logoPrompt(
      "Create a logo mark from one off-white vertical pill and a smaller #6AA6FF periwinkle duplicate shifted behind it by six pixels. Cut a thin void slit through both shapes.",
    ),
  },
  {
    title: "Subtracted Window",
    text: logoPrompt(
      "Create a logo mark from a heavy off-white rectangle with a smaller void rectangle subtracted from its lower-right interior. Add one visible #F5B950 amber bar along the subtraction edge.",
    ),
  },
  {
    title: "Liminal Steps",
    text: logoPrompt(
      "Create a logo mark from three thick off-white stair-step blocks aligned along an invisible diagonal, each separated by a void gap. Add one #6AA6FF periwinkle bar crossing only the middle gap.",
    ),
  },
  {
    title: "System Glyph",
    text: logoPrompt(
      "Create a logo mark from one off-white vertical slab, one off-white dot, and one #F5B950 amber horizontal bar. Arrange them as a strange but balanced PostLiminal system glyph, not a letter.",
    ),
  },
  {
    title: "Double Passage",
    text: logoPrompt(
      "Create a logo mark from two narrow off-white vertical glass rectangles with a smaller #6AA6FF periwinkle rectangle crossing behind them. Leave two precise void channels so the symbol feels like a doubled threshold.",
    ),
  },
];

const laneSpacing = 500;
const columns = [
  { promptX: 420, modelX: 940, startY: 100 },
  { promptX: 1640, modelX: 2160, startY: 100 },
];

function makeNode(
  type: NodeType,
  id: string,
  position: { x: number; y: number },
  data: ProjectState["nodes"][number]["data"],
  timestamp: string,
): ProjectState["nodes"][number] {
  return {
    id,
    type,
    position: snapCanvasPosition(position),
    data,
    createdBy: "agent",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  type: EdgeType,
  timestamp: string,
): ProjectState["edges"][number] {
  return {
    id,
    source,
    target,
    type,
    createdBy: "agent",
    createdAt: timestamp,
  };
}

export function createPostLiminalLogoSession(
  projectId: string,
  timestamp = new Date().toISOString(),
): ProjectState {
  const imageModel = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
  const nodes: ProjectState["nodes"] = [];
  const edges: ProjectState["edges"] = [];
  const selectedNodeIds: string[] = [];

  logoPrompts.forEach((prompt, index) => {
    const promptId = `prompt_postliminal_logo_${index + 1}`;
    const generationId = `image_generation_postliminal_logo_${index + 1}`;
    const column = columns[index % columns.length];
    const row = Math.floor(index / columns.length);
    const y = column.startY + row * laneSpacing;

    nodes.push(
      makeNode(
        "prompt",
        promptId,
        { x: column.promptX, y },
        {
          title: prompt.title,
          text: prompt.text,
          status: "ready",
        },
        timestamp,
      ),
      makeNode(
        "image_generation",
        generationId,
        { x: column.modelX, y },
        {
          title: `${prompt.title} Image Model`,
          model: DEFAULT_IMAGE_MODEL_ID,
          modelLabel: imageModel.nodeLabel,
          quality: "medium",
          resolution: "1024x1024",
          runs: 1,
          status: "idle",
        },
        timestamp,
      ),
    );

    edges.push(
      makeEdge(
        `edge_postliminal_logo_model_${index + 1}`,
        promptId,
        generationId,
        "input_to",
        timestamp,
      ),
    );
    selectedNodeIds.push(generationId);
  });

  return {
    projectId,
    title: "PostLiminal Logo Lab",
    dna: {
      description:
        "Logo exploration session for PostLiminal brand identity.",
      style: [...logoDnaStyle],
      avoid: [...logoDnaAvoid],
    },
    nodes,
    edges,
    selectedNodeIds,
    selectedAssetIds: [],
    agentActions: [],
    updatedAt: timestamp,
  };
}

export function appendPostLiminalLogoPrompts(
  project: ProjectState,
  timestamp = new Date().toISOString(),
): ProjectState {
  const imageModel = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
  const nodes = [...project.nodes];
  const edges = [...project.edges];
  const nodeIds = new Set(nodes.map((node) => node.id));
  let changed = false;

  logoPrompts.forEach((prompt, index) => {
    const promptId = `prompt_postliminal_logo_${index + 1}`;
    const generationId = `image_generation_postliminal_logo_${index + 1}`;
    const column = columns[index % columns.length];
    const row = Math.floor(index / columns.length);
    const y = column.startY + row * laneSpacing;

    const existingPromptIndex = nodes.findIndex((node) => node.id === promptId);
    if (existingPromptIndex === -1) {
      nodes.push(
        makeNode(
          "prompt",
          promptId,
          { x: column.promptX, y },
          {
            title: prompt.title,
            text: prompt.text,
            status: "ready",
          },
          timestamp,
        ),
      );
      nodeIds.add(promptId);
      changed = true;
    } else {
      const existingPrompt = nodes[existingPromptIndex];
      if (
        existingPrompt.type === "prompt" &&
        (existingPrompt.data.title !== prompt.title ||
          existingPrompt.data.text !== prompt.text)
      ) {
        nodes[existingPromptIndex] = {
          ...existingPrompt,
          data: {
            ...existingPrompt.data,
            title: prompt.title,
            text: prompt.text,
            status: existingPrompt.data.status ?? "ready",
          },
          updatedAt: timestamp,
        };
        changed = true;
      }
    }

    const imageModelTitle = `${prompt.title} Image Model`;
    const existingGenerationIndex = nodes.findIndex(
      (node) => node.id === generationId,
    );
    if (existingGenerationIndex === -1) {
      nodes.push(
        makeNode(
          "image_generation",
          generationId,
          { x: column.modelX, y },
          {
            title: imageModelTitle,
            model: DEFAULT_IMAGE_MODEL_ID,
            modelLabel: imageModel.nodeLabel,
            quality: "medium",
            resolution: "1024x1024",
            runs: 1,
            status: "idle",
          },
          timestamp,
        ),
      );
      nodeIds.add(generationId);
      changed = true;
    } else {
      const existingGeneration = nodes[existingGenerationIndex];
      if (
        existingGeneration.type === "image_generation" &&
        (existingGeneration.data.title !== imageModelTitle ||
          existingGeneration.data.quality !== "medium")
      ) {
        nodes[existingGenerationIndex] = {
          ...existingGeneration,
          data: {
            ...existingGeneration.data,
            title: imageModelTitle,
            quality: "medium",
          },
          updatedAt: timestamp,
        };
        changed = true;
      }
    }

    const hasEdge = edges.some(
      (edge) =>
        edge.source === promptId &&
        edge.target === generationId &&
        edge.type === "input_to",
    );

    if (!hasEdge) {
      edges.push(
        makeEdge(
          `edge_postliminal_logo_model_${index + 1}`,
          promptId,
          generationId,
          "input_to",
          timestamp,
        ),
      );
      changed = true;
    }
  });

  if (!changed) return project;

  return {
    ...project,
    nodes,
    edges,
    dna: {
      ...project.dna,
      description:
        project.dna.description ??
        "Logo exploration session for PostLiminal brand identity.",
      style: [...logoDnaStyle],
      avoid: [...logoDnaAvoid],
    },
    updatedAt: timestamp,
  };
}
