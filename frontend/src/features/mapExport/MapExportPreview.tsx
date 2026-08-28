import { Alert, Spin } from "antd";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { loadAmapApi } from "../../services/amap";
import type { Supplier } from "../../types";
import { supplierCardContent, supplierTypeColor } from "./content";
import { autoAvoidLabels, labelSize, resetLabelOffsets } from "./layout";
import { renderMapImage } from "./render";
import type { LabelOffsets, MapExportConfig, MapViewport, ScreenPoint } from "./types";

interface Props {
  config: MapExportConfig;
  suppliers: Supplier[];
  currentViewport: MapViewport;
  zoomAdjustment: number;
  customImageUrl?: string;
}

export interface MapExportPreviewHandle {
  autoLayout(): void;
  resetLabels(): void;
  exportImage(): Promise<Blob>;
}

interface DragState {
  supplierId: number;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

const WENZHOU_CENTER: [number, number] = [120.6994, 27.9943];
const mercatorLatitude = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));

const autoViewport = (suppliers: Supplier[]): MapViewport => {
  if (!suppliers.length) return { center: WENZHOU_CENTER, zoom: 9 };
  const longitudes = suppliers.map((supplier) => supplier.longitude);
  const latitudes = suppliers.map((supplier) => supplier.latitude);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const span = Math.max(maxLng - minLng, (maxLat - minLat) * 1.25);
  const zoom = span > 1.2 ? 8 : span > 0.7 ? 9 : span > 0.34 ? 10 : span > 0.17 ? 11 : span > 0.08 ? 12 : 13;
  return { center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom };
};

const onlineViewport = (config: MapExportConfig, suppliers: Supplier[], currentViewport: MapViewport): MapViewport => {
  if (config.rangeMode === "current") return currentViewport;
  if (config.rangeMode === "wenzhou") return { center: WENZHOU_CENTER, zoom: 9 };
  return autoViewport(suppliers);
};

