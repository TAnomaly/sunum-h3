## Projede H3 Kullanımı – Detaylı Bilgilendirme

Bu doküman, projede H3 altıgen grid sisteminin nasıl ve nerelerde kullanıldığını, arama stratejisini, mesafe ve komşuluk (k-ring) yaklaşımını ve ilgili servislerin rollerini özetler.

### Amaç ve Genel Mimari
- **Amaç**: Kullanıcıdan gelen bir koordinata göre en yakın limanı (port) hızlı ve isabetli bir şekilde bulmak.
- **Yaklaşım**: Koordinatları H3 hücrelerine çevirip, H3 grid tabanlı komşulukla aday seti daraltılır; sonrasında Haversine ile km bazında kesin mesafe hesaplanır.
- **Servisler**:
  - `services/port-service`: Liman kayıtlarını yönetir; her limanın H3 indeksini üretir/günceller ve olay (event) yayınlar.
  - `services/location-service`: En yakın liman araması yapar, H3 komşuluk halkalarını (k-ring) genişleterek cache’ten aday limanları toplar, mesafeleri hesaplayıp sonuç döndürür. Port olaylarını (RabbitMQ) tüketip kendi cache’ini güncel tutar.

---

## Nerede, Ne Kullanılıyor?

### Port Service (H3 üretimi ve event yayınlama)
- Dosya: `services/port-service/src/domain/services/h3.service.ts`
  - `coordinateToH3(coordinate, resolution=7)`: Koordinatı H3 hücresine çevirir.
  - `h3ToCoordinate(h3Index)`: H3 hücresinden merkez koordinatı döndürür.
  - `calculateH3Distance(a, b)`: İki H3 hücresi arasındaki grid mesafe (hücre adımı) sayısını verir.
  - `getH3Neighbors(...)`, `findNearbyH3Cells(...)`: Şu an basit/stub; gerçek k-ring mantığı bu serviste kullanılmıyor.
  - `calculateApproximateDistance(...)`: Haversine ile yaklaşık km hesabı (lokal sabit). 

- Dosya: `services/port-service/src/domain/services/port.domain-service.ts`
  - Liman oluşturma/güncelleme akışında koordinattan H3 indeksi hesaplar ve limana yazar.
  - Toplu yeniden hesaplama: `recalculateH3Indexes()`.

- Dosya: `services/port-service/src/infrastructure/messaging/event.publisher.ts`
  - RabbitMQ (topic exchange: `port-finder-events`) üzerinden event yayınlar: `port.created`, `port.updated`, `port.h3.updated`.

### Location Service (H3 tabanlı arama ve cache)
- Dosya: `services/location-service/src/domain/services/location-calculation.service.ts`
  - `coordinateToH3(...)`, `h3ToCoordinate(...)`, `calculateH3Distance(...)`.
  - `getH3Neighbors(h3Index, radius)`: h3-js v4 `gridDisk` ile k-ring mantığı; verilen ring yarıçapına kadar tüm hücreleri döndürür.
  - `calculateDistance(coord1, coord2)`: Haversine ile hassas km mesafesi (Dünya yarıçapı km: `EARTH_RADIUS_KM = 6371`).
  - `calculateRequiredH3Rings(radiusKm)`: Resolution 7 için yaklaşık ring sayısı (kenar uzunluğu ~2.8 km varsayımıyla), max 10 ring sınırı.
  - Diğer: `calculateBearing`, `getOptimalResolutionForRadius`, `calculateBoundingBox`, `interpolateCoordinates`.

- Dosya: `services/location-service/src/domain/services/location.domain-service.ts`
  - `findNearestPort(coordinate, maxRadiusKm)`: 
    1) Koordinatı H3’e çevirir
    2) `calculateRequiredH3Rings(maxRadiusKm)` ile hedef ring sayısını belirler
    3) `getH3Neighbors` ile ring genişleterek hücreleri dolaşır ve cache’ten limanları toplar
    4) Adaylar için hem H3 grid mesafesi hem de Haversine km hesabı yapar; ağırlıklı skorla en yakını seçer
    5) Sonucu cache’ler
  - `findPortsInRadius(coordinate, radiusKm)`: Ring tabanlı hücre toplama + Haversine filtreleme ile yarıçap içindeki limanları döndürür.
  - `getLocationInfo(coordinate)`: H3 indeksi, kullanılan resolution ve yakın hücreleri döndürür.

- Dosya: `services/location-service/src/infrastructure/messaging/port.event-handler.ts`
  - `port.created`, `port.updated`, `port.h3.updated` event’lerini RabbitMQ’dan tüketir (queue binding) ve Redis cache’i günceller.

---

## K-Ring (gridDisk) ve KM Karşılığı

- Projede k-ring için h3-js v4 `gridDisk` fonksiyonu kullanılır (k-ring’in yeni adı/karşılığı).
- Varsayılan H3 resolution: **7** (yaklaşık ~5 km çaplı hücreler; kenar uzunluğu ~2.8 km varsayımı).
- `calculateRequiredH3Rings(radiusKm)` ring sayısını yaklaşık şu mantıkla belirler:
  - `rings = ceil(radiusKm / 2.8)` ve performans için `rings ≤ 10` sınırı.

