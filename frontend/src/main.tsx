import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#2f6fec", borderRadius: 5, fontSize: 13, colorText: "#23324a", colorBgLayout: "#eef2f6" }, components: { Layout: { siderBg: "#142238", headerBg: "#ffffff" }, Menu: { darkItemBg: "#142238", darkSubMenuItemBg: "#142238", darkItemSelectedBg: "#2a4770" }, Table: { cellPaddingBlockSM: 8, cellPaddingInlineSM: 8 } } }}><App /></ConfigProvider></StrictMode>,
);