export const MapExportPreview = forwardRef<MapExportPreviewHandle, Props>(function MapExportPreview(
  { config, suppliers, currentViewport, zoomAdjustment, customImageUrl },
  ref,
) {
  const previewRef = useRef<HTMLDivElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState("");
  const [onlineZoom, setOnlineZoom] = useState(10);
  const [anchors, setAnchors] = useState<Record<number, ScreenPoint>>({});
  const [offsets, setOffsets] = useState<LabelOffsets>({});
  const [previewSize, setPreviewSize] = useState({ width: 1000, height: 600 });

  const cardData = useMemo(() => suppliers.map((supplier) => ({
    supplier,
    content: supplierCardContent(supplier, config),
  })), [suppliers, config]);

  const layoutItems = useMemo(() => cardData
    .filter(({ supplier }) => anchors[supplier.id])
    .map(({ supplier, content }) => ({
      id: supplier.id,
      anchor: anchors[supplier.id],
      lineCount: Math.max(1, (content.title ? 1 : 0) + content.lines.length),
    })), [cardData, anchors]);

  const calculateCustomAnchors = useCallback(() => {
    const { minLng, maxLng, minLat, maxLat } = config.customBounds;
    if (maxLng <= minLng || maxLat <= minLat) {
      setAnchors({});
      return;
    }
    const next: Record<number, ScreenPoint> = {};
    const topMercator = mercatorLatitude(maxLat);
    const bottomMercator = mercatorLatitude(minLat);
    suppliers.forEach((supplier) => {
      // The supplied road map uses Web Mercator. Longitude is linear; latitude
      // needs Mercator projection so northern and southern points stay aligned.
      next[supplier.id] = {
        x: ((supplier.longitude - minLng) / (maxLng - minLng)) * previewSize.width,
        y: ((topMercator - mercatorLatitude(supplier.latitude)) / (topMercator - bottomMercator)) * previewSize.height,
      };
    });
    setAnchors(next);
  }, [config.customBounds, previewSize, suppliers]);

  const calculateOnlineAnchors = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: Record<number, ScreenPoint> = {};
    suppliers.forEach((supplier) => {
      const pixel = map.lngLatToContainer([supplier.longitude, supplier.latitude]);
      next[supplier.id] = { x: pixel.getX(), y: pixel.getY() };
    });
    setAnchors(next);
  }, [suppliers]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      setPreviewSize({ width, height });
      const map = mapRef.current as (AMap.Map & { resize?: () => void }) | undefined;
      map?.resize?.();
      window.setTimeout(() => config.backgroundType === "online" ? calculateOnlineAnchors() : calculateCustomAnchors(), 50);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [calculateCustomAnchors, calculateOnlineAnchors, config.backgroundType]);

  useEffect(() => {
    if (config.backgroundType !== "online" || !mapHostRef.current) return;
    let disposed = false;
    void loadAmapApi().then((api) => {
      if (disposed || !mapHostRef.current) return;
      const viewport = onlineViewport(config, suppliers, currentViewport);
      const initialZoom = Math.max(3, Math.min(20, viewport.zoom + zoomAdjustment));
      const map = new api.Map(mapHostRef.current, {
        center: viewport.center,
        zoom: initialZoom,
        viewMode: "2D",
        mapStyle: "amap://styles/light",
        dragEnable: true,
        zoomEnable: true,
        scrollWheel: true,
        doubleClickZoom: true,
        keyboardEnable: true,
      });
      mapRef.current = map;
      const refresh = () => calculateOnlineAnchors();
      const refreshZoom = () => {
        setOnlineZoom(map.getZoom());
        refresh();
      };
      map.on("moveend", refresh);
      map.on("zoomend", refreshZoom);
      setOnlineZoom(map.getZoom());
      setMapStatus("ready");
      window.setTimeout(refresh, 350);
    }).catch((error: unknown) => {
      setMapError(error instanceof Error ? error.message : "高德地图加载失败");
      setMapStatus("error");
    });
    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  // Map instance is intentionally recreated only when the background mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.backgroundType]);

  useEffect(() => {
    if (config.backgroundType === "custom") {
      setMapStatus("ready");
      calculateCustomAnchors();
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const viewport = onlineViewport(config, suppliers, currentViewport);
    const targetZoom = Math.max(3, Math.min(20, viewport.zoom + zoomAdjustment));
    map.setZoomAndCenter(targetZoom, viewport.center, true);
    setOnlineZoom(targetZoom);
    window.setTimeout(calculateOnlineAnchors, 250);
  }, [calculateCustomAnchors, calculateOnlineAnchors, config, currentViewport, suppliers, zoomAdjustment]);

  useEffect(() => {
    if (!layoutItems.length) {
      setOffsets({});
      return;
    }
    setOffsets(autoAvoidLabels(layoutItems, config.markerMode, previewSize.width, previewSize.height));
  }, [config.markerMode, layoutItems, previewSize.height, previewSize.width]);

  const autoLayout = useCallback(() => {
    setOffsets(autoAvoidLabels(layoutItems, config.markerMode, previewSize.width, previewSize.height));
  }, [config.markerMode, layoutItems, previewSize]);

  const resetLabels = useCallback(() => setOffsets(resetLabelOffsets(layoutItems, config.markerMode)), [config.markerMode, layoutItems]);

  const backgroundDataUrl = useCallback(async (): Promise<string> => {
    if (config.backgroundType === "custom") {
      if (!customImageUrl) throw new Error("请先上传高清地图底图");
      return customImageUrl;
    }
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") throw new Error("在线地图尚未准备完成");
    try {
      const result = map.getScreenShot(config.width, config.height);
      if (!result || !result.startsWith("data:image")) throw new Error("高德未返回图片数据");
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`在线底图导出失败：${detail}。可切换到“自定义高清地图”稳定导出。`);
    }
  }, [config.backgroundType, config.height, config.width, customImageUrl, mapStatus]);

  useImperativeHandle(ref, () => ({
    autoLayout,
    resetLabels,
    async exportImage() {
      const preview = previewRef.current;
      if (!preview) throw new Error("地图预览尚未准备完成");
      return renderMapImage({
        backgroundDataUrl: await backgroundDataUrl(),
        config,
        suppliers,
        anchors,
        offsets,
        previewWidth: preview.clientWidth,
        previewHeight: preview.clientHeight,
      });
    },
  }), [anchors, autoLayout, backgroundDataUrl, config, offsets, resetLabels, suppliers]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffsets((current) => ({
      ...current,
      [drag.supplierId]: {
        x: drag.offsetX + event.clientX - drag.startX,
        y: drag.offsetY + event.clientY - drag.startY,
      },
    }));
  };

  const titleClass = `map-export-title title-${config.titlePosition}`;
  return <div className="map-export-preview-shell">
    <div
      ref={previewRef}
      className="map-export-preview"
      style={{ aspectRatio: `${config.width} / ${config.height}` }}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
    >
      {config.backgroundType === "online"
        ? <div ref={mapHostRef} className="map-export-online-layer" />
        : customImageUrl
          ? <img className="map-export-custom-layer" src={customImageUrl} alt="自定义温州地图底图" />
          : <div className="map-export-custom-empty">请在左侧上传 PNG、JPG、JPEG 或 WebP 高清底图</div>}
      {mapStatus === "loading" && config.backgroundType === "online" && <div className="map-export-loading"><Spin /><span>正在加载在线地图…</span></div>}
      {mapStatus === "error" && <Alert className="map-export-map-error" type="error" showIcon message={mapError} />}
      {config.backgroundType === "online" && mapStatus === "ready" && <div className="map-export-zoom-level">缩放 {onlineZoom.toFixed(0)}</div>}
      {config.showSuppliers && <>
        <svg className="map-export-lines" viewBox={`0 0 ${previewSize.width} ${previewSize.height}`} preserveAspectRatio="none">
          {cardData.map(({ supplier, content }) => {
            if (config.markerMode === "pin") return null;
            const anchor = anchors[supplier.id];
            const offset = offsets[supplier.id];
            if (!anchor || !offset) return null;
            const size = labelSize(config.markerMode, Math.max(1, (content.title ? 1 : 0) + content.lines.length));
            return <line key={supplier.id} x1={anchor.x} y1={anchor.y} x2={anchor.x + offset.x + size.width / 2} y2={anchor.y + offset.y + size.height / 2} />;
          })}
        </svg>
        <div className="map-export-label-layer">
          {cardData.map(({ supplier, content }, index) => {
            const anchor = anchors[supplier.id];
            const offset = offsets[supplier.id];
            if (!anchor || !offset) return null;
            const color = supplierTypeColor(supplier);
            if (config.markerMode === "pin") return <div key={supplier.id} className="map-export-pin" style={{ left: anchor.x - 13, top: anchor.y - 13, background: color }}>{index + 1}</div>;
            return <div key={supplier.id}>
              <span className="map-export-anchor" style={{ left: anchor.x - 5, top: anchor.y - 5, background: color }} />
              <div
                className={`map-export-card mode-${config.markerMode}`}
                style={{ left: anchor.x + offset.x, top: anchor.y + offset.y, borderColor: color }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { supplierId: supplier.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: offset.x, offsetY: offset.y };
                }}
              >
                {content.title && <strong>{content.title}</strong>}
                {content.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{line}</span>)}
              </div>
            </div>;
          })}
        </div>
      </>}
      {(config.title || config.subtitle) && <div className={titleClass}><strong>{config.title}</strong>{config.subtitle && <span>{config.subtitle}</span>}</div>}
      {config.showLegend && config.showSuppliers && <div className="map-export-legend"><span><i className="legend-cement" />水泥</span><span><i className="legend-slag" />矿粉</span><span><i className="legend-flyash" />粉煤灰</span><span><i className="legend-mixed" />综合</span></div>}
    </div>
  </div>;
});
