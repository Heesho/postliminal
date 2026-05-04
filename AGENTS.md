# PostLiminal Agent Notes

This file is for Codex. Keep it in sync with `CLAUDE.md`, which provides the same project guidance for Claude.

## Canvas Layout

- When creating or seeding canvas sessions, align the top edges of paired prompt and image model nodes.
- Place every persisted node on the 20px canvas grid. Use `snapCanvasPosition` from `src/lib/canvasGrid.ts` instead of hard-coding off-grid offsets.
- Do not overlap nodes. Image model nodes are tall, so use at least 460px of vertical spacing between rows unless the node height changes.
- Prefer two-column or multi-lane layouts for larger prompt sets instead of one long stacked column.
- Do not add a brief node just to label a board. Use the project title or metadata for board-level context unless the user explicitly asks for a brief box.
- Do not create separate Output nodes for image generations. Generated images should live inside the Image Model node preview surface.
- Use plain workflow language in the UI and seeded content: Prompt, Image model, Import image, Tasks, Run selected.

## Seeded Sessions

- Seeded project boards should live in source as structured project data or helper functions, not as ad hoc browser-local instructions.
- When changing a one-time localStorage seed, bump the seed version value so existing browser sessions reload the new layout once.
- Do not change the seed `useEffect` dependency array shape during a live dev session; React Fast Refresh can throw if the dependency array length changes between renders.
- Preserve the user's local settings, especially API keys stored in browser localStorage.
