## Port Finder – Teknik Mantık (Mimari ve Teknoloji Kullanımı)

### 1) Genel Bakış
- Mikroservisler: API Gateway (3000), Port Service (3001), Location Service (3002)
- Kalıcılık: PostgreSQL (portlar + outbox)
- Mesajlaşma: RabbitMQ (topic exchange, event-driven senkronizasyon)
- Önbellek: Redis (H3 index → port listeleri + nearest sonuç cache’i)
- Coğrafi: Uber H3 (grid temelli en yakın arama)
- Pattern: CQRS (Port Service = yazma; Location Service = okuma)

### 2) Servis Sorumlulukları
- API Gateway
  - Tek giriş noktası; istekleri Port ve Location servislerine yönlendirir
  - Rate limiting, Swagger, güvenlik katmanları

- Port Service (Yazma / Komut tarafı)
  - Port CRUD
  - DB yönetimi (PostgreSQL + TypeORM)
  - Outbox pattern ile RabbitMQ’ya güvenilir event yayınlama
  - Port’ların H3 index hesaplaması ve yeniden hesaplama endpoint’i

- Location Service (Okuma / Sorgu tarafı)
  - En yakın liman ve yarıçap içindeki liman sorguları
  - H3-native arama (halka/ring genişletme), birincil metrik h3Distance
  - Redis’te H3-index’li port listeleri ve nearest sonuçlarını önbellekler
  - Port event’lerini tüketerek Redis’i güncel tutar

### 3) Veri Akışı
- Yazma akışı (Port değişiklikleri)
  1. İstemci → API Gateway → Port Service (create/update/delete)
  2. Port Service değişikliği DB’ye (transaction) yazar
  3. Aynı transaction içinde Outbox kaydı eklenir
  4. Arka plan yayınlayıcı Outbox’tan okuyup RabbitMQ’ya (topic, durable) yayınlar
  5. Location Service event’i tüketir → Redis cache’lerini günceller (`port:{id}`, `h3:{index}:ports`)

- Okuma akışı (H3 ile en yakın liman)
  1. İstemci → API Gateway (veya direkt Location Service)
  2. Location Service koordinatı H3 hücresine (varsayılan çözünürlük 7) çevirir
  3. Grid halkalarını (ring 0..maxRing=10, varsayılan) genişletir; her hücre için Redis’ten `h3:{index}:ports` okunur
  4. Adaylardan h3Distance en küçük olan seçilir; eşitlikte Haversine ile tie-break; response’a bilgi amaçlı `distanceKm` eklenir
  5. Cache boşsa Port Service’ten yakın portlar çekilerek (hydrate) H3’e indekslenir ve arama tekrarlanır
  6. (Opsiyonel) Nearest sonucu `nearest:{roundedLat}:{roundedLng}:{radius}` olarak cache’lenir

### 4) H3 Mantığı (Mevcut Davranış)
- Çözünürlük: 7 (~5 km hexagon’lar)
- Komşular: gridDisk(h3Index, ring) ile ring 0..10 (≈ 25–30 km kapsama)
- Seçim metriği: birincil h3Distance; eşitlikte Haversine
- Radius verilmezse: Arama yine maxRing ile sınırlandırılır (performans güvenliği)
- Hydration: Redis’te veri yoksa Port Service’ten (mevcut implementasyonda ~200 km’ye kadar) çekilir, H3’e yazılır ve tekrar aranır

### 5) Redis Kullanımı
- Anahtarlar
  - `port:{id}`: tekil port cache’i
  - `h3:{h3Index}:ports`: H3 hücresi içindeki port listesi (H3 aramanın ana kaynağı)
  - `nearest:{roundedLat}:{roundedLng}:{radius}`: nearest sonuç cache’i (3 ondalık yuvarlama ≈ ~100–120 m kovaları)
- TTL’ler
  - H3 listeleri: uzun (örn. 2 saat) – portlar nadiren taşınır
  - Nearest sonuçları: daha kısa (örn. 30 dk) – tekrarlı okumalarda çok hızlı
- İptal/Invalidation
  - port.created/updated/h3.updated event’lerinde `port:{id}` güncellenir, `h3:{index}:ports` tazelenir
  - Konum değişiminde eski H3 anahtarları ve ilgili `nearest:*` kovaları temizlenir

