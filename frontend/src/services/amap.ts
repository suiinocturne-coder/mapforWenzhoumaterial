import { load } from "@amap/amap-jsapi-loader";

import type { RouteResult, Supplier } from "../types";
import type { MapCallbacks, MapController, TemporaryLocation } from "./map/types";

const WENZHOU_DEFAULT_ZOOM = 10;
const COUNTY_LEVEL_ZOOM = 11;
const AMAP_VERSION = "2.0";
const AMAP_PLUGINS = ["AMap.Scale", "AMap.ToolBar"];

const TYPE_COLORS: Record<string, string> = {
  cement: "#2f6fec",
  slag: "#1f9d68",
  flyash: "#e58b28",
  mixed: "#516d91",
  terminal: "#d7a72c",
  warehouse: "#e3b341",
  concrete: "#7b5ed7",
  project: "#dc4c4c",
};

const TYPE_LABELS: Record<string, string> = {
  cement: "水泥供应商",
  slag: "矿粉供应商",
  flyash: "粉煤灰供应商",
  mixed: "综合供应商",
  terminal: "码头 / 中转库",
  warehouse: "仓库",
  concrete: "混凝土公司",
  project: "工地",
};

export interface AMapApi {
  Map: typeof AMap.Map;
  Marker: typeof AMap.Marker;
  InfoWindow: typeof AMap.InfoWindow;
  Polyline: typeof AMap.Polyline;
  Pixel: typeof AMap.Pixel;
  Scale: new (options?: Record<string, unknown>) => AMap.Control;
  ToolBar: new (options?: Record<string, unknown>) => AMap.Control;
}

interface AMapPointerEvent {
  lnglat: AMap.LngLat;
}

type ResizableAMap = AMap.Map & { resize?: () => void };

let loaderPromise: Promise<AMapApi> | undefined;

const environment = () => ({
  key: import.meta.env.VITE_AMAP_JS_KEY?.trim() ?? "",
  securityCode: import.meta.env.VITE_AMAP_SECURITY_CODE?.trim() ?? "",
});

export const getAmapConfigurationError = (): string | undefined => {
  const { key, securityCode } = environment();
  if (!key) return "高德地图 Key 未配置";
  if (!securityCode) return "高德地图安全密钥未配置";
  return undefined;
};

export const loadAmapApi = (): Promise<AMapApi> => {
  const configError = getAmapConfigurationError();
  if (configError) return Promise.reject(new Error(configError));
  if (loaderPromise) return loaderPromise;

  const { key, securityCode } = environment();
  window._AMapSecurityConfig = { securityJsCode: securityCode };
  loaderPromise = load({ key, version: AMAP_VERSION, plugins: AMAP_PLUGINS })
    .then((api: unknown) => api as AMapApi)
    .catch((reason: unknown) => {
      loaderPromise = undefined;
      const detail = reason instanceof Error ? reason.message : String(reason);
      throw new Error(`高德地图 API 2.0 加载失败：${detail || "未知错误"}`);
    });
  return loaderPromise;
};

const createMarkerElement = (supplier: Supplier): HTMLButtonElement => {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `amap-material-marker ${supplier.location_accuracy === "approximate" ? "is-approximate" : ""}`;
  marker.style.setProperty("--marker-color", TYPE_COLORS[supplier.supplier_type]);
  marker.ariaLabel = supplier.name;
  marker.title = supplier.name;
  marker.append(document.createElement("span"));
  return marker;
};

const createTemporaryMarkerElement = (location: TemporaryLocation): HTMLButtonElement => {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `amap-temporary-marker ${location.confirmed ? "is-confirmed" : ""}`;
  marker.ariaLabel = location.confirmed ? "已确认的新点位" : "待确认的新点位，可拖动修正";
  marker.title = "拖动修正位置";
  const dot = document.createElement("span");
  const label = document.createElement("small");
  label.textContent = location.confirmed ? "位置已确认" : "拖动修正位置";
  marker.append(dot, label);
  return marker;
};

