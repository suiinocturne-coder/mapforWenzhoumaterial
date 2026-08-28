import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, AutoComplete, Button, Col, Divider, Drawer, Form, Input, InputNumber, Row, Select, Space, message } from "antd";
import { useEffect, useRef, useState } from "react";

import { api } from "../services/api";
import type { PlaceSearchResult, ProductDraft, Supplier, SupplierDraft, SupplierType } from "../types";
import type { TemporaryLocation } from "../services/map/types";

interface Props {
  open: boolean;
  initial?: Partial<SupplierDraft> | Supplier;
  onCancel: () => void;
  onSaved: (supplier: Supplier) => void;
  temporaryLocation?: TemporaryLocation;
  onLocated: (location: TemporaryLocation) => void;
  onLocationConfirmed: () => void;
}

const supplierTypes = [
  ["cement", "水泥供应商"], ["slag", "矿粉供应商"], ["flyash", "粉煤灰供应商"], ["mixed", "综合供应商"],
  ["terminal", "码头 / 中转库"], ["warehouse", "仓库"], ["concrete", "混凝土公司"], ["project", "工地"],
].map(([value, label]) => ({ value, label }));

const emptyProduct = (): ProductDraft => ({ category: "水泥", brand: "", spec: "", price: 0, unit: "元/吨" });

