import { AimOutlined, BarChartOutlined, CloudUploadOutlined, DatabaseOutlined, EnvironmentOutlined, FileExcelOutlined, HistoryOutlined, MenuFoldOutlined, PictureOutlined, RobotOutlined, SearchOutlined, SettingOutlined, ShopOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Layout, Menu, Select, Skeleton, Space, Statistic, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AIModal } from "./components/AIModal";
import { DetailPanel } from "./components/DetailPanel";
import { MapCanvas } from "./components/MapCanvas";
import { RouteModal } from "./components/RouteModal";
import { SupplierModal } from "./components/SupplierModal";
import { MapExportModal } from "./features/mapExport/MapExportModal";
import { api } from "./services/api";
import type { ProductCategory, RouteResult, Supplier, SupplierDraft, SupplierType } from "./types";
import type { MapViewport, TemporaryLocation } from "./services/map/types";
import "./styles.css";

const { Header, Sider, Content } = Layout;
const districts = ["鹿城区","龙湾区","瓯海区","洞头区","瑞安市","乐清市","龙港市","永嘉县","平阳县","苍南县","文成县","泰顺县"];
const layerOptions: Array<{ value: SupplierType; label: string }> = [{value:"cement",label:"水泥"},{value:"slag",label:"矿粉"},{value:"flyash",label:"粉煤灰"},{value:"project",label:"工地"},{value:"concrete",label:"混凝土公司"},{value:"terminal",label:"码头"},{value:"warehouse",label:"仓库"},{value:"mixed",label:"综合"}];

