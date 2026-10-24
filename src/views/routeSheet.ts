export type RouteSheetSnap = 'minimized' | 'collapsed' | 'half' | 'expanded';
export type RouteSheetHeights = Record<RouteSheetSnap, number>;

/** Heights leave a stable map window at the top and keep the compact summary usable. */
export function routeSheetHeights(viewportHeight: number): RouteSheetHeights {
  const viewport = Number.isFinite(viewportHeight) ? Math.max(320, viewportHeight) : 844;
  // The expanded route-detail keeps a compact map band above the sheet.
  const expanded = Math.min(840, viewport * 0.88, Math.max(0, viewport - 96));
  const half = Math.min(640, Math.max(280, viewport * 0.58), Math.max(200, expanded - 48));
  const collapsed = Math.min(240, Math.max(160, viewport * 0.28), Math.max(130, half - 48));
  // Fully collapsed minimized state: leaves >90% of screen free for pure interactive map navigation
  const minimized = 58;
  return { minimized, collapsed, half, expanded };
}

export function nearestRouteSheetSnap(height: number, heights: RouteSheetHeights): RouteSheetSnap {
  const choices: RouteSheetSnap[] = ['minimized', 'collapsed', 'half', 'expanded'];
  return choices.reduce((nearest, candidate) =>
    Math.abs(heights[candidate] - height) < Math.abs(heights[nearest] - height) ? candidate : nearest,
  'collapsed');
}

/** Positive velocity means an upward finger swipe; negative means downward. */
export function settleRouteSheetSnap(
  height: number,
  velocity: number,
  heights: RouteSheetHeights,
  startingSnap?: RouteSheetSnap,
  velocityThreshold = 0.35,
): RouteSheetSnap {
  if (Math.abs(velocity) < velocityThreshold) return nearestRouteSheetSnap(height, heights);
  const choices: RouteSheetSnap[] = ['minimized', 'collapsed', 'half', 'expanded'];
  const currentIndex = startingSnap ? choices.indexOf(startingSnap) : choices.indexOf(nearestRouteSheetSnap(height, heights));
  if (velocity > 0) return choices[Math.min(choices.length - 1, currentIndex + 1)];
  return choices[Math.max(0, currentIndex - 1)];
}
