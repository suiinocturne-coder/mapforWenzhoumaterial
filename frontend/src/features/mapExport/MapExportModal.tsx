import { DownloadOutlined, FileImageOutlined, LayoutOutlined, ReloadOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Radio, Segmented, Select, Space, Switch, Typography, Upload, message } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProductCategory, Supplier } from "../../types";
import { MapExportPreview } from "./MapExportPreview";
import type { MapExportPreviewHandle } from "./MapExportPreview";
import { defaultMapExportConfig, WENZHOU_CUSTOM_IMAGE_BOUNDS } from "./types";
import type { MapCardFields, MapExportConfig, MapViewport } from "./types";
import { downloadBlob } from "./render";

interface Props {
  open: boolean;
  suppliers: Supplier[];
  currentViewport: MapViewport;
  onClose: () => void;
}

const STORAGE_KEY = "wenzhou-map-export-config-v1";
const categories: ProductCategory[] = ["水泥", "矿粉", "粉煤灰"];
const fieldOptions: Array<{ key: keyof MapCardFields; label: string }> = [
  { key: "supplierName", label: "供应商名称" },
  { key: "cementPrice", label: "水泥价格" },
  { key: "cementContact", label: "水泥供应人" },
  { key: "slagPrice", label: "矿粉价格" },
  { key: "slagContact", label: "矿粉供应人" },
  { key: "flyAshPrice", label: "粉煤灰价格" },
  { key: "flyAshContact", label: "粉煤灰供应人" },
  { key: "address", label: "地址" },
  { key: "phone", label: "电话" },
  { key: "remark", label: "备注" },
];
const sizePresets = [
  { value: "1920x1080", label: "1920 × 1080", width: 1920, height: 1080 },
  { value: "2560x1440", label: "2560 × 1440", width: 2560, height: 1440 },
  { value: "3840x2160", label: "3840 × 2160（4K）", width: 3840, height: 2160 },
  { value: "3508x2480", label: "A4 横版高清", width: 3508, height: 2480 },
  { value: "4961x3508", label: "A3 横版高清", width: 4961, height: 3508 },
  { value: "custom", label: "自定义", width: 0, height: 0 },
];

const readStoredConfig = (supplierIds: number[]): MapExportConfig => {
  const defaults = defaultMapExportConfig(supplierIds);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<MapExportConfig> | null;
    if (!stored) return defaults;
    const validIds = new Set(supplierIds);
    const storedIds = (stored.selectedSupplierIds || []).filter((id) => validIds.has(id));
    return {
      ...defaults,
      ...stored,
      fields: { ...defaults.fields, ...(stored.fields || {}) },
      customBounds: { ...defaults.customBounds, ...(stored.customBounds || {}) },
      selectedSupplierIds: storedIds.length ? storedIds : supplierIds,
    };
  } catch {
    return defaults;
  }
};

