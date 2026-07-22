FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:stable
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /var/www
