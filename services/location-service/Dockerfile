FROM node:18-alpine

WORKDIR /app

# Copy shared library
COPY libs/shared ./libs/shared
WORKDIR /app/libs/shared
RUN npm install && npm run build

# Copy service files
WORKDIR /app/services/location-service
COPY services/location-service/package*.json ./
RUN npm install

COPY services/location-service .
RUN npm run build

ENV LOCATION_H3_ONLY=true

EXPOSE 3002

CMD ["node", "dist/services/location-service/src/main.js"]
