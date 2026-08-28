import type { ProductCategory } from "../../types";
export type { MapViewport } from "../../services/map/types";

export type MapBackgroundType = "online" | "custom";
export type MapMarkerMode = "pin" | "compact" | "full";
export type MapRangeMode = "auto" | "current" | "wenzhou";
export type MapExportFormat = "png" | "jpeg";
export type MapTitlePosition = "left" | "center" | "right";

export interface CustomMapBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

// Calibrated against the supplied 7821 × 5377 “温州市地图.jpg”. The image is
// a Web-Mercator road map whose visible area extends beyond the city boundary.
export const WENZHOU_CUSTOM_IMAGE_BOUNDS: CustomMapBounds = {
  minLng: 119.55,
  maxLng: 121.50,
  minLat: 27.36,
  maxLat: 28.56,
};

export interface MapCardFields {
  supplierName: boolean;
  cementPrice: boolean;
  cementContact: boolean;
  slagPrice: boolean;
  slagContact: boolean;
  flyAshPrice: boolean;
  flyAshContact: boolean;
  address: boolean;
  phone: boolean;
  remark: boolean;
}

export interface MapExportConfig {
  backgroundType: MapBackgroundType;
  showSuppliers: boolean;
  selectedSupplierIds: number[];
  categories: ProductCategory[];
  markerMode: MapMarkerMode;
  fields: MapCardFields;
  rangeMode: MapRangeMode;
  title: string;
  subtitle: string;
  titlePosition: MapTitlePosition;
  showLegend: boolean;
  showDistrictBoundary: boolean;
  width: number;
  height: number;
  exportFormat: MapExportFormat;
  customBounds: CustomMapBounds;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type LabelOffset = ScreenPoint;

export type LabelOffsets = Record<number, LabelOffset>;

export const defaultMapExportConfig = (supplierIds: number[]): MapExportConfig => ({
  backgroundType: "online",
  showSuppliers: true,
  selectedSupplierIds: supplierIds,
  categories: ["水泥", "矿粉", "粉煤灰"],
  markerMode: "full",
  fields: {
    supplierName: true,
    cementPrice: true,
    cementContact: true,
    slagPrice: true,
    slagContact: true,
    flyAshPrice: true,
    flyAshContact: true,
    address: false,
    phone: false,
    remark: false,
  },
  rangeMode: "auto",
  title: "温州市建材供应商分布图",
  subtitle: "",
  titlePosition: "center",
  showLegend: true,
  showDistrictBoundary: false,
  width: 3840,
  height: 2160,
  exportFormat: "png",
  customBounds: { ...WENZHOU_CUSTOM_IMAGE_BOUNDS },
});
