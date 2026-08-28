import { Alert, Button, Spin } from "antd";
import { EnvironmentOutlined, PlusOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";

import { createAmapController, getAmapConfigurationError, loadAmapApi } from "../services/amap";
import type { MapCallbacks, MapController } from "../services/map/types";
import type { TemporaryLocation } from "../services/map/types";
import type { RouteResult, Supplier } from "../types";

interface Props extends MapCallbacks {
  suppliers: Supplier[];
  selected?: Supplier;
  selectionNonce: number;
  route?: RouteResult;
  onAddAtCenter: () => void;
  temporaryLocation?: TemporaryLocation;
}

export function MapCanvas({ suppliers, selected, selectionNonce, route, temporaryLocation, onMapClick, onMarkerClick, onMarkerDrag, onTemporaryMarkerDrag, onViewDetails, onSetOrigin, onSetDestination, onViewportChange, onAddAtCenter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | undefined>(undefined);
  const callbackRef = useRef({ onMapClick, onMarkerClick, onMarkerDrag, onTemporaryMarkerDrag, onViewDetails, onSetOrigin, onSetDestination, onViewportChange });
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState("");

  callbackRef.current = { onMapClick, onMarkerClick, onMarkerDrag, onTemporaryMarkerDrag, onViewDetails, onSetOrigin, onSetDestination, onViewportChange };

  useEffect(() => {
    let disposed = false;
    const init = async () => {
      const configurationError = getAmapConfigurationError();
      if (configurationError) {
        setError(configurationError);
        setStatus("missing");
        return;
      }
      try {
        const AMap = await loadAmapApi();
        if (!containerRef.current || disposed) return;
        controllerRef.current = createAmapController(containerRef.current, AMap, {
          onMapClick: (...args) => callbackRef.current.onMapClick(...args),
          onMarkerClick: (...args) => callbackRef.current.onMarkerClick(...args),
          onMarkerDrag: (...args) => callbackRef.current.onMarkerDrag(...args),
          onTemporaryMarkerDrag: (...args) => callbackRef.current.onTemporaryMarkerDrag(...args),
          onViewDetails: (...args) => callbackRef.current.onViewDetails(...args),
          onSetOrigin: (...args) => callbackRef.current.onSetOrigin(...args),
          onSetDestination: (...args) => callbackRef.current.onSetDestination(...args),
          onViewportChange: (...args) => callbackRef.current.onViewportChange?.(...args),
        });
        setStatus("ready");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "地图加载失败");
        setStatus("error");
      }
    };
    void init();
    return () => { disposed = true; controllerRef.current?.destroy(); };
  }, []);

  useEffect(() => { controllerRef.current?.updateMarkers(suppliers); }, [suppliers, status]);
  useEffect(() => { if (selected && status === "ready") controllerRef.current?.focus(selected); }, [selected, selectionNonce, status]);
  useEffect(() => {
    if (route) controllerRef.current?.showRoute(route);
    else controllerRef.current?.clearRoute();
  }, [route]);
  useEffect(() => { controllerRef.current?.setTemporaryMarker(temporaryLocation); }, [temporaryLocation, status]);

  return (
    <section className="map-canvas" aria-label="温州市供应商地图">
      <div className="amap-host" ref={containerRef} />
      {status === "loading" && <div className="map-loading"><Spin /><span>正在加载温州地图…</span></div>}
      {(status === "missing" || status === "error") && <div className="map-error-state"><Alert type={status === "missing" ? "warning" : "error"} showIcon message={error} description={status === "missing" ? "请在 frontend/.env 中配置 VITE_AMAP_JS_KEY 和 VITE_AMAP_SECURITY_CODE 后重启前端。" : "请检查网络、高德 Key、Security Code 与高德控制台域名白名单，然后刷新页面重试。"} /></div>}
      <div className="map-tools">
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddAtCenter}>新增点位</Button>
        <Button icon={<EnvironmentOutlined />} onClick={() => selected && controllerRef.current?.focus(selected)} disabled={!selected}>定位选中</Button>
      </div>
      <div className="map-legend">
        {[['水泥', '#2f6fec'], ['矿粉', '#1f9d68'], ['粉煤灰', '#e58b28'], ['工地', '#dc4c4c'], ['混凝土', '#7b5ed7'], ['码头/仓库', '#d7a72c']].map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}
      </div>
    </section>
  );
}