const createInfoWindowContent = (supplier: Supplier, callbacks: MapCallbacks): HTMLDivElement => {
  const container = document.createElement("div");
  container.className = "supplier-info-window";

  const title = document.createElement("strong");
  title.textContent = supplier.name;
  const type = document.createElement("span");
  type.className = "supplier-info-type";
  type.textContent = TYPE_LABELS[supplier.supplier_type] ?? supplier.supplier_type;
  const address = document.createElement("p");
  address.textContent = `${supplier.district ? `${supplier.district} · ` : ""}${supplier.address}`;
  container.append(title, type, address);

  if (supplier.products.length) {
    const products = document.createElement("ul");
    supplier.products.forEach((product) => {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = product.brand
        ? [product.brand, product.spec].filter(Boolean).join(" ")
        : product.spec
          ? `${product.spec}${product.category}`
          : product.category;
      const price = document.createElement("b");
      price.textContent = `${Number(product.price).toFixed(0)}${product.unit}`;
      row.append(name, price);
      const updated = document.createElement("time");
      updated.dateTime = product.updated_at;
      updated.textContent = `更新：${new Date(product.updated_at).toLocaleDateString("zh-CN")}`;
      item.append(row, updated);
      products.append(item);
    });
    container.append(products);
  } else {
    const empty = document.createElement("p");
    empty.className = "supplier-info-empty";
    empty.textContent = "暂无商品报价";
    container.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "supplier-info-actions";
  const actionDefinitions: Array<[string, string, () => void]> = [
    ["查看详情", "details", () => callbacks.onViewDetails(supplier)],
    ["设为起点", "origin", () => callbacks.onSetOrigin(supplier)],
    ["设为终点", "destination", () => callbacks.onSetDestination(supplier)],
  ];
  actionDefinitions.forEach(([label, action, handler]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", handler);
    actions.append(button);
  });
  container.append(actions);
  return container;
};

export const createAmapController = (
  container: HTMLDivElement,
  api: AMapApi,
  callbacks: MapCallbacks,
): MapController => {
  const map = new api.Map(container, {
    center: [120.6994, 27.9943],
    zoom: WENZHOU_DEFAULT_ZOOM,
    viewMode: "2D",
    mapStyle: "amap://styles/light",
    dragEnable: true,
    zoomEnable: true,
    scrollWheel: true,
    doubleClickZoom: true,
    keyboardEnable: true,
  });
  map.addControl(new api.Scale());
  map.addControl(new api.ToolBar({ position: "RT" }));
  const resizeMap = () => {
    const resizableMap = map as ResizableAMap;
    if (typeof resizableMap.resize === "function") resizableMap.resize();
    else window.dispatchEvent(new Event("resize"));
  };
  const resizeObserver = new ResizeObserver(() => resizeMap());
  resizeObserver.observe(container);
  let initialViewportPending = true;
  const applyInitialViewport = () => {
    if (!initialViewportPending) return;
    initialViewportPending = false;
    map.setZoomAndCenter(WENZHOU_DEFAULT_ZOOM, [120.6994, 27.9943], true);
  };
  const cancelInitialViewport = () => {
    initialViewportPending = false;
    if (initialViewportTimer !== undefined) window.clearTimeout(initialViewportTimer);
  };
  // Empty databases still need a deterministic Wenzhou start view. When real
  // markers arrive first, updateMarkers cancels this fallback and fits them.
  const initialViewportTimer = window.setTimeout(applyInitialViewport, 2000);

  const markers = new Map<number, AMap.Marker>();
  let temporaryMarker: AMap.Marker | null = null;
  const infoWindow = new api.InfoWindow({
    anchor: "bottom-center",
    offset: new api.Pixel(0, -30),
    autoMove: false,
    closeWhenClickMap: true,
  });
  let routeLine: AMap.Polyline | null = null;
  let openedSupplierId: number | undefined;

  map.on("click", (event: AMapPointerEvent) => {
    infoWindow.close();
    openedSupplierId = undefined;
    callbacks.onMapClick(event.lnglat.getLng(), event.lnglat.getLat());
  });
  const emitViewport = () => {
    const center = map.getCenter();
    callbacks.onViewportChange?.({ center: [center.getLng(), center.getLat()], zoom: map.getZoom() });
  };
  map.on("moveend", emitViewport);
  map.on("zoomend", emitViewport);
  window.setTimeout(emitViewport, 500);

  return {
    updateMarkers(suppliers) {
      const validSuppliers = suppliers.filter((supplier) => Number.isFinite(supplier.longitude) && Number.isFinite(supplier.latitude));
      const visibleIds = new Set(validSuppliers.map((supplier) => supplier.id));
      markers.forEach((marker, id) => {
        if (!visibleIds.has(id)) {
          map.remove(marker);
          markers.delete(id);
          if (openedSupplierId === id) {
            infoWindow.close();
            openedSupplierId = undefined;
          }
        }
      });

      validSuppliers.forEach((supplier) => {
        const existing = markers.get(supplier.id);
        if (existing) {
          existing.setPosition([supplier.longitude, supplier.latitude]);
          existing.setContent(createMarkerElement(supplier));
          existing.setExtData(supplier);
          if (openedSupplierId === supplier.id && infoWindow.getIsOpen()) {
            infoWindow.setContent(createInfoWindowContent(supplier, callbacks));
            infoWindow.open(map, [supplier.longitude, supplier.latitude]);
          }
          return;
        }

        const marker = new api.Marker({
          position: [supplier.longitude, supplier.latitude],
          content: createMarkerElement(supplier),
          anchor: "bottom-center",
          draggable: true,
          extData: supplier,
        });
        marker.on("click", () => {
          const current = marker.getExtData() as Supplier;
          openedSupplierId = current.id;
          infoWindow.setContent(createInfoWindowContent(current, callbacks));
          infoWindow.open(map, [current.longitude, current.latitude]);
          callbacks.onMarkerClick(current);
        });
        marker.on("dragend", (event: AMapPointerEvent) => {
          const current = marker.getExtData() as Supplier;
          callbacks.onMarkerDrag(current, event.lnglat.getLng(), event.lnglat.getLat());
        });
        markers.set(supplier.id, marker);
        map.add(marker);
      });
      if (initialViewportPending && markers.size > 0) {
        cancelInitialViewport();
        resizeMap();
        map.setZoomAndCenter(WENZHOU_DEFAULT_ZOOM, [120.6994, 27.9943], true);
        window.setTimeout(() => {
          resizeMap();
          map.setZoomAndCenter(WENZHOU_DEFAULT_ZOOM, [120.6994, 27.9943], true);
        }, 250);
      }
    },
    focus(supplier) {
      const marker = markers.get(supplier.id);
      if (!marker) return;
      cancelInitialViewport();
      const markerPosition = marker.getPosition();
      if (!markerPosition) return;
      const center: [number, number] = [markerPosition.getLng(), markerPosition.getLat()];
      map.setZoomAndCenter(COUNTY_LEVEL_ZOOM, center, true);
      openedSupplierId = supplier.id;
      infoWindow.setContent(createInfoWindowContent(supplier, callbacks));
      infoWindow.open(map, center);
    },
    showRoute(route: RouteResult) {
      cancelInitialViewport();
      if (routeLine) map.remove(routeLine);
      if (route.polyline.length < 2) {
        routeLine = null;
        return;
      }
      routeLine = new api.Polyline({
        path: route.polyline,
        strokeColor: "#2f6fec",
        strokeWeight: 7,
        strokeOpacity: 0.85,
        showDir: true,
      });
      map.add(routeLine);
      map.setFitView([routeLine], true, [70, 70, 70, 70]);
    },
    clearRoute() {
      if (!routeLine) return;
      map.remove(routeLine);
      routeLine = null;
    },
    setTemporaryMarker(location) {
      if (!location) {
        if (temporaryMarker) map.remove(temporaryMarker);
        temporaryMarker = null;
        return;
      }
      cancelInitialViewport();
      if (!temporaryMarker) {
        temporaryMarker = new api.Marker({
          position: [location.longitude, location.latitude],
          content: createTemporaryMarkerElement(location),
          anchor: "bottom-center",
          draggable: true,
          zIndex: 200,
        });
        temporaryMarker.on("dragend", (event: AMapPointerEvent) => {
          callbacks.onTemporaryMarkerDrag(event.lnglat.getLng(), event.lnglat.getLat());
        });
        map.add(temporaryMarker);
      } else {
        temporaryMarker.setPosition([location.longitude, location.latitude]);
        temporaryMarker.setContent(createTemporaryMarkerElement(location));
      }
      map.setZoomAndCenter(15, [location.longitude, location.latitude], true);
    },
    destroy() {
      cancelInitialViewport();
      resizeObserver.disconnect();
      infoWindow.close();
      map.destroy();
    },
  };
};
