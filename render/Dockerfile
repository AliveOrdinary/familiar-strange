FROM node:22-bookworm-slim

# Chromium runtime deps for Remotion's headless renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libasound2 libpango-1.0-0 libcairo2 fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# Download Chromium before copying source so editing a composition doesn't
# re-download it on every rebuild.
RUN npx remotion browser ensure

COPY . .
EXPOSE 3123
CMD ["node", "server/index.mjs"]
