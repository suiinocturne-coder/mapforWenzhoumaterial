import type { Supplier } from "../../types";
import { labelSize } from "./layout";
import { supplierCardContent, supplierTypeColor } from "./content";
import type { LabelOffsets, MapExportConfig, ScreenPoint } from "./types";

interface RenderMapImageOptions {
  backgroundDataUrl: string;
  config: MapExportConfig;
  suppliers: Supplier[];
  anchors: Record<number, ScreenPoint>;
  offsets: LabelOffsets;
  previewWidth: number;
  previewHeight: number;
}

const loadImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("地图底图无法读取"));
  image.src = source;
});

const roundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    if (context.measureText(current + character).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else current += character;
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
};

const drawTitle = (context: CanvasRenderingContext2D, config: MapExportConfig, scale: number) => {
  if (!config.title && !config.subtitle) return;
  const padding = 34 * scale;
  const alignX = config.titlePosition === "left" ? padding : config.titlePosition === "right" ? config.width - padding : config.width / 2;
  context.textAlign = config.titlePosition;
  context.textBaseline = "top";
  context.fillStyle = "rgba(255,255,255,.94)";
  const boxWidth = Math.min(config.width - padding * 2, 720 * scale);
  const boxX = config.titlePosition === "left" ? padding : config.titlePosition === "right" ? config.width - padding - boxWidth : (config.width - boxWidth) / 2;
  roundedRect(context, boxX, 24 * scale, boxWidth, config.subtitle ? 92 * scale : 62 * scale, 8 * scale);
  context.fill();
  context.fillStyle = "#17233d";
  context.font = `700 ${28 * scale}px "Microsoft YaHei", sans-serif`;
  context.fillText(config.title, alignX, 34 * scale);
  if (config.subtitle) {
    context.fillStyle = "#687891";
    context.font = `400 ${15 * scale}px "Microsoft YaHei", sans-serif`;
    context.fillText(config.subtitle, alignX, 70 * scale);
  }
};

const drawLegend = (context: CanvasRenderingContext2D, config: MapExportConfig, scale: number) => {
  if (!config.showLegend || !config.showSuppliers) return;
  const entries: Array<[string, string]> = [["水泥", "#2f6fec"], ["矿粉", "#1f9d68"], ["粉煤灰", "#e58b28"], ["综合", "#516d91"]];
  const width = 310 * scale;
  const height = 44 * scale;
  const x = 28 * scale;
  const y = config.height - height - 26 * scale;
  context.fillStyle = "rgba(255,255,255,.94)";
  roundedRect(context, x, y, width, height, 7 * scale);
  context.fill();
  context.font = `500 ${13 * scale}px "Microsoft YaHei", sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  entries.forEach(([label, color], index) => {
    const entryX = x + (18 + index * 72) * scale;
    context.fillStyle = color;
    context.beginPath();
    context.arc(entryX, y + height / 2, 5 * scale, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#47566b";
    context.fillText(label, entryX + 10 * scale, y + height / 2);
  });
};

export const renderMapImage = async (options: RenderMapImageOptions): Promise<Blob> => {
  const { config, previewWidth, previewHeight } = options;
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建高清画布");
  const background = await loadImage(options.backgroundDataUrl);
  context.drawImage(background, 0, 0, config.width, config.height);
  const scaleX = config.width / previewWidth;
  const scaleY = config.height / previewHeight;
  const scale = Math.min(scaleX, scaleY);

  if (config.showSuppliers) {
    options.suppliers.forEach((supplier, index) => {
      const anchor = options.anchors[supplier.id];
      const offset = options.offsets[supplier.id];
      if (!anchor || !offset) return;
      const color = supplierTypeColor(supplier);
      const anchorX = anchor.x * scaleX;
      const anchorY = anchor.y * scaleY;
      const content = supplierCardContent(supplier, config);
      const lineCount = (content.title ? 1 : 0) + content.lines.length;
      const size = labelSize(config.markerMode, lineCount);
      const cardX = (anchor.x + offset.x) * scaleX;
      const cardY = (anchor.y + offset.y) * scaleY;

      if (config.markerMode === "pin") {
        context.fillStyle = color;
        context.beginPath();
        context.arc(anchorX, anchorY, 10 * scale, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "white";
        context.lineWidth = 3 * scale;
        context.stroke();
        context.fillStyle = "white";
        context.font = `700 ${10 * scale}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(index + 1), anchorX, anchorY);
        return;
      }

      const cardWidth = size.width * scaleX;
      const cardHeight = size.height * scaleY;
      context.strokeStyle = "rgba(59,72,91,.65)";
      context.lineWidth = Math.max(1, scale);
      context.beginPath();
      context.moveTo(anchorX, anchorY);
      context.lineTo(cardX + cardWidth / 2, cardY + cardHeight / 2);
      context.stroke();
      context.fillStyle = color;
      context.beginPath();
      context.arc(anchorX, anchorY, 5.5 * scale, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "white";
      context.lineWidth = 2 * scale;
      context.stroke();
      context.save();
      context.shadowColor = "rgba(25,42,65,.2)";
      context.shadowBlur = 9 * scale;
      context.shadowOffsetY = 3 * scale;
      context.fillStyle = "rgba(255,255,255,.96)";
      roundedRect(context, cardX, cardY, cardWidth, cardHeight, 7 * scale);
      context.fill();
      context.restore();
      context.strokeStyle = color;
      context.lineWidth = 1.4 * scale;
      roundedRect(context, cardX, cardY, cardWidth, cardHeight, 7 * scale);
      context.stroke();

      let textY = cardY + 10 * scaleY;
      const textX = cardX + 11 * scaleX;
      context.textAlign = "left";
      context.textBaseline = "top";
      if (content.title) {
        context.fillStyle = "#1d2a3e";
        context.font = `700 ${13 * scale}px "Microsoft YaHei", sans-serif`;
        wrapText(context, content.title, cardWidth - 22 * scaleX).forEach((line) => {
          context.fillText(line, textX, textY);
          textY += 17 * scaleY;
        });
      }
      context.fillStyle = "#47566c";
      context.font = `500 ${11.5 * scale}px "Microsoft YaHei", sans-serif`;
      content.lines.forEach((line) => {
        const clipped = line.length > 28 ? `${line.slice(0, 27)}…` : line;
        context.fillText(clipped, textX, textY);
        textY += 18 * scaleY;
      });
    });
  }

  drawTitle(context, config, scale);
  drawLegend(context, config, scale);
  const mime = config.exportFormat === "jpeg" ? "image/jpeg" : "image/png";
  const quality = config.exportFormat === "jpeg" ? 0.94 : undefined;
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("高清图片生成失败")), mime, quality));
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
