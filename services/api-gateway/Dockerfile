FROM node:18-alpine

WORKDIR /app

# Copy shared library
COPY libs/shared ./libs/shared
WORKDIR /app/libs/shared
RUN npm install && npm run build

# Copy service files
WORKDIR /app/services/api-gateway
COPY services/api-gateway/package*.json ./
RUN npm install

COPY services/api-gateway .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/services/api-gateway/src/main.js"]
