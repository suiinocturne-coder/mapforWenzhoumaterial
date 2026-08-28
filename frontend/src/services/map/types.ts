import type { RouteResult, Supplier } from "../../types";

export interface TemporaryLocation {
  longitude: number;
  latitude: number;
  accuracy: "verified" | "geocoded" | "approximate" | "unknown";
  confirmed: boolean;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
}

export interface MapViewport {
  center: [number, number];
  zoom: number;
}

export interface MapCallbacks {
  onMapClick: (longitude: number, latitude: number) => void;
  onMarkerClick: (supplier: Supplier) => void;
  onMarkerDrag: (supplier: Supplier, longitude: number, latitude: number) => void;
  onTemporaryMarkerDrag: (longitude: number, latitude: number) => void;
  onViewDetails: (supplier: Supplier) => void;
  onSetOrigin: (supplier: Supplier) => void;
  onSetDestination: (supplier: Supplier) => void;
  onViewportChange?: (viewport: MapViewport) => void;
}

export interface MapController {
  updateMarkers(suppliers: Supplier[]): void;
  focus(supplier: Supplier): void;
  showRoute(route: RouteResult): void;
  clearRoute(): void;
  setTemporaryMarker(location?: TemporaryLocation): void;
  destroy(): void;
}
