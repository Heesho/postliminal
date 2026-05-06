export function imageGenerationProgressPercent(
  startedAt: unknown,
  nowMs = Date.now(),
) {
  const startMs =
    typeof startedAt === "number" && Number.isFinite(startedAt)
      ? startedAt
      : nowMs;
  const elapsedMs = Math.max(0, nowMs - startMs);

  return Math.min(96, 6 + Math.round((elapsedMs / 3200) * 90));
}
