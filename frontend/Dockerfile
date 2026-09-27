FROM node:22-alpine AS build

ARG VITE_BACKEND_WS_URL=ws://localhost:8080/ws
ENV VITE_BACKEND_WS_URL=$VITE_BACKEND_WS_URL

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