export default function App() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [selectionNonce, setSelectionNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState<string>();
  const [category, setCategory] = useState<ProductCategory>();
  const [layers, setLayers] = useState<SupplierType[]>(layerOptions.map(item => item.value));
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState<Partial<SupplierDraft> | Supplier>();
  const [temporaryLocation, setTemporaryLocation] = useState<TemporaryLocation>();
  const [aiOpen, setAiOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [route, setRoute] = useState<RouteResult>();
  const [routeOriginId, setRouteOriginId] = useState<number>();
  const [routeDestinationId, setRouteDestinationId] = useState<number>();
  const [mapExportOpen, setMapExportOpen] = useState(false);
  const [currentViewport, setCurrentViewport] = useState<MapViewport>({ center: [120.6994, 27.9943], zoom: 10 });
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (district) params.set("district", district);
    if (category) params.set("category", category);
    try { setSuppliers(await api.suppliers(params)); }
    catch (error) { messageApi.error((error as Error).message); }
    finally { setLoading(false); }
  }, [search, district, category, messageApi]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
  const visibleSuppliers = useMemo(() => suppliers.filter(item => layers.includes(item.supplier_type)), [suppliers, layers]);
  const selected = suppliers.find(item => item.id === selectedId);
  const counts = useMemo(() => ({
    concrete: suppliers.filter(item => item.supplier_type === "concrete").length,
    suppliers: suppliers.filter(item => item.supplier_type !== "concrete" && item.supplier_type !== "project").length,
    projects: suppliers.filter(item => item.supplier_type === "project").length,
  }), [suppliers]);
  const lowestPrices = useMemo(() => {
    const findLowest = (predicate: (product: Supplier["products"][number]) => boolean) => {
      const prices = suppliers
        .flatMap(supplier => supplier.products.filter(predicate).map(product => Number(product.price)))
        .filter(price => Number.isFinite(price) && price > 0);
      return prices.length ? Math.min(...prices) : undefined;
    };
    return {
      cement425: findLowest(product => {
        if (product.category !== "水泥") return false;
        const spec = (product.spec || "").toUpperCase().replace(/\s/g, "");
        return spec.includes("42.5") || spec.includes("425");
      }),
      slag: findLowest(product => product.category === "矿粉"),
      flyash: findLowest(product => product.category === "粉煤灰"),
    };
  }, [suppliers]);

  const startAdd = (longitude?: number, latitude?: number) => {
    const selectedOnMap = longitude !== undefined && latitude !== undefined;
    const location: TemporaryLocation = {
      longitude: longitude ?? 120.6994,
      latitude: latitude ?? 27.9943,
      accuracy: selectedOnMap ? "verified" : "unknown",
      confirmed: selectedOnMap,
    };
    setTemporaryLocation(location);
    setSupplierDraft({ longitude: location.longitude, latitude: location.latitude, address: "温州市", location_accuracy: location.accuracy, products: [] });
    setSupplierModal(true);
  };
  const handleMapClick = async (longitude: number, latitude: number) => {
    const location: TemporaryLocation = { longitude, latitude, accuracy: "verified", confirmed: true };
    setTemporaryLocation(location);
    messageApi.open({ key: "reverse-geocode", type: "loading", content: "正在获取地图点击位置的地址…", duration: 0 });
    try {
      const result = await api.reverseGeocode(longitude, latitude);
      const resolved: TemporaryLocation = {
        ...location,
        address: result.formatted_address,
        province: result.province || "浙江省",
        city: result.city || "温州市",
        district: result.district,
      };
      setTemporaryLocation(resolved);
      if (!supplierModal) {
        setSupplierDraft({
          longitude,
          latitude,
          province: resolved.province,
          city: resolved.city,
          district: resolved.district,
          address: resolved.address,
          location_accuracy: "verified",
          products: [],
        });
        setSupplierModal(true);
      }
      messageApi.open({ key: "reverse-geocode", type: "success", content: "已取得 GCJ-02 坐标和地址" });
    } catch (error) {
      if (!supplierModal) {
        setSupplierDraft({ longitude, latitude, address: "", location_accuracy: "verified", products: [] });
        setSupplierModal(true);
      }
      messageApi.open({ key: "reverse-geocode", type: "error", content: `已保留坐标，地址获取失败：${(error as Error).message}` });
    }
  };
  const markerDrag = async (supplier: Supplier, longitude: number, latitude: number) => {
    try { await api.updateSupplier(supplier.id, { longitude, latitude, location_accuracy: "verified" }); await load(); messageApi.success("坐标已校准"); }
    catch (error) { messageApi.error((error as Error).message); }
  };
  const selectSupplier = (supplier: Supplier) => {
    setSelectedId(supplier.id);
    setSelectionNonce(value => value + 1);
  };
  const setRoutePoint = (kind: "origin" | "destination", supplier: Supplier) => {
    setSelectedId(supplier.id);
    if (kind === "origin") {
      setRouteOriginId(supplier.id);
      messageApi.success(`已将“${supplier.short_name || supplier.name}”设为起点`);
    } else {
      setRouteDestinationId(supplier.id);
      messageApi.success(`已将“${supplier.short_name || supplier.name}”设为终点`);
    }
    setRouteOpen(true);
  };
  const remove = async () => {
    if (!selected) return;
    try { await api.deleteSupplier(selected.id); setSelectedId(undefined); await load(); messageApi.success("供应商已删除"); }
    catch (error) { messageApi.error((error as Error).message); }
  };

  return <Layout className="app-shell">
    {contextHolder}
    <Sider width={214} className="app-sider">
      <div className="brand"><div className="brand-mark">WZ</div><div><strong>建材供应链</strong><span>SUPPLY GIS</span></div></div>
      <Menu theme="dark" mode="inline" selectedKeys={["map"]} items={[
        { key:"overview", type:"group", label:"运营工作台", children:[
          {key:"map",icon:<EnvironmentOutlined />,label:"供应商地图"},{key:"suppliers",icon:<ShopOutlined />,label:"供应商"},{key:"products",icon:<DatabaseOutlined />,label:"产品价格"},{key:"history",icon:<HistoryOutlined />,label:"价格历史"},{key:"distance",icon:<AimOutlined />,label:"距离测算",onClick:()=>setRouteOpen(true)},
        ]},
        {key:"tools",type:"group",label:"数据工具",children:[{key:"ai",icon:<RobotOutlined />,label:"AI 智能录入",onClick:()=>setAiOpen(true)},{key:"excel",icon:<FileExcelOutlined />,label:"Excel 导入"},{key:"export",icon:<CloudUploadOutlined />,label:"数据导出"}]},
      ]} />
      <div className="sider-footer"><SettingOutlined /> 系统设置 <span>v0.1</span></div>
    </Sider>
    <Layout>
      <Header className="top-header">
        <Space><Button type="text" icon={<MenuFoldOutlined />} /><div><Typography.Title level={5}>温州市建材供应商地图</Typography.Title><Typography.Text type="secondary">报价、距离与到场成本一体化管理</Typography.Text></div></Space>
        <Space><span className="sync-status"><i /> 本地数据已连接</span><Button icon={<PictureOutlined />} onClick={()=>setMapExportOpen(true)}>生成地图</Button><Button icon={<RobotOutlined />} onClick={()=>setAiOpen(true)}>AI 录入</Button><Button type="primary" onClick={()=>startAdd()}>新增点位</Button></Space>
      </Header>
      <Content className="workspace">
        <div className="metrics-bar">
          <Statistic title="混凝土公司" value={counts.concrete} suffix="家" />
          <Statistic title="供应商" value={counts.suppliers} suffix="家" />
          <Statistic title="工地" value={counts.projects} suffix="个" />
          <div className="metric-prices">
            <BarChartOutlined />
            {[
              ["P.O42.5 最低价", lowestPrices.cement425],
              ["矿粉最低价", lowestPrices.slag],
              ["粉煤灰最低价", lowestPrices.flyash],
            ].map(([label, price]) => <div className="metric-price-item" key={label}><strong>{price === undefined ? "—" : `¥${Number(price).toFixed(0)}`}</strong><span>{label}</span></div>)}
          </div>
        </div>
        <div className="filter-bar">
          <Input prefix={<SearchOutlined />} allowClear placeholder="搜索供应商 / 地址 / 品牌 / 材料" value={search} onChange={event => setSearch(event.target.value)} />
          <Select allowClear placeholder="全部区县" value={district} options={districts.map(value=>({value}))} onChange={setDistrict} />
          <Select allowClear placeholder="全部材料" value={category} options={["水泥","矿粉","粉煤灰"].map(value=>({value}))} onChange={setCategory} />
          <Button icon={<AimOutlined />} onClick={()=>setRouteOpen(true)}>距离与成本测算</Button>
        </div>
        <div className="main-grid">
          <aside className="supplier-list-pane">
            <div className="pane-heading"><strong>供应商点位</strong><span>{visibleSuppliers.length} 个结果</span></div>
            <div className="layer-filter"><Checkbox.Group value={layers} options={layerOptions} onChange={values => setLayers(values as SupplierType[])} /></div>
            <div className="supplier-scroll">
              {loading ? <Skeleton active paragraph={{rows:8}} /> : visibleSuppliers.map(supplier => <button key={supplier.id} className={`supplier-card ${selectedId === supplier.id ? "active" : ""}`} onClick={()=>selectSupplier(supplier)}>
                <div className={`supplier-type-dot type-${supplier.supplier_type}`} /><div className="supplier-card-content"><div><strong>{supplier.short_name || supplier.name}</strong>{supplier.location_accuracy === "approximate" && <span className="accuracy-mark">待确认</span>}</div><span>{supplier.district} · {supplier.address}</span><div className="product-chips">{supplier.products.slice(0,3).map(p=><em key={p.id}>{p.brand || p.category} {p.spec} <b>¥{Number(p.price).toFixed(0)}</b></em>)}</div></div>
              </button>)}
            </div>
          </aside>
          <MapCanvas suppliers={visibleSuppliers} selected={selected} selectionNonce={selectionNonce} route={route} temporaryLocation={temporaryLocation} onMapClick={(longitude, latitude) => void handleMapClick(longitude, latitude)} onMarkerClick={supplier=>setSelectedId(supplier.id)} onMarkerDrag={markerDrag} onTemporaryMarkerDrag={(longitude, latitude) => void handleMapClick(longitude, latitude)} onViewDetails={supplier => setSelectedId(supplier.id)} onSetOrigin={supplier => setRoutePoint("origin", supplier)} onSetDestination={supplier => setRoutePoint("destination", supplier)} onViewportChange={setCurrentViewport} onAddAtCenter={()=>startAdd()} />
          <aside className="detail-pane"><DetailPanel supplier={selected} route={route} onEdit={()=>{if(selected){setTemporaryLocation(undefined);setSupplierDraft(selected);setSupplierModal(true)}}} onDelete={()=>void remove()} onRoute={()=>setRouteOpen(true)} onUpdated={()=>void load()} /></aside>
        </div>
      </Content>
    </Layout>
    <SupplierModal open={supplierModal} initial={supplierDraft} temporaryLocation={temporaryLocation} onLocated={setTemporaryLocation} onLocationConfirmed={() => setTemporaryLocation(location => location ? { ...location, accuracy: "verified", confirmed: true } : location)} onCancel={()=>{setSupplierModal(false);setTemporaryLocation(undefined)}} onSaved={supplier=>{setSupplierModal(false);setTemporaryLocation(undefined);setSelectedId(supplier.id);void load()}} />
    <RouteModal open={routeOpen} suppliers={suppliers} initialOrigin={routeOriginId ?? (selected?.supplier_type === "project" ? undefined : selected?.id)} initialDestination={routeDestinationId ?? (selected?.supplier_type === "project" ? selected.id : undefined)} onClose={()=>setRouteOpen(false)} onRoute={result=>{setRoute(result);setRouteOpen(false)}} />
    <AIModal open={aiOpen} onClose={()=>setAiOpen(false)} onUseResult={draft=>{setAiOpen(false);setTemporaryLocation(undefined);setSupplierDraft(draft);setSupplierModal(true)}} onBatchImported={()=>void load()} />
    <MapExportModal open={mapExportOpen} suppliers={suppliers} currentViewport={currentViewport} onClose={()=>setMapExportOpen(false)} />
  </Layout>;
}