### 6) RabbitMQ Kullanımı
- Exchange: `port-finder-events` (topic, durable)
- Routing key’ler: `port.created`, `port.updated`, `port.h3.updated`
- Location Service kuyrukları (durable):
  - `location-service.port.created`
  - `location-service.port.updated`
  - `location-service.port.h3.updated`
- Consumer aksiyonları
  - Payload koordinatından H3 index hesapla
  - `port:{id}`’yi güncelle, port’u `h3:{index}:ports` listesine koy
  - Gerekli eski anahtarları ve nearest cache’leri invalid et

### 7) Outbox Pattern (Port Service)
- DB transaction’ında iş verisi ve Outbox satırı birlikte yazılır
- Arka plan yayıncı Outbox’tan okuyup RabbitMQ’ya yayınlar, başarılıyı işaretler (hata durumunda retry)
- Faydalar: Güvenilirlik (event kaybolmaz), yazma/okuma tarafları gevşek bağlı, en az bir kez teslim

### 8) CQRS Pratiği
- Komutlar: Port Service (DB + Outbox)
- Sorgular: Location Service (H3 + Redis)
- Senkronizasyon: RabbitMQ üzerinden event’lerle

### 9) İlgili API’ler
- Location Service (H3-native):
  - `POST /location/nearest-port` – body: `{ coordinate: { latitude, longitude } }` (radius opsiyonel)
  - `POST /location/ports-in-radius`
- Port Service:
  - `POST /ports/recalculate-h3` – tüm portlar için H3 index’leri yeniden hesaplar
- API Gateway bu rotaları `/api/v1/*` altında proxy’ler

### 10) Konfigürasyon (Development)
- `config/development.env` içinde: `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `PORT_SERVICE_URL`, `LOCATION_SERVICE_URL`
  - Port Service: TypeORM migrations aktif; `synchronize=false`. Docker start’ında migration’lar otomatik uygulanır.

### 11) Bu Kullanımlar “Doğru” mu?
- CQRS ayrımı: Doğru – yazma modeli (Port Service) ile okuma modeli (Location Service) ayrı
- Outbox + RabbitMQ: Doğru – değişiklikler okuma tarafına güvenilir/asenkron yayılıyor
- Redis (H3 listeleri + nearest cache): Doğru – okuma gecikmesini ciddi azaltır
- H3-öncelikli seçim (h3Distance birincil): Doğru – H3-native gereksinime uygun; Haversine sadece tie-break/bilgi
- Radius’suz ama ring sınırlı arama (maxRing=10): Pratik performans önlemi; veri yoğunluğuna göre ayarlanabilir veya multi-resolution eklenebilir

### 12) Önerilen İyileştirmeler
- Multi-resolution H3 arama (R7 → R6 → R5), zaman aşımı ile
- maxRing’i artırma veya veri yoğunluğuna göre adaptif yapma; iteratif hydration yarıçapı (200→500→1000 km)
- Outbox: retry/backoff, dead-letter tablo/kuyruk, idempotency key, event versiyonlama, retention işler
- RabbitMQ: DLX, consumer prefetch, reconnect stratejisi, correlationId’ler
- Redis: metrikler (hit oranı), namespaced anahtarlar, cluster hazırlığı, daha akıllı nearest invalidation penceresi
- Observability: OpenTelemetry tracing, Prometheus metrikleri, JSON log (correlationId)
- API: Gateway-level kısa TTL cache, servisler arası tutarlı DTO validasyonu
 - DB: Diğer servisler gerekirse aynı migration yaklaşımına geçirilebilir; init-db mount’u prod’da kullanılmaz.

### 13) Hızlı Referans – Ne Nerede
- H3 mantığı: `services/location-service/src/domain/services/location-calculation.service.ts`
- En yakın arama: `services/location-service/src/domain/services/location.domain-service.ts`
- Redis cache: `services/location-service/src/domain/services/port-cache.service.ts`
- Event yayınlayıcı (Port Service): `services/port-service/src/infrastructure/messaging/event.publisher.ts`
- Event tüketici (Location Service): `services/location-service/src/infrastructure/messaging/port.event-handler.ts`
- Outbox (Port Service): `services/port-service/src/infrastructure/persistence/entities/outbox.entity.ts`, `.../repositories/outbox.repository.ts`, `.../domain/services/outbox.service.ts`


