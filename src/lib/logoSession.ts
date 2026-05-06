import type { EdgeType, NodeType, ProjectState } from "@/types/project";
import { snapCanvasPosition } from "./canvasGrid";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption } from "./imageModels";

const baseLogoConstraints =
  "Strict output: one finished abstract brand symbol for PostLiminal's liminal AI canvas, no wordmark. Fill the entire image with a solid near-black void background: #07070A or #0C0C10. Do not use a white, off-white, paper, transparent, or empty background. The symbol must occupy 55-70% of the canvas and be immediately visible at thumbnail size. Use only the PostLiminal palette: solid ink/off-white #F4F4F4 for the main shapes, sub-glass dark #11121A for secondary dark shapes, prompt amber #F5B950 for one visible text-channel accent, image periwinkle #6AA6FF for one visible pixel-channel accent. Visual language: resolved software identity, threshold gaps, liminal passages, node-canvas connector logic, amber for prompt signal, periwinkle for image signal. Flat geometric logo only, 2-5 thick simple shapes, hard edges, high contrast, strong negative space, clear at 32 px. Nothing else: no readable characters, no UI screenshot, no placeholder tile, no loading icon, no generic template icon, no representational subject, no badge border, no mockup lighting, no gradient, no shadow, no 3D, no tiny marks, no faint low-contrast marks, no colors outside the PostLiminal palette.";

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
  "placeholder tiles",
  "loading icons",
  "generic template icons",
  "decorative effects",
  "white backgrounds",
  "tiny low-contrast marks",
  "off-palette colors",
  "photoreal glass",
];

function logoPrompt(brief: string) {
  return `${brief} ${baseLogoConstraints}`;
}

