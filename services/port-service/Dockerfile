FROM node:18-alpine

WORKDIR /app

# Copy shared library
COPY libs/shared ./libs/shared
WORKDIR /app/libs/shared
RUN npm install && npm run build

# Copy service files
WORKDIR /app/services/port-service
COPY services/port-service/package*.json ./
RUN npm install

COPY services/port-service .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/services/port-service/src/main.js"]
