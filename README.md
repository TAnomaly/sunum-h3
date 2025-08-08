# Port Finder Microservices

En yakın liman bulma sistemi - NestJS, Domain-Driven Design, Outbox Pattern, TypeORM, PostgreSQL, Redis, RabbitMQ ve H3 framework kullanarak geliştirilmiş mikroservis mimarisi.

## 🚀 Özellikler

- **Mikroservis Mimarisi**: API Gateway, Port Service, Location Service
- **Domain-Driven Design**: Clean Architecture ve SOLID prensipler
- **Outbox Pattern**: Güvenilir event publishing
- **H3 Geospatial Indexing**: Uber'in H3 framework'ü ile coğrafi indexleme
- **Redis Caching**: Yüksek performans için akıllı cache
- **RabbitMQ**: Asenkron message processing
- **PostgreSQL**: Güvenilir veri saklama
- **Docker**: Containerized deployment
- **TypeScript**: Type-safe development
- **Swagger**: API documentation

## 🏗️ Mimari

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │    │   Port Service  │    │ Location Service│
│    (Port 3000)  │    │   (Port 3001)   │    │   (Port 3002)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │      Redis      │    │    RabbitMQ     │
│   (Port 5432)   │    │   (Port 6379)   │    │   (Port 5672)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Servisler

1. **API Gateway** (Port 3000)
   - İstekleri yönlendirme
   - Rate limiting
   - Caching
   - API documentation

2. **Port Service** (Port 3001)
   - Liman verilerini yönetme
   - CRUD operations
   - H3 index hesaplama
   - Outbox pattern

3. **Location Service** (Port 3002)
   - Koordinat işlemleri
   - En yakın liman bulma
   - H3 tabanlı arama
   - Cache yönetimi

## 🛠️ Teknoloji Stack'i

- **Backend Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Message Broker**: RabbitMQ
- **ORM**: TypeORM
- **Geospatial**: H3-js (Uber H3)
- **Containerization**: Docker & Docker Compose
- **Documentation**: Swagger/OpenAPI

## 📋 Gereksinimler

- Node.js 18+
- Docker & Docker Compose
- npm veya yarn

## 🚀 Hızlı Başlangıç

### 1. Repository'yi klonlayın

```bash
git clone <repository-url>
cd sunumproje
```

### 2. Dependencies'leri yükleyin

```bash
make install
```

### 3. Servisleri başlatın

```bash
# Tüm servisleri Docker ile başlat
make up

# Veya development modunda
make dev
```

### 4. Servislere erişin

- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/docs
- **Port Service**: http://localhost:3001
- **Location Service**: http://localhost:3002
- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)

## 📖 API Kullanımı

### En Yakın Liman Bulma

```bash
curl -X POST http://localhost:3000/api/v1/location/nearest-port \
  -H "Content-Type: application/json" \
  -d '{
    "coordinate": {
      "latitude": 41.0082,
      "longitude": 28.9784
    },
    "radiusKm": 100
  }'
```

### Location Service (H3-native) – Radius'suz Kullanım

- URL: `POST http://localhost:3002/location/nearest-port`
- Gövde (radius olmadan):

```json
{ "coordinate": { "latitude": 41.0255, "longitude": 28.9738 } }
```

- Örnek curl:

```bash
curl -X POST http://localhost:3002/location/nearest-port \
  -H "Content-Type: application/json" \
  -d '{"coordinate":{"latitude":41.0255,"longitude":28.9738}}'
```

- Başarılı yanıt (özet):

```json
{
  "port": { "name": "Port of Istanbul", "h3Index": "..." },
  "distanceKm": 1.96,
  "h3Distance": 0
}
```

### Yeni Liman Ekleme (Önerilen: HTTP Endpoint)

```bash
curl -X POST http://localhost:3000/api/v1/ports \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Port of Istanbul",
    "code": "TRIST",
    "country": "Turkey",
    "coordinate": {
      "latitude": 41.0082,
      "longitude": 28.9784
    }
  }'
```

> Not: Prod ortamında veri ekleme kod içine gömülü seed ile yapılmamalıdır. İhtiyaç halinde `init-db/002-seed-sample-ports.sql.example` dosyasını yerelde `.sql` uzantısıyla aktif hale getirip kullanabilirsiniz, ancak kalıcı kullanım için API üzerinden yönetim önerilir.

### Belirli Yarıçaptaki Limanları Bulma

```bash
curl -X POST http://localhost:3000/api/v1/location/ports-in-radius \
  -H "Content-Type: application/json" \
  -d '{
    "coordinate": {
      "latitude": 41.0082,
      "longitude": 28.9784
    },
    "radiusKm": 200
  }'
```

## 🧭 H3-Tabanlı En Yakın Liman Mantığı

