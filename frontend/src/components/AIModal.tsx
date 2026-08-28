import { CheckOutlined, CloudUploadOutlined, RobotOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Empty, Input, Modal, Space, Table, Tag, Typography, message } from "antd";
import { useState } from "react";

import { api } from "../services/api";
import type { BatchImportResponse, ProductDraft, SupplierDraft, SupplierType } from "../types";

interface ParsedData {
  supplier_name?: string;
  supplier_type?: SupplierType;
  address?: string;
  district?: string;
  responsible_person?: string;
  contact?: string;
  phone?: string;
  remark?: string;
  products?: ProductDraft[];
}

interface Props { open: boolean; onClose: () => void; onUseResult: (draft: Partial<SupplierDraft>) => void; onBatchImported: () => void; }

export function AIModal({ open, onClose, onUseResult, onBatchImported }: Props) {
  const [text, setText] = useState("龙湾滨海XX码头今天报价，海螺PO425 312，南方PO425 308，S95矿粉198，二级灰138。联系人陈总。");
  const [result, setResult] = useState<ParsedData>();
  const [batchResult, setBatchResult] = useState<BatchImportResponse>();
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const parse = async () => {
    setLoading(true);
    try { setBatchResult(undefined); setResult(await api.aiParse(text) as ParsedData); }
    catch (error) { messageApi.error((error as Error).message); }
    finally { setLoading(false); }
  };

  const batchImport = async () => {
    setBatchLoading(true);
    try {
      setResult(undefined);
      const imported = await api.aiBatchImport(text);
      setBatchResult(imported);
      onBatchImported();
      if (imported.failed_count) messageApi.warning(`已导入 ${imported.imported_count} 项，${imported.failed_count} 项无法导入`);
      else messageApi.success(`已成功批量导入 ${imported.imported_count} 项`);
    } catch (error) { messageApi.error((error as Error).message); }
    finally { setBatchLoading(false); }
  };

  const confirm = () => {
    if (!result) return;
    const remark = [result.responsible_person ? `负责人：${result.responsible_person}` : "", result.remark || ""].filter(Boolean).join("；");
    onUseResult({ name: result.supplier_name || "", supplier_type: result.supplier_type || "mixed", address: result.address || result.supplier_name || "", district: result.district, contact: result.contact || result.responsible_person, phone: result.phone, remark, products: result.products || [], location_accuracy: "approximate" });
  };

  return <Modal title={<span><RobotOutlined /> AI 智能录入 / 批量导入</span>} open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden>
    {contextHolder}
    <Alert type="info" showIcon message="单条识别只生成预览；批量导入会自动搜索企业名称，只有高德名称匹配度达到 70% 的企业才会直接保存并标记点位。" />
    <Typography.Text strong>粘贴单条资料、Excel 多行表格或制表符文本</Typography.Text>
    <Input.TextArea className="ai-input" rows={8} value={text} onChange={event => setText(event.target.value)} placeholder="每行一家企业，可包含企业名称、企业地址、负责人、电话、联系人、水泥、矿粉、煤灰、说明等列…" />
    <Space>
      <Button type="primary" icon={<RobotOutlined />} loading={loading} disabled={text.trim().length < 5 || batchLoading} onClick={() => void parse()}>识别单条并预览</Button>
      <Button icon={<CloudUploadOutlined />} loading={batchLoading} disabled={text.trim().length < 5 || loading} onClick={() => void batchImport()}>批量识别、定位并导入</Button>
    </Space>
    <div className="ai-result">
      {batchResult ? <>
        <Alert
          showIcon
          type={batchResult.failed_count ? "warning" : "success"}
          message={`批量导入完成：成功 ${batchResult.imported_count} 项，失败 ${batchResult.failed_count} 项`}
          description="成功项已经保存并同步到地图；失败项未写入数据库。"
        />
        {batchResult.imported.length > 0 && <Table<BatchImportResponse["imported"][number]>
          className="ai-product-table"
          size="small"
          pagination={false}
          rowKey="supplier_id"
          dataSource={batchResult.imported}
          columns={[
            { title: "企业", dataIndex: "name" },
            { title: "高德匹配结果", dataIndex: "matched_name" },
            { title: "吻合度", dataIndex: "match_score", render: value => `${Math.round(Number(value) * 100)}%` },
            { title: "自动选择地址", dataIndex: "address" },
          ]}
        />}
        {batchResult.failed.length > 0 && <Table<BatchImportResponse["failed"][number]>
          className="ai-product-table"
          size="small"
          pagination={false}
          rowKey={row => `${row.row_number}-${row.name}`}
          dataSource={batchResult.failed}
          columns={[
            { title: "行号", dataIndex: "row_number", width: 70 },
            { title: "无法导入企业", dataIndex: "name" },
            { title: "原因", dataIndex: "reason" },
          ]}
        />}
      </> : !result ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="识别或批量导入结果将在这里显示" /> : <>
        <Descriptions size="small" column={2} bordered items={[
          { key: "name", label: "供应商", children: result.supplier_name || "待补充" },
          { key: "type", label: "类型", children: <Tag>{result.supplier_type || "mixed"}</Tag> },
          { key: "address", label: "地址", span: 2, children: result.address || "待补充" },
          { key: "responsible", label: "负责人", children: result.responsible_person || "—" },
          { key: "contact", label: "联系人", children: result.contact || "—" },
          { key: "phone", label: "电话", children: result.phone || "—" },
          { key: "remark", label: "说明", span: 2, children: result.remark || "—" },
        ]} />
        <Table<ProductDraft> className="ai-product-table" size="small" pagination={false} rowKey={(_, index) => String(index)} dataSource={result.products || []} columns={[
          { title: "类别", dataIndex: "category" }, { title: "品牌", dataIndex: "brand" }, { title: "规格", dataIndex: "spec" }, { title: "价格", dataIndex: "price", render: (value, row) => `${value} ${row.unit || "元/吨"}` },
        ]} />
        <Space><Button type="primary" icon={<CheckOutlined />} onClick={confirm}>确认，进入保存表单</Button><Typography.Text type="secondary">仍可在下一步修改全部字段并进行地址定位</Typography.Text></Space>
      </>}
    </div>
  </Modal>;
}
