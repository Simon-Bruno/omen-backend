#!/bin/bash

# Extract analytics events from PostgreSQL dump

DUMP_FILE="./src/scripts/07974f11-97d5-4c3d-a768-fbae3ced61df"
TEMP_DB="temp_migration_db"
OUTPUT_CSV="events_export.csv"

echo "🔄 Creating temporary database..."
docker exec omen-backend-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS $TEMP_DB;" 2>/dev/null || true
docker exec omen-backend-postgres-1 psql -U postgres -c "CREATE DATABASE $TEMP_DB;"

echo "🔄 Restoring dump to temporary database..."
docker cp "$DUMP_FILE" omen-backend-postgres-1:/tmp/dump.backup
docker exec omen-backend-postgres-1 pg_restore -U postgres -d "$TEMP_DB" /tmp/dump.backup 2>/dev/null || true

echo "🔄 Exporting analytics_events to CSV..."
docker exec omen-backend-postgres-1 psql -U postgres -d "$TEMP_DB" -c "\COPY (
  SELECT 
    to_timestamp(timestamp::bigint / 1000) AT TIME ZONE 'UTC' as ts,
    \"projectId\" as project_id,
    \"sessionId\" as session_id,
    CASE 
      WHEN \"eventType\" = 'EXPOSURE' THEN 0
      WHEN \"eventType\" = 'PAGEVIEW' THEN 1
      WHEN \"eventType\" = 'CONVERSION' THEN 2
      WHEN \"eventType\" = 'CUSTOM' THEN 3
      WHEN \"eventType\" = 'PURCHASE' THEN 4
      ELSE 3
    END as event_type,
    COALESCE(\"experimentId\", '') as experiment_id,
    COALESCE(\"variantKey\", '') as variant_key,
    COALESCE(\"viewId\", '') as view_id,
    COALESCE(properties::text, '{}') as props
  FROM analytics_events
  ORDER BY timestamp
) TO '/tmp/events_export.csv' WITH CSV HEADER;"

echo "🔄 Copying CSV from container..."
docker cp omen-backend-postgres-1:/tmp/events_export.csv "./$OUTPUT_CSV"

echo "🔄 Cleaning up..."
docker exec omen-backend-postgres-1 psql -U postgres -c "DROP DATABASE $TEMP_DB;"
docker exec omen-backend-postgres-1 rm /tmp/dump.backup /tmp/events_export.csv

echo ""
echo "✅ Export complete: $OUTPUT_CSV"
echo ""
echo "📋 Next steps:"
echo "1. Go to Supabase Dashboard → Table Editor → events"
echo "2. Click 'Insert' → 'Import data from CSV'"
echo "3. Upload: $OUTPUT_CSV"
echo "4. Run 'npm run migrate:verify' to verify"

