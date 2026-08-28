import type { LabelOffset, LabelOffsets, MapMarkerMode, ScreenPoint } from "./types";

export interface LabelLayoutItem {
  id: number;
  anchor: ScreenPoint;
  lineCount: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const labelSize = (mode: MapMarkerMode, lineCount: number): { width: number; height: number } => {
  if (mode === "pin") return { width: 28, height: 34 };
  if (mode === "compact") return { width: 154, height: Math.max(44, 28 + Math.min(lineCount, 1) * 18) };
  return { width: 196, height: Math.max(44, 28 + Math.max(0, lineCount - 1) * 19) };
};

const intersects = (a: Rect, b: Rect, gap = 5): boolean => !(
  a.right + gap <= b.left || a.left >= b.right + gap || a.bottom + gap <= b.top || a.top >= b.bottom + gap
);

const rectFor = (anchor: ScreenPoint, offset: LabelOffset, width: number, height: number): Rect => ({
  left: anchor.x + offset.x,
  top: anchor.y + offset.y,
  right: anchor.x + offset.x + width,
  bottom: anchor.y + offset.y + height,
});

const candidates = (width: number, height: number): LabelOffset[] => {
  const result: LabelOffset[] = [];
  // Keep cards close to their true point first, then expand in eight directions.
  for (const radius of [14, 34, 58, 86, 118, 150, 180]) {
    result.push(
      { x: radius, y: -height / 2 },
      { x: -width - radius, y: -height / 2 },
      { x: -width / 2, y: -height - radius },
      { x: -width / 2, y: radius },
      { x: radius, y: -height - radius },
      { x: -width - radius, y: -height - radius },
      { x: radius, y: radius },
      { x: -width - radius, y: radius },
    );
  }
  return result;
};

export const autoAvoidLabels = (
  items: LabelLayoutItem[],
  mode: MapMarkerMode,
  viewportWidth: number,
  viewportHeight: number,
): LabelOffsets => {
  const offsets: LabelOffsets = {};
  const occupied: Rect[] = [];
  const ordered = [...items].sort((left, right) => left.anchor.y - right.anchor.y || left.anchor.x - right.anchor.x);

  ordered.forEach((item) => {
    const size = labelSize(mode, item.lineCount);
    if (mode === "pin") {
      offsets[item.id] = { x: -size.width / 2, y: -size.height };
      return;
    }
    const options = candidates(size.width, size.height);
    let selected = options[0];
    for (const option of options) {
      const rect = rectFor(item.anchor, option, size.width, size.height);
      const inside = rect.left >= 6 && rect.top >= 58 && rect.right <= viewportWidth - 6 && rect.bottom <= viewportHeight - 6;
      if (inside && !occupied.some((existing) => intersects(rect, existing))) {
        selected = option;
        break;
      }
    }
    offsets[item.id] = selected;
    occupied.push(rectFor(item.anchor, selected, size.width, size.height));
  });
  return offsets;
};

export const resetLabelOffsets = (items: LabelLayoutItem[], mode: MapMarkerMode): LabelOffsets => Object.fromEntries(
  items.map((item) => {
    const size = labelSize(mode, item.lineCount);
    return [item.id, mode === "pin" ? { x: -14, y: -34 } : { x: 16, y: -size.height / 2 }];
  }),
);
