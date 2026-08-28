export type SupplierType = "cement" | "slag" | "flyash" | "mixed" | "terminal" | "warehouse" | "concrete" | "project";
export type ProductCategory = "水泥" | "矿粉" | "粉煤灰";
export type LocationAccuracy = "verified" | "geocoded" | "approximate" | "unknown";

export interface PriceHistory {
  id: number;
  product_id: number;
  price: string;
  date: string;
  remark?: string;
}

export interface Product {
  id: number;
  supplier_id: number;
  category: ProductCategory;
  brand?: string;
  spec?: string;
  price: string;
  unit: string;
  updated_at: string;
  remark?: string;
  price_history: PriceHistory[];
}

export interface Supplier {
  id: number;
  name: string;
  short_name?: string;
  supplier_type: SupplierType;
  province: string;
  city: string;
  district?: string;
  address: string;
  longitude: number;
  latitude: number;
  location_accuracy: LocationAccuracy;
  contact?: string;
  phone?: string;
  remark?: string;
  created_at: string;
  updated_at: string;
  products: Product[];
}

export interface ProductDraft {
  category: ProductCategory;
  brand?: string;
  spec?: string;
  price: number;
  unit: string;
  remark?: string;
}

export interface SupplierDraft {
  name: string;
  short_name?: string;
  supplier_type: SupplierType;
  province: string;
  city: string;
  district?: string;
  address: string;
  longitude: number;
  latitude: number;
  location_accuracy: LocationAccuracy;
  contact?: string;
  phone?: string;
  remark?: string;
  products: ProductDraft[];
}

export interface Coordinate {
  longitude: number;
  latitude: number;
}

export interface PlaceSearchResult extends Coordinate {
  id: string;
  name: string;
  address: string;
  formatted_address: string;
  province: string;
  city: string;
  district: string;
  type: string;
  typecode: string;
  location_accuracy: "geocoded";
  coordinate_system: "GCJ-02";
}

export interface BatchImportResponse {
  total: number;
  imported_count: number;
  failed_count: number;
  match_threshold: number;
  imported: Array<{
    supplier_id: number;
    name: string;
    matched_name: string;
    match_score: number;
    address: string;
    longitude: number;
    latitude: number;
    coordinate_system: "GCJ-02";
  }>;
  failed: Array<{ row_number: number; name: string; reason: string }>;
}

export interface RouteStep {
  instruction: string;
  road_name: string;
  distance_meters: number;
  duration_seconds: number;
  polyline: [number, number][];
}

export interface DrivingRouteResponse {
  distance_meters: number;
  distance_km: number;
  duration_seconds: number;
  duration_minutes: number;
  route_steps: RouteStep[];
  polyline: [number, number][];
  coordinate_system: "GCJ-02";
  route_source: "amap_driving_v5";
}

export interface RouteResult extends DrivingRouteResponse {
  origin: string;
  destination: string;
}

export interface CompareRow {
  supplier_id: number;
  supplier: string;
  product: string;
  brand: string;
  spec: string;
  category: ProductCategory;
  price: number;
  distance_meters: number;
  distance_km: number;
  duration_minutes: number;
  freight_rate: number;
  freight: number;
  landed_price: number;
}

export interface CompareResponse {
  items: CompareRow[];
  failed_suppliers: Array<{ supplier_id: number; supplier: string; error: string }>;
  route_source: "amap_driving_v5";
  coordinate_system: "GCJ-02";
}
