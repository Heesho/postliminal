export function createId(prefix: string) {
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${time}_${entropy}`;
}
