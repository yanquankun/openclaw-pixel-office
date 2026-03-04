FROM node:20-alpine AS builder

WORKDIR /app

# 安装根目录依赖
COPY package.json package-lock.json ./
RUN npm ci

# 安装 webview 依赖
COPY webview-ui/package.json webview-ui/package-lock.json ./webview-ui/
RUN cd webview-ui && npm ci

# 复制源码
COPY tsconfig.server.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY webview-ui/ ./webview-ui/

# 构建 server
RUN npx tsc -p tsconfig.server.json

# 构建 webview
RUN cd webview-ui && npm run build

# ── 生产镜像 ──────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 复制构建产物
COPY --from=builder /app/dist/ ./dist/

# 复制资产文件
COPY webview-ui/public/assets/ ./webview-ui/public/assets/

EXPOSE 3210

CMD ["node", "dist/server/server/index.js"]
