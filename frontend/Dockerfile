FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

# IMPORTANT: CRA (react-scripts) uses PUBLIC_URL during build
# to prefix asset paths (so /static/... becomes /pr/<PR>/static/...)
ARG PUBLIC_URL=/
ENV PUBLIC_URL=$PUBLIC_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
