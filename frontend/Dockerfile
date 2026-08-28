FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_AMAP_JS_KEY
ARG VITE_AMAP_SECURITY_CODE
ENV VITE_AMAP_JS_KEY=$VITE_AMAP_JS_KEY
ENV VITE_AMAP_SECURITY_CODE=$VITE_AMAP_SECURITY_CODE
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
