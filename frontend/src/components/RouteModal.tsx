import { AimOutlined, CalculatorOutlined, CarOutlined } from "@ant-design/icons";
import { Alert, Button, Col, Form, InputNumber, Modal, Row, Select, Statistic, Table, Tabs, Typography, message } from "antd";
import { useEffect, useState } from "react";

import { api } from "../services/api";
import type { CompareRow, ProductCategory, RouteResult, Supplier } from "../types";

interface Props {
  open: boolean;
  suppliers: Supplier[];
  initialOrigin?: number;
  initialDestination?: number;
  onClose: () => void;
  onRoute: (route: RouteResult) => void;
}

export function RouteModal({ open, suppliers, initialOrigin, initialDestination, onClose, onRoute }: Props) {
  const [origin, setOrigin] = useState<number>();
  const [destination, setDestination] = useState<number>();
  const [route, setRoute] = useState<RouteResult>();
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [compareFailures, setCompareFailures] = useState<Array<{ supplier: string; error: string }>>([]);
  const [category, setCategory] = useState<ProductCategory | undefined>("水泥");
  const [freightRate, setFreightRate] = useState(0.65);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const options = suppliers.map(item => ({ value: item.id, label: `${item.name} · ${item.district || "未分区"}` }));
  const projectOptions = suppliers.filter(item => item.supplier_type === "project").map(item => ({ value: item.id, label: `${item.name} · ${item.district || "未分区"}` }));

  useEffect(() => { if (open) { setOrigin(initialOrigin); setDestination(initialDestination); } }, [open, initialOrigin, initialDestination]);

  const calculateRoute = async () => {
    if (!origin || !destination || origin === destination) { messageApi.warning("请选择不同的起点和终点"); return; }
    const originSupplier = suppliers.find(supplier => supplier.id === origin);
    const destinationSupplier = suppliers.find(supplier => supplier.id === destination);
    if (!originSupplier || !destinationSupplier) { messageApi.error("起点或终点供应商不存在"); return; }
    setLoading(true);
    try {
      const metrics = await api.drivingRoute(
        { longitude: originSupplier.longitude, latitude: originSupplier.latitude },
        { longitude: destinationSupplier.longitude, latitude: destinationSupplier.latitude },
      );
      const result: RouteResult = { ...metrics, origin: originSupplier.name, destination: destinationSupplier.name };
      setRoute(result);
      onRoute(result);
    }
    catch (error) { messageApi.error((error as Error).message); }
    finally { setLoading(false); }
  };

  const compare = async () => {
    if (!destination) { messageApi.warning("请先选择目的地"); return; }
    setLoading(true);
    try {
      const result = await api.compare(destination, category, freightRate);
      setRows(result.items);
      setCompareFailures(result.failed_suppliers);
      if (result.failed_suppliers.length) messageApi.warning(`${result.failed_suppliers.length} 个供应商的驾车路线计算失败`);
    }
    catch (error) { messageApi.error((error as Error).message); }
    finally { setLoading(false); }
  };

  return <Modal title="距离测算与到场成本" open={open} onCancel={onClose} footer={null} width={920} destroyOnHidden>
    {contextHolder}
    <Tabs items={[
      { key: "route", label: <span><CarOutlined /> 两点驾车路线</span>, children: <>
        <Row gutter={12} align="bottom"><Col span={10}><Form.Item label="起点"><Select showSearch optionFilterProp="label" value={origin} options={options} onChange={setOrigin} /></Form.Item></Col><Col span={10}><Form.Item label="终点"><Select showSearch optionFilterProp="label" value={destination} options={options} onChange={setDestination} /></Form.Item></Col><Col span={4}><Form.Item><Button type="primary" block loading={loading} onClick={() => void calculateRoute()}>计算路线</Button></Form.Item></Col></Row>
        {route ? <div className="route-summary"><Statistic title="驾车距离" value={route.distance_km} suffix="km" precision={1} /><Statistic title="预计时间" value={route.duration_minutes} suffix="分钟" /><div><Typography.Text type="secondary">{route.origin}</Typography.Text><b> → </b><Typography.Text type="secondary">{route.destination}</Typography.Text></div></div> : <Alert type="info" showIcon message="选择地图中的任意两个已保存点位，使用高德驾车路线规划。" />}
      </> },
      { key: "compare", label: <span><CalculatorOutlined /> 供应商成本比较</span>, children: <>
        <Row gutter={12} align="bottom"><Col span={9}><Form.Item label="工地 / 目的地"><Select showSearch optionFilterProp="label" value={destination} options={projectOptions} onChange={setDestination} placeholder="请选择工地" /></Form.Item></Col><Col span={5}><Form.Item label="材料"><Select allowClear value={category} options={["水泥","矿粉","粉煤灰"].map(value => ({value}))} onChange={setCategory} /></Form.Item></Col><Col span={5}><Form.Item label="运费（元/吨/公里）"><InputNumber min={0} step={0.05} value={freightRate} onChange={value => setFreightRate(value ?? 0)} /></Form.Item></Col><Col span={5}><Form.Item><Button type="primary" icon={<AimOutlined />} block loading={loading} onClick={() => void compare()}>生成排名</Button></Form.Item></Col></Row>
        {compareFailures.length > 0 && <Alert type="warning" showIcon message="部分路线未参与排名" description={compareFailures.map(item => `${item.supplier}：${item.error}`).join("；")} />}
        <Table<CompareRow> rowKey={row => `${row.supplier_id}-${row.category}-${row.brand}-${row.spec}`} size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 8 }} columns={[
          { title: "排名", width: 64, render: (_, __, index) => <b className={index < 3 ? "rank-top" : ""}>{index + 1}</b> },
          { title: "供应商", dataIndex: "supplier" }, { title: "品牌", dataIndex: "brand" }, { title: "规格", dataIndex: "spec" },
          { title: "出厂价", dataIndex: "price", sorter: (a,b) => a.price-b.price },
          { title: "距离", dataIndex: "distance_km", render: value => `${value} km`, sorter: (a,b) => a.distance_km-b.distance_km },
          { title: "运费", dataIndex: "freight", render: value => `¥${value.toFixed(2)}` },
          { title: "到场价", dataIndex: "landed_price", render: value => <b className="landed-price">¥{value.toFixed(2)}</b>, sorter: (a,b) => a.landed_price-b.landed_price },
        ]} />
        <Typography.Paragraph type="secondary" className="compare-note">每个供应商的距离与时间均来自高德驾车路径规划 2.0；到场价 = 出厂价 + 驾车公里数 × 吨公里运价。</Typography.Paragraph>
      </> },
    ]} />
  </Modal>;
}