Ring sayısı ile kapsanan yaklaşık uzaklık (Res=7):

| Ring | Yaklaşık yarıçap | Yaklaşık çap |
|------|-------------------|--------------|
| 0    | ~0.0 km           | ~0.0 km      |
| 1    | ~2.8 km           | ~5.6 km      |
| 2    | ~5.6 km           | ~11.2 km     |
| 3    | ~8.4 km           | ~16.8 km     |
| 4    | ~11.2 km          | ~22.4 km     |
| 5    | ~14.0 km          | ~28.0 km     |
| 6    | ~16.8 km          | ~33.6 km     |
| 7    | ~19.6 km          | ~39.2 km     |
| 8    | ~22.4 km          | ~44.8 km     |
| 9    | ~25.2 km          | ~50.4 km     |
| 10   | ~28.0 km          | ~56.0 km     |

Not: Bunlar projedeki kabullere dayalı yaklaşık değerlerdir. Daha doğru metrikler için h3-js’in çözünürlük başına kenar/çap alan hesaplarını kullanabilirsiniz.

---

## Mesafe Hesapları: H3 Grid vs. Haversine

- **H3 grid mesafesi (`gridDistance`)**: İki hücre arasındaki “hücre adımı” sayısıdır. Km değildir. Yakınlık karşılaştırmasında hızlıdır.
- **Haversine (km)**: İki koordinat arasındaki gerçek dünya mesafesini km cinsinden verir. Projede Dünya yarıçapı için `EARTH_RADIUS_KM = 6371` kullanılır.
- En yakın seçimde yaklaşım:
  - Önce H3 grid mesafesi ile kaba yakınlık (düşük maliyetli)
  - Aynı/benzer grid mesafede Haversine ile kesin km ölçümü ve tie-break

---

## Veri Akışı (Özet)

1) İstemci “en yakın liman” ister → `location-service`
2) Koordinat → H3 hücresi; k-ring ile komşu hücreler toplanır → Redis cache’ten aday limanlar alınır
3) Adaylar için H3 grid mesafesi ve Haversine km hesaplanır → en yakın liman döndürülür, sonuç cache’lenir
4) Limanlar `port-service`’te değiştiğinde (oluşturma/güncelleme/H3 güncelleme), `RabbitMQ` ile event yayınlanır
5) `location-service` bu event’leri tüketir ve kendi cache’ini güncel tutar (H3 indeksleri yeniden hesaplanır/güncellenir)

---

## Konfigürasyon ve Bağımlılıklar

- H3 kütüphanesi: `h3-js` (v4 API – `gridDisk`, `gridDistance`, `latLngToCell`, `cellToLatLng`)
- Varsayılan çözünürlük: `7` (yaklaşık ~5 km hücre çapı)
- Mesafe sabiti: `EARTH_RADIUS_KM = 6371` (Haversine için)
- Mesajlaşma: RabbitMQ topic exchange `port-finder-events`
- Cache: Redis (liman ve H3 indeksli liman listeleri için)

---

## İyileştirme Önerileri

- **Dinamik çözünürlük**: `getOptimalResolutionForRadius` mantığını aramaya entegre ederek geniş yarıçaplar için daha düşük çözünürlük (örn. res=6) kullanın.
- **`gridDiskDistances`**: K-ring seviyelerini (ring index) de almak için `gridDiskDistances` kullanarak performans ve kontrolü artırın.
- **Sabitlerin paylaşımı**: `EARTH_RADIUS_KM` ve H3 metriklerini `libs/shared` altında tek yerden yönetin.
- **Port Service komşuluk**: `H3Service.getH3Neighbors/findNearbyH3Cells` şu an stub; gerçek `gridDisk` ile güçlendirilebilir veya kullanılmıyorsa kaldırılabilir.
- **Ring → km dönüşümü**: h3-js’in resmi metrikleri ile ring-km tablolarını çözünürlük bazında daha doğru kılın.

---

## Sık Sorulanlar

- **k-ring kullanılıyor mu?**
  - Evet, h3-js v4’te `kRing` yerine `gridDisk` kullanılıyor ve projede aktif.

- **Neden hem H3 hem Haversine?**
  - H3 ile aday küme hızlı daraltılır; Haversine ile km bazlı kesin karar verilir.

- **Maksimum arama kapsamı nedir?**
  - Varsayılan akışta `max 10 ring` (~28 km yarıçap) kapsanır; yeterli olmazsa `hydrateCacheAround` ile daha geniş veri yüklenip tekrar denenir.

---

Bu doküman, kod akışını hızlı anlamak ve H3 ile ilgili karar noktalarını netleştirmek için hazırlanmıştır. Dosya ve fonksiyon adları yukarıda ilgili başlıklar altında verilmiştir.


