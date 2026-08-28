import { DeleteOutlined, EditOutlined, EnvironmentOutlined, HistoryOutlined, PhoneOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Descriptions, Divider, Empty, InputNumber, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { useState } from "react";

import { api } from "../services/api";
import type { Product, RouteResult, Supplier } from "../types";

interface Props {
  supplier?: Supplier;
  onEdit: () => void;
  onDelete: () => void;
  onRoute: () => void;
  onUpdated: () => void;
  route?: RouteResult;
}

const typeLabels: Record<string, string> = { cement: "水泥供应商", slag: "矿粉供应商", flyash: "粉煤灰供应商", mixed: "综合供应商", terminal: "码头 / 中转库", warehouse: "仓库", concrete: "混凝土公司", project: "工地" };
const categoryColors: Record<string, string> = { 水泥: "blue", 矿粉: "green", 粉煤灰: "orange" };

function RouteSideSummary({ route }: { route: RouteResult }) {
  return <section className="route-side-summary">
    <div className="route-side-heading"><EnvironmentOutlined /><strong>当前驾车路线</strong></div>
    <dl>
      <div><dt>起点</dt><dd>{route.origin}</dd></div>
      <div><dt>终点</dt><dd>{route.destination}</dd></div>
      <div className="route-side-metric"><dt>驾车距离</dt><dd>{route.distance_km.toFixed(1)}<small>km</small></dd></div>
      <div className="route-side-metric"><dt>预计时间</dt><dd>{route.duration_minutes}<small>分钟</small></dd></div>
    </dl>
  </section>;
}

export function DetailPanel({ supplier, onEdit, onDelete, onRoute, onUpdated, route }: Props) {
  const [editingPrice, setEditingPrice] = useState<number>();
  const [price, setPrice] = useState<number>();
  const [messageApi, contextHolder] = message.useMessage();

  if (!supplier) return <div className="detail-panel detail-panel-with-route">{route ? <RouteSideSummary route={route} /> : <div className="detail-empty"><Empty description="点击地图点位或左侧列表查看详情" /></div>}</div>;

  const savePrice = async (product: Product) => {
    if (price === undefined) return;
    try {
      await api.updateProduct(supplier.id, product.id, { price });
      setEditingPrice(undefined); onUpdated(); messageApi.success("新报价已保存，并写入价格历史");
    } catch (error) { messageApi.error((error as Error).message); }
  };

  return <div className="detail-panel">
    {contextHolder}
    {route && <RouteSideSummary route={route} />}
    <div className="detail-title-row">
      <div><Typography.Title level={4}>{supplier.name}</Typography.Title><Space><Tag color="geekblue">{typeLabels[supplier.supplier_type]}</Tag>{supplier.location_accuracy === "approximate" && <Tag color="warning">位置待确认</Tag>}</Space></div>
      <Space size={4}><Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={onEdit} /></Tooltip><Popconfirm title="确认删除该供应商？" onConfirm={onDelete}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space>
    </div>
    <Divider />
    <Descriptions column={1} size="small" colon={false} items={[
      { key: "district", label: "区域", children: supplier.district || "—" },
      { key: "address", label: "地址", children: supplier.address },
      { key: "contact", label: "联系人", children: supplier.contact || "—" },
      { key: "phone", label: "联系电话", children: supplier.phone ? <a href={`tel:${supplier.phone}`}><PhoneOutlined /> {supplier.phone}</a> : "—" },
      { key: "coordinate", label: "坐标", children: `${supplier.longitude.toFixed(5)}, ${supplier.latitude.toFixed(5)}` },
    ]} />
    <Space className="detail-actions"><Button type="primary" icon={<EnvironmentOutlined />} onClick={onRoute}>路线计算</Button><Button icon={<HistoryOutlined />} disabled={!supplier.products.length}>价格走势</Button></Space>
    <Divider orientation="left">商品报价 <Typography.Text type="secondary">{supplier.products.length} 项</Typography.Text></Divider>
    <Table<Product> size="small" rowKey="id" pagination={false} dataSource={supplier.products} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品报价" /> }} columns={[
      { title: "类别", dataIndex: "category", width: 72, render: value => <Tag color={categoryColors[value]}>{value}</Tag> },
      { title: "品牌 / 规格", render: (_, row) => <div><b>{row.brand || "—"}</b><small>{row.spec || "未填规格"}</small></div> },
      { title: "当前价", width: 105, render: (_, row) => editingPrice === row.id ? <Space.Compact><InputNumber size="small" min={0} value={price} onChange={value => setPrice(value ?? undefined)} style={{ width: 72 }} /><Button size="small" type="primary" onClick={() => void savePrice(row)}>存</Button></Space.Compact> : <button className="price-button" onClick={() => { setEditingPrice(row.id); setPrice(Number(row.price)); }}>{Number(row.price).toFixed(0)}<small>{row.unit}</small></button> },
    ]} />
    <Button className="add-product-button" type="dashed" block icon={<PlusOutlined />} disabled>添加商品（编辑模式）</Button>
    <div className="updated-time">最后更新 {new Date(supplier.updated_at).toLocaleString("zh-CN", { hour12: false })}</div>
  </div>;
}
