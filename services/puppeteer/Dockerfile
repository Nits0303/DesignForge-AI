FROM node:20-alpine

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install system Chromium and font deps.
# Note: chromium binary location may vary across Alpine variants; we pin the common path below.
RUN apk add --no-cache \
  chromium \
  chromium-chromedriver \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  && \
  rm -rf /var/cache/apk/*

# Chromium executable path for puppeteer-core.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY services/puppeteer/package.json ./
RUN npm install --production

COPY services/puppeteer/server.js ./

EXPOSE 3000

CMD ["node", "server.js"]

