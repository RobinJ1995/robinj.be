FROM node:15 AS build

# react-snap only works up until Node.js 15, and its dependencies only work up until Debian Stretch.
# Nice.
RUN sed -i s/deb.debian.org/archive.debian.org/g /etc/apt/sources.list
RUN sed -i s/stretch-updates/stretch/g /etc/apt/sources.list
RUN sed -i '/security.debian.org/d' /etc/apt/sources.list

# https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-doesnt-launch-on-unix
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    gconf-service \
    libappindicator1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

RUN groupadd joske
RUN useradd joske -G audio,video -g joske -m -d /home/joske
RUN chown -Rv joske:joske /home/joske

RUN mkdir /app
RUN chown -Rv joske:joske /app
USER joske
WORKDIR /app

ENV NODE_ENV='production'

COPY --chown=joske:joske package.json package-lock.json ./
RUN npm install -d

# Needed in order for react-snap to work on node:15
RUN node node_modules/puppeteer/install.js

COPY --chown=joske:joske . .
RUN npm run build

FROM nginx:stable
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /var/www
