#!/usr/bin/env node

/**
 * H3 Cache Population Script
 * 
 * Bu script mevcut portları veritabanından okuyup H3 cache'ini doldurur.
 * Location service restart olduğunda veya cache boşaldığında kullanılabilir.
 */

const { Client } = require('pg');
const Redis = require('ioredis');
const h3 = require('h3-js');

// Configuration
const DB_CONFIG = {
    host: 'localhost',
    port: 5432,
    database: 'port_finder',
    user: 'postgres',
    password: 'postgres123'
};

const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379
};

// Check if running in Docker
const isDocker = process.env.DOCKER_ENV === 'true';
if (isDocker) {
    DB_CONFIG.host = 'postgres';
    REDIS_CONFIG.host = 'redis';
}

const H3_RESOLUTION = 7;
const H3_CACHE_TTL = 7200; // 2 hours

async function main() {
    const db = new Client(DB_CONFIG);
    const redis = new Redis(REDIS_CONFIG);

    try {
        console.log('🚀 Starting H3 cache population...');
        
        // Connect to databases
        await db.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // Get all active ports
        const result = await db.query(`
            SELECT id, name, code, country, latitude, longitude, h3_index, is_active
            FROM ports 
            WHERE is_active = true
            ORDER BY created_at
        `);
        
        console.log(`📊 Found ${result.rows.length} active ports`);
        
        // Group ports by H3 index
        const h3Groups = {};
        let updatedPorts = 0;
        
        for (const port of result.rows) {
            const latitude = parseFloat(port.latitude);
            const longitude = parseFloat(port.longitude);
            
            // Calculate H3 index if not present
            let h3Index = port.h3_index;
            if (!h3Index) {
                h3Index = h3.geoToH3(latitude, longitude, H3_RESOLUTION);
                
                // Update database with H3 index
                await db.query(
                    'UPDATE ports SET h3_index = $1, updated_at = NOW() WHERE id = $2',
                    [h3Index, port.id]
                );
                updatedPorts++;
                console.log(`🔄 Updated H3 index for ${port.code}: ${h3Index}`);
            }
            
            // Group by H3 index
            if (!h3Groups[h3Index]) {
                h3Groups[h3Index] = [];
            }
            
            h3Groups[h3Index].push({
                id: port.id,
                name: port.name,
                code: port.code,
                country: port.country,
                coordinate: {
                    _latitude: latitude,
                    _longitude: longitude
                },
                h3Index: h3Index,
                isActive: port.is_active
            });
        }
        
        console.log(`🔧 Updated ${updatedPorts} ports with H3 indexes`);
        console.log(`📦 Found ${Object.keys(h3Groups).length} unique H3 indexes`);
        
        // Populate Redis cache
        let cachedIndexes = 0;
        for (const [h3Index, ports] of Object.entries(h3Groups)) {
            const cacheKey = `h3:${h3Index}:ports`;
            await redis.setex(cacheKey, H3_CACHE_TTL, JSON.stringify(ports));
            cachedIndexes++;
            
            console.log(`💾 Cached ${ports.length} ports for H3 index: ${h3Index}`);
        }
        
        // Also cache individual ports
        let cachedPorts = 0;
        for (const port of result.rows) {
            const cacheKey = `port:${port.id}`;
            const portData = {
                id: port.id,
                name: port.name,
                code: port.code,
                country: port.country,
                coordinate: {
                    _latitude: parseFloat(port.latitude),
                    _longitude: parseFloat(port.longitude)
                },
                h3Index: port.h3_index,
                isActive: port.is_active
            };
            
            await redis.setex(cacheKey, 3600, JSON.stringify(portData)); // 1 hour TTL
            cachedPorts++;
        }
        
        console.log(`✅ Successfully populated H3 cache:`);
        console.log(`   - ${cachedIndexes} H3 indexes cached`);
        console.log(`   - ${cachedPorts} individual ports cached`);
        console.log(`   - Cache TTL: ${H3_CACHE_TTL} seconds (${H3_CACHE_TTL/3600} hours)`);
        
    } catch (error) {
        console.error('❌ Error populating H3 cache:', error);
        process.exit(1);
    } finally {
        await db.end();
        redis.disconnect();
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