export function MapExportModal({ open, suppliers, currentViewport, onClose }: Props) {
  const previewRef = useRef<MapExportPreviewHandle>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [config, setConfig] = useState<MapExportConfig>(() => readStoredConfig(suppliers.map((supplier) => supplier.id)));
  const [supplierSearch, setSupplierSearch] = useState("");
  const [district, setDistrict] = useState<string>();
  const [customImageUrl, setCustomImageUrl] = useState<string>();
  const [customImageName, setCustomImageName] = useState<string>();
  const [zoomAdjustment, setZoomAdjustment] = useState(0);
  const [generatedBlob, setGeneratedBlob] = useState<Blob>();
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setGeneratedBlob(undefined);
  }, [config]);

  useEffect(() => {
    if (!open) return;
    setConfig((current) => {
      const known = new Set(current.selectedSupplierIds);
      const added = suppliers.map((supplier) => supplier.id).filter((id) => !known.has(id));
      return added.length ? { ...current, selectedSupplierIds: [...current.selectedSupplierIds, ...added] } : current;
    });
  }, [open, suppliers]);

  const validSuppliers = useMemo(() => suppliers.filter((supplier) => (
    typeof supplier.longitude === "number"
    && typeof supplier.latitude === "number"
    && Number.isFinite(supplier.longitude)
    && Number.isFinite(supplier.latitude)
    && supplier.longitude >= 70
    && supplier.longitude <= 140
    && supplier.latitude >= 0
    && supplier.latitude <= 60
  )), [suppliers]);
  const missingCoordinates = suppliers.length - validSuppliers.length;
  const districts = useMemo(() => [...new Set(validSuppliers.map((supplier) => supplier.district).filter(Boolean) as string[])].sort(), [validSuppliers]);
  const filteredList = useMemo(() => validSuppliers.filter((supplier) => {
    if (supplierSearch && !`${supplier.name}${supplier.short_name || ""}${supplier.address}`.toLowerCase().includes(supplierSearch.toLowerCase())) return false;
    if (district && supplier.district !== district) return false;
    return true;
  }), [district, supplierSearch, validSuppliers]);
  const selectedSuppliers = useMemo(() => validSuppliers.filter((supplier) => {
    if (!config.showSuppliers) return false;
    return config.selectedSupplierIds.includes(supplier.id);
  }), [config.selectedSupplierIds, config.showSuppliers, validSuppliers]);

  const update = <Key extends keyof MapExportConfig>(key: Key, value: MapExportConfig[Key]) => setConfig((current) => ({ ...current, [key]: value }));
  const applyWenzhouImageCalibration = () => {
    update("customBounds", { ...WENZHOU_CUSTOM_IMAGE_BOUNDS });
    messageApi.success("已应用“温州市地图.jpg”校准值");
  };
  const preset = sizePresets.find((item) => item.width === config.width && item.height === config.height)?.value || "custom";

  const generate = async () => {
    setGenerating(true);
    messageApi.open({ key: "map-export", type: "loading", content: "正在渲染高清地图…", duration: 0 });
    try {
      const blob = await previewRef.current?.exportImage();
      if (!blob) throw new Error("地图预览尚未准备完成");
      setGeneratedBlob(blob);
      messageApi.open({ key: "map-export", type: "success", content: `高清地图已生成（${config.width} × ${config.height}）` });
    } catch (error) {
      messageApi.open({ key: "map-export", type: "error", content: (error as Error).message, duration: 6 });
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!generatedBlob) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(generatedBlob, `温州市建材供应商分布图_${date}.${config.exportFormat === "jpeg" ? "jpg" : "png"}`);
  };

  return <Modal
    open={open}
    onCancel={onClose}
    footer={null}
    width="100vw"
    title={<Space><FileImageOutlined /><span>生成地图</span><Typography.Text type="secondary">用于汇报、打印和微信发送</Typography.Text></Space>}
    className="map-export-modal"
    destroyOnClose={false}
  >
    {contextHolder}
    <div className="map-export-workspace">
      <aside className="map-export-settings">
        <section>
          <h3>底图</h3>
          <Segmented block value={config.backgroundType} options={[{ label: "在线高德地图", value: "online" }, { label: "自定义高清地图", value: "custom" }]} onChange={(value) => update("backgroundType", value as MapExportConfig["backgroundType"])} />
          {config.backgroundType === "custom" && <div className="custom-map-settings">
            <Upload accept=".png,.jpg,.jpeg,.webp" showUploadList={false} beforeUpload={(file) => {
              if (!file.type.startsWith("image/")) { messageApi.error("只支持 PNG、JPG、JPEG、WebP 图片"); return Upload.LIST_IGNORE; }
              const reader = new FileReader();
              reader.onload = () => {
                setCustomImageUrl(String(reader.result));
                setCustomImageName(file.name);
                setGeneratedBlob(undefined);
                if (file.name.replace(/\s/g, "").includes("温州市地图")) {
                  setConfig((current) => ({ ...current, customBounds: { ...WENZHOU_CUSTOM_IMAGE_BOUNDS } }));
                  messageApi.success("已识别温州市地图并自动完成坐标校准");
                }
              };
              reader.readAsDataURL(file);
              return false;
            }}><Button block icon={<FileImageOutlined />}>上传地图底图</Button></Upload>
            {customImageName && <Typography.Text className="custom-map-filename" ellipsis>已上传：{customImageName}</Typography.Text>}
            <Button block size="small" onClick={applyWenzhouImageCalibration}>应用“温州市地图.jpg”校准值</Button>
            <p>经纬度边界校准（GCJ-02）</p>
            <div className="bounds-grid">
              <label>左边经度<InputNumber value={config.customBounds.minLng} precision={6} onChange={(value) => update("customBounds", { ...config.customBounds, minLng: Number(value) })} /></label>
              <label>右边经度<InputNumber value={config.customBounds.maxLng} precision={6} onChange={(value) => update("customBounds", { ...config.customBounds, maxLng: Number(value) })} /></label>
              <label>下边纬度<InputNumber value={config.customBounds.minLat} precision={6} onChange={(value) => update("customBounds", { ...config.customBounds, minLat: Number(value) })} /></label>
              <label>上边纬度<InputNumber value={config.customBounds.maxLat} precision={6} onChange={(value) => update("customBounds", { ...config.customBounds, maxLat: Number(value) })} /></label>
            </div>
          </div>}
        </section>

        <section>
          <div className="setting-title-row"><h3>显示供应商</h3><Switch checked={config.showSuppliers} onChange={(checked) => update("showSuppliers", checked)} /></div>
          {config.showSuppliers && <>
            <Checkbox.Group className="material-checkboxes" value={config.categories} options={categories.map((value) => ({ label: value, value }))} onChange={(values) => update("categories", values as ProductCategory[])} />
            <Space.Compact block><Input allowClear placeholder="搜索供应商" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} /><Select allowClear placeholder="区县" value={district} options={districts.map((value) => ({ value }))} onChange={setDistrict} /></Space.Compact>
            <div className="selection-actions"><Button size="small" onClick={() => update("selectedSupplierIds", [...new Set([...config.selectedSupplierIds, ...filteredList.map((supplier) => supplier.id)])])}>当前结果全选</Button><Button size="small" onClick={() => update("selectedSupplierIds", config.selectedSupplierIds.filter((id) => !filteredList.some((supplier) => supplier.id === id)))}>当前结果全不选</Button><span>{selectedSuppliers.length} 家已显示</span></div>
            <div className="map-export-supplier-list">
              {filteredList.map((supplier) => <Checkbox key={supplier.id} checked={config.selectedSupplierIds.includes(supplier.id)} onChange={(event) => update("selectedSupplierIds", event.target.checked ? [...config.selectedSupplierIds, supplier.id] : config.selectedSupplierIds.filter((id) => id !== supplier.id))}><strong>{supplier.short_name || supplier.name}</strong><small>{supplier.district}</small></Checkbox>)}
            </div>
          </>}
          {missingCoordinates > 0 && <Alert showIcon type="warning" message={`${missingCoordinates} 家供应商缺少坐标，未生成。`} />}
        </section>

        <section>
          <h3>标记样式</h3>
          <Radio.Group value={config.markerMode} onChange={(event) => update("markerMode", event.target.value)}>
            <Radio.Button value="pin">大头钉</Radio.Button><Radio.Button value="compact">简洁卡片</Radio.Button><Radio.Button value="full">完整卡片</Radio.Button>
          </Radio.Group>
          {config.markerMode !== "pin" && <>
            <p className="setting-label">卡片显示内容</p>
            <div className="field-checkboxes">{fieldOptions.map((field) => <Checkbox key={field.key} checked={config.fields[field.key]} onChange={(event) => update("fields", { ...config.fields, [field.key]: event.target.checked })}>{field.label}</Checkbox>)}</div>
          </>}
        </section>

        <section>
          <h3>地图范围</h3>
          <Radio.Group value={config.rangeMode} onChange={(event) => update("rangeMode", event.target.value)}><Radio value="auto">自动范围</Radio><Radio value="current">当前地图范围</Radio><Radio value="wenzhou">温州市全域</Radio></Radio.Group>
          <Checkbox disabled checked={config.showDistrictBoundary} onChange={(event) => update("showDistrictBoundary", event.target.checked)}>显示行政区边界（已预留 GeoJSON 接口）</Checkbox>
        </section>

        <section>
          <h3>标题与图例</h3>
          <Input value={config.title} placeholder="地图标题" onChange={(event) => update("title", event.target.value)} />
          <Input value={config.subtitle} placeholder="副标题，例如：2026年8月报价情况" onChange={(event) => update("subtitle", event.target.value)} />
          <Select value={config.titlePosition} options={[{ value: "left", label: "标题左上" }, { value: "center", label: "标题顶部居中" }, { value: "right", label: "标题右上" }]} onChange={(value) => update("titlePosition", value)} />
          <Checkbox checked={config.showLegend} onChange={(event) => update("showLegend", event.target.checked)}>显示图例</Checkbox>
        </section>

        <section>
          <h3>输出尺寸与格式</h3>
          <Select value={preset} options={sizePresets.map(({ value, label }) => ({ value, label }))} onChange={(value) => {
            const selected = sizePresets.find((item) => item.value === value);
            if (selected && selected.width) setConfig((current) => ({ ...current, width: selected.width, height: selected.height }));
          }} />
          <Space.Compact block><InputNumber min={800} max={6000} value={config.width} addonBefore="宽" onChange={(value) => update("width", Number(value))} /><InputNumber min={600} max={6000} value={config.height} addonBefore="高" onChange={(value) => update("height", Number(value))} /></Space.Compact>
          <Radio.Group value={config.exportFormat} onChange={(event) => update("exportFormat", event.target.value)}><Radio.Button value="png">PNG</Radio.Button><Radio.Button value="jpeg">JPEG</Radio.Button></Radio.Group>
        </section>
      </aside>

      <main className="map-export-preview-pane">
        <div className="map-export-toolbar">
          <Space><Button icon={<LayoutOutlined />} onClick={() => previewRef.current?.autoLayout()}>自动排版</Button><Button icon={<ReloadOutlined />} onClick={() => previewRef.current?.resetLabels()}>重置标签位置</Button><Button.Group><Button aria-label="放大在线地图" disabled={config.backgroundType !== "online" || zoomAdjustment >= 8} icon={<ZoomInOutlined />} onClick={() => setZoomAdjustment((value) => Math.min(8, value + 1))} /><Button aria-label="缩小在线地图" disabled={config.backgroundType !== "online" || zoomAdjustment <= -5} icon={<ZoomOutOutlined />} onClick={() => setZoomAdjustment((value) => Math.max(-5, value - 1))} /></Button.Group></Space>
          <Space><span>{config.width} × {config.height} · {selectedSuppliers.length} 个点位</span><Button type="primary" loading={generating} disabled={config.backgroundType === "custom" && !customImageUrl} icon={<FileImageOutlined />} onClick={() => void generate()}>生成地图</Button><Button disabled={!generatedBlob} icon={<DownloadOutlined />} onClick={download}>下载高清{config.exportFormat.toUpperCase()}</Button></Space>
        </div>
        <MapExportPreview ref={previewRef} config={config} suppliers={selectedSuppliers} currentViewport={currentViewport} zoomAdjustment={zoomAdjustment} customImageUrl={customImageUrl} />
        <div className="map-export-help">在线地图支持滚轮、双击、＋/－缩放和拖动；卡片可直接拖动，真实坐标点不会改变。设置已自动保存在当前浏览器。</div>
      </main>
    </div>
  </Modal>;
}
