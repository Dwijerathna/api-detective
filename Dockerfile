FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY crypto_detective.mjs probe_detective.mjs server.mjs ./
COPY lib ./lib
COPY public ./public

# Default: crypto CLI; web UI: CMD ["node","server.mjs","--host=0.0.0.0"] then expose port (e.g. 3847)
# CMD ["node", "probe_detective.mjs", "--url=...", "--once"]
CMD ["node", "crypto_detective.mjs"]
