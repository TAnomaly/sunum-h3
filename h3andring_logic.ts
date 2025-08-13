/**
 * H3 K-Ring ile En Yakın Port Bulma Algoritması
 */
private async findNearestPortUsingH3(coordinate: Coordinate, maxRadiusKm: number): Promise < NearestPortResult | null > {
    // 1️⃣ H3 ile index hesaplayıp ring tabanlı search yapıyoruz
    const h3Index = this.locationCalculationService.coordinateToH3(coordinate);


    let ports: any[] = [];
    let ring = 0;
    const maxRing = Number.isFinite(maxRadiusKm)
        ? this.locationCalculationService.calculateRequiredH3Rings(maxRadiusKm)
        : 10; // güvenli üst sınır (Ring sayısı)


    while(ring <= maxRing && ports.length === 0) {
    const cells = this.locationCalculationService.getH3Neighbors(h3Index, ring);
    for (const cell of cells) {
        const cellPorts = await this.portCacheService.getPortsByH3Index(cell);
        if (cellPorts.length > 0) ports.push(...cellPorts);
    }
    ring++;
}


let nearestPort: NearestPortResult | null = null;
let minDistance = Infinity;

for (const port of ports) {
    const h3Distance = this.locationCalculationService.calculateH3Distance(h3Index, port.h3Index);
    const distance = this.locationCalculationService.calculateDistance(coordinate, port.coordinate);

    // Hibrit skor: H3 mesafesi + Haversine mesafesi
    const score = h3Distance * 1000 + distance;

    if (score < minDistance && (Number.isFinite(maxRadiusKm) ? distance <= maxRadiusKm : true)) {
        nearestPort = {
            portId: port.id,
            name: port.name,
            code: port.code,
            country: port.country,
            coordinate: port.coordinate,
            distanceKm: distance,
            h3Distance,
            h3Index: port.h3Index
        };
        minDistance = score;
    }
}

return nearestPort;
}