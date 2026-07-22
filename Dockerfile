FROM node:22-slim AS build

WORKDIR /app

# Install dependencies (including dev deps: Vite, sass and the SSG toolchain are
# needed to build). vite build runs in production mode regardless of NODE_ENV.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Builds the client bundle, the SSR bundle, then prerenders every route to static
# HTML under build/ (see prerender.js).
RUN npm run build

FROM nginx:stable
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /var/www
