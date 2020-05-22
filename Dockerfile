FROM node:14 AS build
WORKDIR /app
COPY . .
RUN npm install && \
    npm run build && \
    rm -rf node_modules

FROM nginx:stable
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /var/www