const baseLogoPrompts = [
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

const newLogoPrompts = [
  {
    title: "Folded Portal",
    text: logoPrompt(
      "Create a logo mark from two thick off-white folded portal plates facing inward. One plate is shifted forward by a small periwinkle edge, creating a clean impossible doorway through the center.",
    ),
  },
  {
    title: "Signal Gate",
    text: logoPrompt(
      "Create a logo mark from a heavy off-white gate shape split by a vertical void channel. Put one amber rectangular signal block inside the channel, offset just enough to feel intentional and proprietary.",
    ),
  },
  {
    title: "Parallax Pane",
    text: logoPrompt(
      "Create a logo mark from three thick off-white panes stacked in shallow parallax, each pane separated by a crisp void gap. Add one periwinkle underlay visible only on the lower-right edge.",
    ),
  },
  {
    title: "Threshold Core",
    text: logoPrompt(
      "Create a logo mark from a compact off-white square core with a rectangular void removed from its center. Add one amber bar crossing the void like a prompt passing through a model.",
    ),
  },
  {
    title: "Twin Passage",
    text: logoPrompt(
      "Create a logo mark from two thick off-white vertical passages, one taller than the other, aligned around a shared center void. Add a periwinkle bridge behind them, visible only at the gap.",
    ),
  },
  {
    title: "Relay Cut",
    text: logoPrompt(
      "Create a logo mark from one off-white horizontal slab split into three staggered segments. Add one amber connector dot between the first and second segment, making the void feel active.",
    ),
  },
  {
    title: "Glass Hinge",
    text: logoPrompt(
      "Create a logo mark from two thick off-white rectangles hinged around an invisible corner, like a door opening into darkness. Add one short periwinkle hinge tab at the inner corner.",
    ),
  },
  {
    title: "Void Monolith",
    text: logoPrompt(
      "Create a logo mark from one tall off-white monolith with a precise vertical void slit cut through its lower half. Add one amber square sitting inside the slit, centered and readable.",
    ),
  },
  {
    title: "Blue Offset",
    text: logoPrompt(
      "Create a logo mark from a thick off-white square rotated only by implied cuts, not actual rotation. Remove one lower-right corner and replace it with a close periwinkle offset piece.",
    ),
  },
  {
    title: "Amber Aperture",
    text: logoPrompt(
      "Create a logo mark from four thick off-white bars forming an open square aperture. Leave the center empty and place one amber bar along the left interior edge.",
    ),
  },
  {
    title: "Stacked Threshold",
    text: logoPrompt(
      "Create a logo mark from three off-white block steps that compress toward a central void. Add one periwinkle block behind the middle step so the mark feels dimensional without shading.",
    ),
  },
  {
    title: "Split Lens",
    text: logoPrompt(
      "Create a logo mark from a thick off-white circular lens cut cleanly into two asymmetric halves by a vertical void. Add one amber end cap on the lower cut edge.",
    ),
  },
  {
    title: "Prompt Window",
    text: logoPrompt(
      "Create a logo mark from one off-white window frame with the right side missing. Place one amber square just outside the opening, as if a prompt is entering the empty frame.",
    ),
  },
  {
    title: "Model Window",
    text: logoPrompt(
      "Create a logo mark from one off-white window frame with the lower-right corner displaced into a periwinkle block. Keep the frame heavy, simple, and instantly recognizable.",
    ),
  },
  {
    title: "Crossing Gap",
    text: logoPrompt(
      "Create a logo mark from two thick off-white bars that nearly cross but are separated by a clean black gap at the center. Add one amber square touching only one side of the gap.",
    ),
  },
  {
    title: "Hidden Channel",
    text: logoPrompt(
      "Create a logo mark from two off-white slabs with a hidden S-shaped void channel implied by straight stepped cuts. Add one small periwinkle slab behind the final step.",
    ),
  },
];

const latestLogoPrompts = [
  {
    title: "Liminal Fold",
    text: logoPrompt(
      "Create a logo mark from two thick off-white folded panels that almost meet at a black vertical threshold. Add one #6AA6FF periwinkle inner edge and one small #F5B950 amber tab tucked into the lower fold.",
    ),
  },
  {
    title: "Nested Gate",
    text: logoPrompt(
      "Create a logo mark from an off-white outer gate shape with a smaller off-white gate nested inside it, both interrupted by the same central void. Place one amber square on the shared interruption.",
    ),
  },
  {
    title: "Signal Notch",
    text: logoPrompt(
      "Create a logo mark from one heavy off-white vertical slab with a sharp rectangular notch cut out of its right edge. Add one periwinkle block sitting inside the notch and one amber dot just outside it.",
    ),
  },
  {
    title: "Displaced Beam",
    text: logoPrompt(
      "Create a logo mark from a single thick off-white beam broken into two offset pieces, with the right piece shifted upward. Put one amber connector bar across the gap without fully closing it.",
    ),
  },
  {
    title: "Portal Spine",
    text: logoPrompt(
      "Create a logo mark from one tall off-white spine and one shorter off-white return panel, forming an open portal around a strong black negative-space channel. Add a periwinkle strip on the inner spine.",
    ),
  },
  {
    title: "Cutout Relay",
    text: logoPrompt(
      "Create a logo mark from three off-white square blocks arranged as a relay path around a missing center. Use one amber connector segment between two blocks and one periwinkle edge on the final block.",
    ),
  },
  {
    title: "Negative Key",
    text: logoPrompt(
      "Create a logo mark from a heavy off-white keyhole-like negative space carved through two rectangular slabs. Keep it abstract, not a literal key. Add one amber rectangular accent at the throat of the void.",
    ),
  },
  {
    title: "Split Frame",
    text: logoPrompt(
      "Create a logo mark from an off-white square frame split into two separated L-shaped pieces. The separation must be the most readable feature. Add one periwinkle corner piece close to the lower-right break.",
    ),
  },
  {
    title: "Blue Pin",
    text: logoPrompt(
      "Create a logo mark from two off-white panels leaning toward each other with a clean black gap. Add one prominent #6AA6FF periwinkle pin shape crossing only the top of the gap and one tiny amber foot below.",
    ),
  },
  {
    title: "Amber Passage",
    text: logoPrompt(
      "Create a logo mark from two thick off-white vertical slabs with a horizontal black passage between them. Place one #F5B950 amber bar inside the passage and one small periwinkle end cap on the far edge.",
    ),
  },
];

const latestLogoStartIdNumber = baseLogoPrompts.length + newLogoPrompts.length + 1;
const latestLogoRowOffset = Math.ceil(
  Math.max(baseLogoPrompts.length, newLogoPrompts.length) / 2,
);

const logoPrompts = [
  ...baseLogoPrompts.map((prompt, index) => ({
    ...prompt,
    idNumber: index + 1,
    columnIndex: index % 2,
    rowIndex: Math.floor(index / 2),
  })),
  ...newLogoPrompts.map((prompt, index) => ({
    ...prompt,
    idNumber: baseLogoPrompts.length + index + 1,
    columnIndex: 2 + (index % 2),
    rowIndex: Math.floor(index / 2),
  })),
  ...latestLogoPrompts.map((prompt, index) => ({
    ...prompt,
    idNumber: latestLogoStartIdNumber + index,
    columnIndex: index % 2,
    rowIndex: latestLogoRowOffset + Math.floor(index / 2),
  })),
];

const laneSpacing = 500;
const columns = [
  { promptX: 420, modelX: 940, startY: 100 },
  { promptX: 1640, modelX: 2160, startY: 100 },
  { promptX: 2860, modelX: 3380, startY: 100 },
  { promptX: 4080, modelX: 4600, startY: 100 },
];
const promptNodeSize = { width: 360, height: 260 };
const imageModelNodeSize = { width: 362, height: 420 };
const yellowBranchFallbackSourceId = "image_generation_postliminal_logo_23";

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

function generatedImageUrlsFromData(data: ProjectState["nodes"][number]["data"]) {
  return Array.isArray(data.generatedImageUrls)
    ? data.generatedImageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string",
      )
    : [];
}

