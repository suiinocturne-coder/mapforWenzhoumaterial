import type { Product, ProductCategory, Supplier } from "../../types";
import type { MapExportConfig } from "./types";

const fieldRules: Record<ProductCategory, { price: keyof MapExportConfig["fields"]; contact: keyof MapExportConfig["fields"] }> = {
  水泥: { price: "cementPrice", contact: "cementContact" },
  矿粉: { price: "slagPrice", contact: "slagContact" },
  粉煤灰: { price: "flyAshPrice", contact: "flyAshContact" },
};

const lowestPositiveProduct = (supplier: Supplier, category: ProductCategory): Product | undefined => supplier.products
  .filter((product) => product.category === category && Number(product.price) > 0)
  .sort((left, right) => Number(left.price) - Number(right.price))[0];

export interface SupplierCardContent {
  title?: string;
  lines: string[];
}

export const supplierHasCategory = (supplier: Supplier, category: ProductCategory): boolean => Boolean(lowestPositiveProduct(supplier, category));

export const supplierCardContent = (supplier: Supplier, config: MapExportConfig): SupplierCardContent => {
  const lines: string[] = [];
  config.categories.forEach((category) => {
    const product = lowestPositiveProduct(supplier, category);
    if (!product) return;
    const rule = fieldRules[category];
    const showPrice = config.fields[rule.price];
    const showContact = config.fields[rule.contact];
    if (!showPrice && !showContact) return;
    const parts = [`${category}：`];
    if (showPrice) parts.push(`${Number(product.price).toFixed(0)}元`);
    if (showContact && supplier.contact) parts.push(supplier.contact);
    lines.push(parts.join(" "));
  });
  if (config.fields.address && supplier.address) lines.push(`地址：${supplier.address}`);
  if (config.fields.phone && supplier.phone) lines.push(`电话：${supplier.phone}`);
  if (config.fields.remark && supplier.remark) lines.push(`备注：${supplier.remark}`);
  return {
    title: config.fields.supplierName ? supplier.short_name || supplier.name : undefined,
    lines: config.markerMode === "compact" ? lines.slice(0, 1) : lines,
  };
};

export const supplierTypeColor = (supplier: Supplier): string => {
  const categories = (["水泥", "矿粉", "粉煤灰"] as ProductCategory[]).filter((category) => supplierHasCategory(supplier, category));
  if (categories.length > 1) return "#516d91";
  if (categories[0] === "水泥") return "#2f6fec";
  if (categories[0] === "矿粉") return "#1f9d68";
  if (categories[0] === "粉煤灰") return "#e58b28";
  return "#7b5ed7";
};
