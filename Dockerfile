FROM node:14 AS build
WORKDIR /app
ENV NODE_ENV='production'

COPY package.json .
COPY package-lock.json .
RUN npm install -d

COPY . .
RUN npm run build

FROM nginx:stable
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /var/www
