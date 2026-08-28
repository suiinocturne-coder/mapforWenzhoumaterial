import type { BatchImportResponse, CompareResponse, Coordinate, DrivingRouteResponse, PlaceSearchResult, ProductDraft, RouteResult, Supplier, SupplierDraft } from "../types";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg: string }> };
      message = typeof body.detail === "string" ? body.detail : body.detail?.[0]?.msg ?? message;
    } catch { /* response is not JSON */ }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
};

export const api = {
  health: () => request<{ status: string }>("/health"),
  config: () => request<{ amap_key: string; amap_security_key: string; amap_configured: boolean }>("/config"),
  suppliers: (params: URLSearchParams) => request<Supplier[]>(`/suppliers?${params.toString()}`),
  createSupplier: (payload: SupplierDraft) => request<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(payload) }),
  updateSupplier: (id: number, payload: Partial<SupplierDraft>) => request<Supplier>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteSupplier: (id: number) => request<void>(`/suppliers/${id}`, { method: "DELETE" }),
  createProduct: (supplierId: number, payload: ProductDraft) => request(`/suppliers/${supplierId}/products`, { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (supplierId: number, productId: number, payload: Partial<ProductDraft>) => request(`/suppliers/${supplierId}/products/${productId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  placeSearch: (keyword: string) => request<PlaceSearchResult[]>("/map/place-search", { method: "POST", body: JSON.stringify({ keyword, city: "温州市", limit: 12 }) }),
  geocode: (address: string) => request<{ longitude: number; latitude: number; formatted_address: string; province: string; city: string; district: string; level: string; uncertain: boolean; location_accuracy: "geocoded" | "approximate"; coordinate_system: "GCJ-02" }>("/map/geocode", { method: "POST", body: JSON.stringify({ address }) }),
  reverseGeocode: (longitude: number, latitude: number) => request<{ address: string; formatted_address: string; province: string; city: string; district: string; township: string; location_accuracy: "geocoded"; coordinate_system: "GCJ-02" }>("/map/reverse-geocode", { method: "POST", body: JSON.stringify({ longitude, latitude }) }),
  drivingRoute: (origin: Coordinate, destination: Coordinate) => request<DrivingRouteResponse>("/map/driving-route", { method: "POST", body: JSON.stringify({ origin, destination }) }),
  route: (originId: number, destinationId: number) => request<RouteResult>("/map/route", { method: "POST", body: JSON.stringify({ origin_id: originId, destination_id: destinationId }) }),
  compare: (destinationId: number, category: string | undefined, freightRate: number) => request<CompareResponse>("/map/compare", { method: "POST", body: JSON.stringify({ destination_id: destinationId, category, freight_rate: freightRate }) }),
  aiParse: (text: string) => request<Record<string, unknown>>("/ai/parse", { method: "POST", body: JSON.stringify({ text }) }),
  aiBatchImport: (text: string) => request<BatchImportResponse>("/ai/batch-import", { method: "POST", body: JSON.stringify({ text }) }),
};
