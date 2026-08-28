# 温州市建材供应商地图管理系统

面向水泥、矿粉、粉煤灰贸易与采购人员的内部供应链 GIS。当前版本是可本地运行的 MVP，采用 React + TypeScript + Ant Design、FastAPI、SQLAlchemy、SQLite、高德地图与 DeepSeek API。

## 当前已实现

- 使用官方 `@amap/amap-jsapi-loader` 加载高德地图 JS API 2.0 与真实地图瓦片
- 水泥、矿粉、粉煤灰、工地、混凝土公司、码头和仓库分色点位及图层开关
- 点击地图新增点位、Marker 选择、拖动校准坐标
- Supplier / Product 完整 CRUD API，创建供应商时可同时录入多项商品
- 地址地理编码、逆地理编码和两点驾车路线的后端高德封装
- 供应商、地址、品牌、材料关键词搜索，以及区县、材料筛选
- 商品改价自动写入 `PriceHistory`，不覆盖历史报价
- 工地与供应商距离比较、运费和到场综合成本排名
- DeepSeek 自然语言结构化录入；先预览、人工确认后才允许保存
- SQLite 本地持久化及四个演示点位（可关闭）
- API 输入校验、异常处理、数据库事务、CORS 和环境变量管理

Excel 导入/导出、完整价格走势图、多页面列表属于下一阶段扩展；导航入口已经预留。

## 目录

```text
.
├─ frontend/               React + TypeScript + Vite
│  └─ src/services/map/    前端地图适配层
├─ backend/
│  └─ app/
│     ├─ api/              供应商、地图、AI 路由
│     ├─ services/map/     高德 REST API 封装
│     ├─ services/         DeepSeek 服务
│     ├─ models.py         SQLAlchemy 数据模型
│     └─ schemas.py        Pydantic 输入输出模型
├─ data/                   SQLite 数据文件
├─ .env.example
└─ docker-compose.yml
```

## 环境变量

不要把任何真实 Key 提交到 Git。项目没有保存需求文本中提供的 DeepSeek Token；建议在 DeepSeek 控制台轮换该 Token 后使用新 Token。

PowerShell：

```powershell
Copy-Item .env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

编辑 `backend/.env`，配置后端 Web 服务 Key 和 DeepSeek：

```dotenv
DATABASE_URL=sqlite:///../data/wenzhou_material_map.db
AMAP_WEB_SERVICE_KEY=你的高德Web服务Key
DEEPSEEK_API_KEY=你的DeepSeekToken
DEEPSEEK_BASE_URL=https://api.deepseek.com
CORS_ORIGINS=http://localhost:5173
APP_SEED_DEMO=true
```

编辑 `frontend/.env`，配置浏览器地图：

```dotenv
VITE_AMAP_JS_KEY=你的高德Web端JS Key
VITE_AMAP_SECURITY_CODE=你的高德安全密钥
```

说明：

- `VITE_AMAP_JS_KEY` 由 Vite 在构建时读取，用于浏览器地图。
- `AMAP_WEB_SERVICE_KEY` 只在后端用于地理编码、逆地理编码和驾车路线规划。
- `VITE_AMAP_SECURITY_CODE` 用于高德 JS SDK 安全配置。
- `DEEPSEEK_API_KEY` 只在 FastAPI 后端读取，前端永远拿不到它。
- `APP_SEED_DEMO=false` 可关闭首次启动时的四条演示数据。

高德 Key 在[高德开放平台控制台](https://console.amap.com/dev/key/app)申请；DeepSeek Token 在其 API 控制台创建。

## 本地启动

要求 Node.js 20+、Python 3.11+。

### 1. 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

后端地址：`http://localhost:8000`；API 文档：`http://localhost:8000/docs`。

数据库会在首次启动时自动建表，默认文件为 `data/wenzhou_material_map.db`。

### 2. 前端

另开一个 PowerShell：

```powershell
cd frontend
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`。Vite 会把 `/api` 代理到本地后端。修改 `frontend/.env` 后需要重启前端。

## Docker Compose

先把根目录示例配置复制为 `.env` 并填写 Key：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

访问 `http://localhost:5173`。SQLite 文件通过 `./data:/data` 持久化。

## 测试与构建

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

当前自动化测试覆盖健康检查、供应商/商品创建、品牌筛选、商品改价和价格历史落库。前端启用了 TypeScript strict mode，生产构建会先执行 TypeScript 检查。

## 主要 API

- `GET/POST /api/suppliers`
- `GET/PATCH/DELETE /api/suppliers/{id}`
- `POST /api/suppliers/{id}/products`
- `PATCH/DELETE /api/suppliers/{id}/products/{product_id}`
- `POST /api/map/geocode`
- `POST /api/map/reverse-geocode`
- `POST /api/map/driving-route`（高德路径规划 2.0，返回真实道路距离与 polyline）
- `POST /api/map/route`
- `POST /api/map/compare`
- `POST /api/ai/parse`（只解析，不保存）

## 数据安全

- `.env`、数据库文件、虚拟环境、`node_modules` 和构建产物已加入 `.gitignore`。
- DeepSeek 调用只发生在 `backend/app/services/deepseek.py`。
- AI 接口只返回结构化预览；数据库写入必须再调用供应商创建接口。
- 演示点位均标记为“位置待确认”，不要将其当作真实企业资料。
