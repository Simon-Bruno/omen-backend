#!/bin/bash

# Start a PostgreSQL 17 container temporarily to convert the dump
docker run --name pg17-converter -d \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$(pwd)/src/scripts:/dump" \
  -v "$(pwd):/output" \
  postgres:17

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to start..."
sleep 5

# Restore the dump
echo "Restoring dump..."
docker exec pg17-converter pg_restore -U postgres -d postgres --create /dump/07974f11-97d5-4c3d-a768-fbae3ced61df 2>&1 | head -20

# Check if table exists
echo "Checking analytics_events table..."
docker exec pg17-converter psql -U postgres -d d4sl4p0k4vs6ic -c "SELECT COUNT(*) FROM analytics_events;"

# Export to CSV
echo "Exporting to CSV..."
docker exec pg17-converter psql -U postgres -d d4sl4p0k4vs6ic -c "\COPY (
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
) TO '/output/events_export.csv' WITH CSV HEADER;"

# Cleanup
echo "Cleaning up..."
docker stop pg17-converter
docker rm pg17-converter

echo "✅ Done! Check events_export.csv"