export function SupplierModal({ open, initial, onCancel, onSaved, temporaryLocation, onLocated, onLocationConfirmed }: Props) {
  const [form] = Form.useForm<Omit<SupplierDraft, "products">>();
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const placeSearchTimer = useRef<number | undefined>(undefined);
  const placeSearchVersion = useRef(0);
  const [messageApi, contextHolder] = message.useMessage();
  const isEdit = Boolean(initial && "id" in initial);

  useEffect(() => {
    if (!open) return;
    const defaults = {
      name: "", supplier_type: "cement" as SupplierType, province: "浙江省", city: "温州市", district: "", address: "",
      longitude: 120.6994, latitude: 27.9943, location_accuracy: "unknown" as const, contact: "", phone: "", remark: "", ...initial,
    };
    form.setFieldsValue(defaults);
    setProducts(isEdit ? [] : ((initial as Partial<SupplierDraft>)?.products ?? [emptyProduct()]));
  }, [open, initial, form, isEdit]);

  useEffect(() => {
    if (!open || !temporaryLocation) return;
    form.setFieldsValue({
      longitude: temporaryLocation.longitude,
      latitude: temporaryLocation.latitude,
      location_accuracy: temporaryLocation.accuracy,
      ...(temporaryLocation.address ? { address: temporaryLocation.address } : {}),
      ...(temporaryLocation.province ? { province: temporaryLocation.province } : {}),
      ...(temporaryLocation.city ? { city: temporaryLocation.city } : {}),
      ...(temporaryLocation.district ? { district: temporaryLocation.district } : {}),
    });
  }, [open, temporaryLocation, form]);

  useEffect(() => () => {
    if (placeSearchTimer.current !== undefined) window.clearTimeout(placeSearchTimer.current);
  }, []);

  const geocode = async () => {
    const address = form.getFieldValue("address");
    if (!address) { messageApi.warning("请先填写详细地址"); return; }
    setLocating(true);
    try {
      const result = await api.geocode(address);
      form.setFieldsValue({ province: result.province || "浙江省", city: result.city || "温州市", address: result.formatted_address, district: result.district, longitude: result.longitude, latitude: result.latitude, location_accuracy: result.location_accuracy });
      onLocated({ longitude: result.longitude, latitude: result.latitude, accuracy: result.location_accuracy, confirmed: false });
      if (result.uncertain) messageApi.warning(`已定位到${result.level || "大致区域"}，请拖动 Marker 修正并确认`);
      else messageApi.success("地址已定位，请在地图上核对并确认位置");
    } catch (error) { messageApi.error((error as Error).message); }
    finally { setLocating(false); }
  };

  const searchPlaces = (keyword: string) => {
    if (placeSearchTimer.current !== undefined) window.clearTimeout(placeSearchTimer.current);
    const normalized = keyword.trim();
    if (normalized.length < 2) {
      placeSearchVersion.current += 1;
      setPlaces([]);
      setSearchingPlaces(false);
      return;
    }
    const version = ++placeSearchVersion.current;
    setSearchingPlaces(true);
    placeSearchTimer.current = window.setTimeout(async () => {
      try {
        const results = await api.placeSearch(normalized);
        if (version === placeSearchVersion.current) setPlaces(results);
      } catch (error) {
        if (version === placeSearchVersion.current) {
          setPlaces([]);
          messageApi.error(`地址搜索失败：${(error as Error).message}`);
        }
      } finally {
        if (version === placeSearchVersion.current) setSearchingPlaces(false);
      }
    }, 350);
  };

  const selectPlace = (place: PlaceSearchResult) => {
    form.setFieldsValue({
      province: place.province || "浙江省",
      city: place.city || "温州市",
      district: place.district,
      address: place.formatted_address,
      longitude: place.longitude,
      latitude: place.latitude,
      location_accuracy: "geocoded",
    });
    onLocated({
      longitude: place.longitude,
      latitude: place.latitude,
      accuracy: "geocoded",
      confirmed: false,
      address: place.formatted_address,
      province: place.province || "浙江省",
      city: place.city || "温州市",
      district: place.district,
    });
    setPlaces([]);
    messageApi.success(`已定位“${place.name}”，请在地图上核对或拖动 Marker 后确认`);
  };

  const addressChanged = (value: string) => {
    if (!temporaryLocation?.confirmed || value === temporaryLocation.address) return;
    form.setFieldValue("location_accuracy", "unknown");
    onLocated({ ...temporaryLocation, accuracy: "unknown", confirmed: false, address: undefined });
  };

  const submit = async () => {
    if ((!isEdit && !temporaryLocation) || (temporaryLocation && !temporaryLocation.confirmed)) {
      messageApi.warning("请先在地图上核对临时 Marker，并点击“确认当前位置”");
      return;
    }
    setSaving(true);
    try {
      const values = await form.validateFields();
      const supplier = isEdit
        ? await api.updateSupplier((initial as Supplier).id, values)
        : await api.createSupplier({ ...values, products });
      messageApi.success(isEdit ? "供应商已更新" : "点位已保存");
      onSaved(supplier);
    } catch (error) {
      if (error instanceof Error) messageApi.error(error.message);
    } finally { setSaving(false); }
  };

  const updateProduct = (index: number, patch: Partial<ProductDraft>) => setProducts((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));

  const confirmLocation = () => {
    if (!temporaryLocation) { messageApi.warning("请先输入地址定位，或在地图上选择位置"); return; }
    form.setFieldValue("location_accuracy", "verified");
    onLocationConfirmed();
    messageApi.success("当前位置已人工确认，可以保存");
  };

  return (
    <Drawer title={isEdit ? "编辑供应商" : "新增地图点位"} open={open} onClose={onCancel} width={560} mask={false} destroyOnHidden footer={<div className="supplier-drawer-footer"><Button onClick={onCancel}>取消</Button><Button type="primary" loading={saving} onClick={() => void submit()}>保存供应商</Button></div>}>
      {contextHolder}
      <Form form={form} layout="vertical" size="middle">
        <Form.Item name="province" hidden><Input /></Form.Item>
        <Form.Item name="city" hidden><Input /></Form.Item>
        <Row gutter={14}>
          <Col span={16}><Form.Item label="供应商 / 点位名称" name="name" rules={[{ required: true, message: "请输入名称" }]}><Input placeholder="例如：瑞安XX码头" /></Form.Item></Col>
          <Col span={8}><Form.Item label="点位类型" name="supplier_type" rules={[{ required: true }]}><Select options={supplierTypes} /></Form.Item></Col>
          <Col span={8}><Form.Item label="简称" name="short_name"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="区县" name="district"><Select allowClear showSearch options={["鹿城区","龙湾区","瓯海区","洞头区","瑞安市","乐清市","龙港市","永嘉县","平阳县","苍南县","文成县","泰顺县"].map(value => ({ value }))} /></Form.Item></Col>
          <Col span={8}><Form.Item label="坐标准确性" name="location_accuracy"><Select options={[['verified','人工确认'],['geocoded','地址解析'],['approximate','大致位置'],['unknown','待确认']].map(([value,label]) => ({value,label}))} /></Form.Item></Col>
          <Col span={20}><Form.Item label="详细地址" name="address" rules={[{ required: true, message: "请输入地址" }]}>
            <AutoComplete
              options={places.map(place => ({
                value: place.formatted_address,
                place,
                label: <div className="place-search-option"><strong>{place.name}</strong><span>{place.district} · {place.address || place.formatted_address}</span></div>,
              }))}
              filterOption={false}
              onSearch={searchPlaces}
              onChange={addressChanged}
              onSelect={(_, option) => selectPlace((option as { place: PlaceSearchResult }).place)}
              onClear={() => setPlaces([])}
              allowClear
              placeholder="输入地点、道路或详细地址，选择结果后在地图确认"
            >
              <Input suffix={searchingPlaces ? <LoadingOutlined spin /> : <SearchOutlined />} />
            </AutoComplete>
          </Form.Item></Col>
          <Col span={4}><Form.Item label=" "><Button block icon={<EnvironmentOutlined />} loading={locating} onClick={() => void geocode()}>定位</Button></Form.Item></Col>
          <Col span={8}><Form.Item label="经度" name="longitude" rules={[{ required: true }]}><InputNumber className="full-width" precision={6} /></Form.Item></Col>
          <Col span={8}><Form.Item label="纬度" name="latitude" rules={[{ required: true }]}><InputNumber className="full-width" precision={6} /></Form.Item></Col>
          <Col span={8}><Form.Item label="联系人" name="contact"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item label="联系电话" name="phone"><Input /></Form.Item></Col>
          <Col span={16}><Form.Item label="备注" name="remark"><Input /></Form.Item></Col>
        </Row>
        {(!isEdit || temporaryLocation) && <div className="location-confirmation">
          <Alert showIcon type={temporaryLocation?.confirmed ? "success" : "warning"} message={temporaryLocation?.confirmed ? "位置已经人工确认" : temporaryLocation ? "临时 Marker 已显示，请在地图上核对或拖动修正" : "位置尚未确认"} description={temporaryLocation ? `${temporaryLocation.longitude.toFixed(6)}, ${temporaryLocation.latitude.toFixed(6)}` : "输入地址并点击“定位”，或直接在地图上选择位置。"} />
          <Button type={temporaryLocation?.confirmed ? "default" : "primary"} icon={<EnvironmentOutlined />} disabled={!temporaryLocation} onClick={confirmLocation}>{temporaryLocation?.confirmed ? "重新确认当前位置" : "确认当前位置"}</Button>
        </div>}
      </Form>
      {!isEdit && <>
        <Divider orientation="left">商品与当前报价</Divider>
        <div className="product-editor-head"><span>一个供应商可录入多种材料</span><Button size="small" icon={<PlusOutlined />} onClick={() => setProducts(items => [...items, emptyProduct()])}>添加商品</Button></div>
        {products.map((product, index) => (
          <Space.Compact key={index} block className="product-editor-row">
            <Select value={product.category} style={{ width: 105 }} options={["水泥","矿粉","粉煤灰"].map(value => ({value}))} onChange={category => updateProduct(index, { category })} />
            <Input value={product.brand} placeholder="品牌" onChange={e => updateProduct(index, { brand: e.target.value })} />
            <Input value={product.spec} placeholder="规格/等级" onChange={e => updateProduct(index, { spec: e.target.value })} />
            <InputNumber value={product.price} min={0} placeholder="价格" onChange={price => updateProduct(index, { price: price ?? 0 })} />
            <Input value={product.unit} placeholder="单位" onChange={e => updateProduct(index, { unit: e.target.value })} />
            <Button danger icon={<DeleteOutlined />} onClick={() => setProducts(items => items.filter((_, i) => i !== index))} />
          </Space.Compact>
        ))}
      </>}
    </Drawer>
  );
}
