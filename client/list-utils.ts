export type VerticalBounds = { top: number; height: number };

/** Rebuild positions from measured sizes when layout skips position-only callbacks. */
export function stackedBounds(
  order: readonly string[],
  measured: Readonly<Record<string, VerticalBounds>>,
  start: number,
  gap: number,
): Record<string, VerticalBounds> {
  let top = start;
  const bounds: Record<string, VerticalBounds> = {};
  for (const id of order) {
    const row = measured[id];
    if (!row) continue;
    bounds[id] = { top, height: row.height };
    top += row.height + gap;
  }
  return bounds;
}

/** Pointer coordinates and measured rows use the same scroll-content origin. */
export function contentY(pageY: number, viewportTop: number, scrollY: number) {
  return pageY - viewportTop + scrollY;
}

export function groupAtY(
  y: number,
  order: readonly string[],
  bounds: Readonly<Record<string, VerticalBounds>>,
): string | null {
  const measured = order.filter((id) => bounds[id]);
  if (!measured.length) return null;
  if (
    y < bounds[measured[0]]!.top ||
    y > bounds[measured.at(-1)!]!.top + bounds[measured.at(-1)!]!.height
  )
    return null;
  return (
    measured.find((id, index) => {
      const next = bounds[measured[index + 1]];
      return !next || y < (bounds[id]!.top + bounds[id]!.height + next.top) / 2;
    }) ?? null
  );
}

export function groupOrderAtY(
  order: readonly string[],
  moving: string,
  y: number,
  bounds: Readonly<Record<string, VerticalBounds>>,
): string[] {
  const next = order.filter((id) => id !== moving);
  const before = next.findIndex((id) => {
    const row = bounds[id];
    return row && y < row.top + row.height / 2;
  });
  next.splice(before < 0 ? next.length : before, 0, moving);
  return next;
}

export function cardAnchorAtY(
  y: number,
  moving: string,
  visibleIds: readonly string[],
  bounds: Readonly<Record<string, VerticalBounds>>,
): { anchor: string; side: "before" | "after" } | null {
  const neighbors = visibleIds.filter((id) => id !== moving && bounds[id]);
  const before = neighbors.find(
    (id) => y < bounds[id]!.top + bounds[id]!.height / 2,
  );
  const anchor = before ?? neighbors.at(-1);
  return anchor ? { anchor, side: before ? "before" : "after" } : null;
}

/** Visible row order and measured sizes determine positions after a reorder. */
export function rowBoundsInContent(
  ids: readonly string[],
  rows: Readonly<Record<string, VerticalBounds>>,
  groupTop: number,
  bodyTop: number,
  quickCreateHeight = 0,
): Record<string, VerticalBounds> {
  return stackedBounds(ids, rows, groupTop + bodyTop + quickCreateHeight, 0);
}