- **H3 grid araması (primary):** Verilen koordinat H3 index'ine çevrilir ve komşu hücreler halka halka (grid disk) taranır.
- **Seçim kriteri:** Önce `h3Distance` en küçük olan tercih edilir. Eşitlik durumunda yalnızca bağ kırıcı olarak Haversine mesafesi kullanılır; yanıt için `distanceKm` bilgi amaçlı döndürülür.
- **Çözünürlük:** Varsayılan H3 resolution `7` (~5km hücreler). İhtiyaca göre düşürülerek daha geniş arama yapılabilir (R6→R5→R4).
- **Halka (ring) sınırı:** Varsayılan en fazla `10` ring taranır (≈ 28–30 km kapsama). Daha uzak sonuçlar için ring sayısı veya çözünürlük kademesi artırılabilir.
- **Cache hydration:** Cache boşsa, Port Service'ten yakın limanlar çekilerek H3 cache doldurulur, ardından H3 araması tekrar denenir.
- **Radius:** Gönderilmezse sınırsız kabul edilir; fakat performans için ring sınırı uygulanır. İsterseniz konfigürasyonda artırılabilir.
- **404 davranışı:** Tarama menzili içinde liman bulunamazsa `404 No port found near given coordinate` döner.

### İleri seviye ayarlar (opsiyonel)
- Maksimum halka sayısı artırılabilir (örn. 30–40).
- Çoklu çözünürlük taraması: R7→R6→R5→R4 kademeli arama.
- Hata mesajı sadeleştirilmiş metin ile döndürülür (Infinity yazmaz).

## 🔧 Development

### Makefile Komutları

```bash
# Tüm komutları görüntüle
make help

# Dependencies yükle
make install

# Servisleri build et
make build

# Development ortamı başlat
make dev

# Tüm servisleri Docker ile başlat
make up

# Servisleri durdur
make down

# Logları görüntüle
make logs

# Database'i sıfırla
make db-reset

# Health check
make health

# Test çalıştır
make test

# Linting
make lint

# Code formatting
make format
```

### Bireysel Servis Komutları

```bash
# Port Service
make dev-port-service
make build-port-service
make test-port-service

# Location Service
make dev-location-service
make build-location-service
make test-location-service

# API Gateway
make dev-api-gateway
make build-api-gateway
make test-api-gateway
```

## 🏗️ Proje Yapısı

```
sunumproje/
├── libs/
│   └── shared/                 # Shared library
│       ├── src/
│       │   ├── domain/
│       │   │   ├── entities/
│       │   │   ├── events/
│       │   │   └── value-objects/
│       │   └── dtos/
│       └── package.json
├── services/
│   ├── api-gateway/           # API Gateway service
│   │   ├── src/
│   │   │   ├── application/
│   │   │   └── infrastructure/
│   │   └── Dockerfile
│   ├── port-service/          # Port management service
│   │   ├── src/
│   │   │   ├── application/
│   │   │   ├── domain/
│   │   │   └── infrastructure/
│   │   └── Dockerfile
│   └── location-service/      # Location processing service
│       ├── src/
│       │   ├── application/
│       │   ├── domain/
│       │   └── infrastructure/
│       └── Dockerfile
├── init-db/                   # Database initialization
├── config/                    # Configuration files
├── docker-compose.yml
├── Makefile
└── README.md
```

## 🧪 Testing

```bash
# Tüm testleri çalıştır
make test

# Specific service testleri
make test-port-service
make test-location-service
make test-api-gateway

# Test coverage
cd services/port-service && npm run test:cov
```

## 📊 Monitoring & Health Checks

### Health Endpoints

- **API Gateway**: `GET /health`
- **Port Service**: `GET /health`
- **Location Service**: `GET /health`
- **Detailed Health**: `GET /api/v1/health/detailed`

### Monitoring

```bash
# Servis durumunu kontrol et
make status

# Health check çalıştır
make health

# Logları izle
make logs

# Specific service logları
make logs-api
make logs-port
make logs-location
```

## 🔧 Configuration

Environment değişkenleri `config/development.env` dosyasında tanımlanmıştır:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres123@postgres:5432/port_finder

# Redis
REDIS_URL=redis://redis:6379

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin123@rabbitmq:5672

# Services
PORT_SERVICE_URL=http://port-service:3001
LOCATION_SERVICE_URL=http://location-service:3002
```

## 📈 Performance

### Caching Strategy

- **Redis**: Location queries, port data
- **TTL**: Location (30 min), Ports (5 min), H3 data (2 hours)

### H3 Optimization

- **Resolution 7**: ~5km hexagons for optimal performance
- **Neighbor Search**: Smart ring expansion
- **Index Caching**: H3 indexes cached by coordinate

### Rate Limiting

- **Short**: 10 req/sec
- **Medium**: 100 req/min
- **Long**: 1000 req/hour

## 🐛 Troubleshooting

### Common Issues

1. **Servisler başlamıyor**
   ```bash
   make down
   make clean
   make up
   ```

2. **Database bağlantı hatası**
   ```bash
   make db-reset
   ```

3. **Cache sorunları**
   ```bash
   docker-compose restart redis
   ```

4. **Port conflicts**
   - Portları `docker-compose.yml` dosyasında değiştirin

### Logs

```bash
# Tüm logları görüntüle
make logs

# Specific service logları
docker-compose logs -f [service-name]
```

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

Sorularınız için issue açabilir veya iletişime geçebilirsiniz.

---

**Port Finder Microservices** - Koordinat tabanlı en yakın liman bulma sistemi 🚢
