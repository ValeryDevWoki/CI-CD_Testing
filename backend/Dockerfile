FROM node:20-alpine

WORKDIR /app

# Install deps (works with or without lockfile)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

EXPOSE 3001
CMD ["npm", "start"]