function samePosition(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function nodeSize(type: NodeType) {
  return type === "image_generation" ? imageModelNodeSize : promptNodeSize;
}

function nodeBounds(
  node: ProjectState["nodes"][number],
  position = node.position,
) {
  const size = nodeSize(node.type);

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

function boundsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function branchOverlapsExisting(
  existingBounds: ReturnType<typeof nodeBounds>[],
  promptPosition: { x: number; y: number },
  generationPosition: { x: number; y: number },
) {
  const promptBounds = {
    ...promptPosition,
    ...promptNodeSize,
  };
  const generationBounds = {
    ...generationPosition,
    ...imageModelNodeSize,
  };

  return existingBounds.some(
    (bounds) =>
      boundsOverlap(bounds, promptBounds) || boundsOverlap(bounds, generationBounds),
  );
}

function yellowBranchPrompt(sourceTitle: string) {
  return logoPrompt(
    `Create a refined variant of the selected "${sourceTitle}" logo mark with a stronger PostLiminal yellow accent. Preserve the existing black void background, off-white folded geometry, and any blue/periwinkle image-channel accent. Add one deliberate #F5B950 yellow prompt-channel accent on the inner hinge, threshold edge, or connector point so the mark feels more ownable without becoming busy.`,
  );
}

export function createPostLiminalLogoSession(
  projectId: string,
  timestamp = new Date().toISOString(),
): ProjectState {
  const imageModel = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
  const nodes: ProjectState["nodes"] = [];
  const edges: ProjectState["edges"] = [];
  const selectedNodeIds: string[] = [];

  logoPrompts.forEach((prompt) => {
    const promptId = `prompt_postliminal_logo_${prompt.idNumber}`;
    const generationId = `image_generation_postliminal_logo_${prompt.idNumber}`;
    const column = columns[prompt.columnIndex];
    const row = prompt.rowIndex;
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
        `edge_postliminal_logo_model_${prompt.idNumber}`,
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
  const addedGenerationIds: string[] = [];
  let changed = false;

  logoPrompts.forEach((prompt) => {
    const promptId = `prompt_postliminal_logo_${prompt.idNumber}`;
    const generationId = `image_generation_postliminal_logo_${prompt.idNumber}`;
    const column = columns[prompt.columnIndex];
    const row = prompt.rowIndex;
    const promptPosition = snapCanvasPosition({
      x: column.promptX,
      y: column.startY + row * laneSpacing,
    });
    const generationPosition = snapCanvasPosition({
      x: column.modelX,
      y: column.startY + row * laneSpacing,
    });
    const shouldManagePosition = prompt.idNumber >= latestLogoStartIdNumber;

    const existingPromptIndex = nodes.findIndex((node) => node.id === promptId);
    if (existingPromptIndex === -1) {
      nodes.push(
        makeNode(
          "prompt",
          promptId,
          promptPosition,
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
      const shouldMovePrompt =
        shouldManagePosition && !samePosition(existingPrompt.position, promptPosition);
      if (
        existingPrompt.type === "prompt" &&
        (existingPrompt.data.title !== prompt.title ||
          existingPrompt.data.text !== prompt.text ||
          shouldMovePrompt)
      ) {
        nodes[existingPromptIndex] = {
          ...existingPrompt,
          position: shouldMovePrompt ? promptPosition : existingPrompt.position,
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
          generationPosition,
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
      addedGenerationIds.push(generationId);
      changed = true;
    } else {
      const existingGeneration = nodes[existingGenerationIndex];
      const shouldMoveGeneration =
        shouldManagePosition &&
        !samePosition(existingGeneration.position, generationPosition);
      if (
        existingGeneration.type === "image_generation" &&
        (existingGeneration.data.title !== imageModelTitle ||
          existingGeneration.data.quality !== "medium" ||
          shouldMoveGeneration)
      ) {
        nodes[existingGenerationIndex] = {
          ...existingGeneration,
          position: shouldMoveGeneration
            ? generationPosition
            : existingGeneration.position,
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
          `edge_postliminal_logo_model_${prompt.idNumber}`,
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
    selectedNodeIds: Array.from(
      new Set([...project.selectedNodeIds, ...addedGenerationIds]),
    ),
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

export function appendSelectedLogoYellowBranch(
  project: ProjectState,
  timestamp = new Date().toISOString(),
): ProjectState {
  const hasGeneratedImages = (node: ProjectState["nodes"][number] | undefined) =>
    node?.type === "image_generation" &&
    generatedImageUrlsFromData(node.data).length > 0;
  const source = project.selectedNodeIds
    .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
    .find(hasGeneratedImages) ??
    project.selectedNodeIds
      .map((nodeId) => project.nodes.find((node) => node.id === nodeId))
      .find((node) => node?.type === "image_generation") ??
    project.nodes.find(
      (node) =>
        node.id === yellowBranchFallbackSourceId &&
        node.type === "image_generation",
    );

  if (!source) return project;

  const branchSlug = source.id
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const promptId = `prompt_yellow_branch_${branchSlug}`;
  const generationId = `image_generation_yellow_branch_${branchSlug}`;
  const existingGeneration = project.nodes.find((node) => node.id === generationId);

  if (existingGeneration) {
    return {
      ...project,
      selectedNodeIds: [generationId],
      selectedAssetIds: [],
      updatedAt: timestamp,
    };
  }

  const imageModel = getImageModelOption(DEFAULT_IMAGE_MODEL_ID);
  const existingBounds = project.nodes
    .filter((node) => node.type !== "image_output")
    .map((node) => nodeBounds(node));
  const maxRight = Math.max(
    source.position.x + imageModelNodeSize.width,
    ...existingBounds.map((bounds) => bounds.x + bounds.width),
  );

  let promptPosition = snapCanvasPosition({
    x: source.position.x + 520,
    y: source.position.y,
  });
  let generationPosition = snapCanvasPosition({
    x: promptPosition.x + 520,
    y: promptPosition.y,
  });

  if (
    branchOverlapsExisting(existingBounds, promptPosition, generationPosition)
  ) {
    promptPosition = snapCanvasPosition({
      x: maxRight + 180,
      y: source.position.y,
    });
    generationPosition = snapCanvasPosition({
      x: promptPosition.x + 520,
      y: promptPosition.y,
    });
  }

  const sourceTitle = String(source.data.title ?? "selected");
  const prompt = makeNode(
    "prompt",
    promptId,
    promptPosition,
    {
      title: "Yellow Accent Variant",
      text: yellowBranchPrompt(sourceTitle),
      status: "ready",
    },
    timestamp,
  );
  const generation = makeNode(
    "image_generation",
    generationId,
    generationPosition,
    {
      title: "Yellow Accent Image Model",
      model: DEFAULT_IMAGE_MODEL_ID,
      modelLabel: imageModel.nodeLabel,
      quality: "medium",
      resolution: "1024x1024",
      runs: 1,
      status: "idle",
    },
    timestamp,
  );

  return {
    ...project,
    nodes: [...project.nodes, prompt, generation],
    edges: [
      ...project.edges,
      makeEdge(
        `edge_yellow_branch_prompt_${branchSlug}`,
        prompt.id,
        generation.id,
        "input_to",
        timestamp,
      ),
      makeEdge(
        `edge_yellow_branch_image_${branchSlug}`,
        source.id,
        generation.id,
        "variation_of",
        timestamp,
      ),
    ],
    selectedNodeIds: [generation.id],
    selectedAssetIds: [],
    updatedAt: timestamp,
  };
}
