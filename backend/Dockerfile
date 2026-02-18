FROM node:20-alpine

WORKDIR /app

# Install dependencies (works with/without lockfile)
COPY package.json ./
COPY package-lock.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node","server.js"]
