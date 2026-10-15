/**
 * Which rows of a fixed-row-height list are on screen (plus `overscan` rows on
 * each side), so a list of thousands renders only the dozen or so visible.
 * Returns [start, end) indices.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowPitch: number,
  count: number,
  overscan: number,
): { start: number; end: number } {
  if (count <= 0 || rowPitch <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowPitch);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / rowPitch);
  return {
    start: Math.min(count, Math.max(0, first - overscan)),
    end: Math.min(count, last + overscan),
  };
}
