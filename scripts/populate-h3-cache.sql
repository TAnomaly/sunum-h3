-- H3 Cache Population SQL Script
-- Bu script veritabanındaki portların H3 indexlerini günceller

-- Alexandria port için H3 index güncelle (eğer boşsa)
UPDATE ports 
SET h3_index = '873f5ba66ffffff', updated_at = NOW() 
WHERE code = 'ALX' AND (h3_index IS NULL OR h3_index = '');

-- Tüm portların H3 indexlerini kontrol et
SELECT 
    id, 
    name, 
    code, 
    latitude, 
    longitude, 
    h3_index,
    CASE 
        WHEN h3_index IS NULL OR h3_index = '' THEN 'MISSING H3 INDEX'
        ELSE 'OK'
    END as status
FROM ports 
ORDER BY created_at;
