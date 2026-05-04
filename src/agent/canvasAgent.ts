"use client";

import { runAgentCommand } from "@/agent/commandParser";
import { useProjectStore } from "@/store/projectStore";

export const DEMO_COMMAND =
  "Create 8 visual directions for a cinematic hero video for an AI investment firm. Black and white world, one gold accent, ancient civilization meets frontier technology. Avoid glossy AI-looking renders.";

function createAgentRuntime() {
  const store = useProjectStore.getState();
  return {
    getProject: () => useProjectStore.getState().project,
    createNode: store.createNode,
    updateNode: store.updateNode,
    connectNodes: store.connectNodes,
    moveNode: store.moveNode,
    createBranch: store.createBranch,
    createGroup: store.createGroup,
    autoLayout: store.autoLayout,
  };
}

export function runCanvasAgentCommand(message: string) {
  return runAgentCommand(message, createAgentRuntime());
}
