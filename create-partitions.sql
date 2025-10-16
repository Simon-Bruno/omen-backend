-- Create partitions for all dates in the historical data
-- Date range: 2025-09-04 to 2025-10-17

-- This assumes the create_daily_partition function exists in your Supabase database
-- If not, you'll need to create partitions manually

DO $$
DECLARE
  partition_date DATE;
BEGIN
  -- Loop through each day from Sept 4 to Oct 17, 2025
  FOR partition_date IN 
    SELECT generate_series('2025-09-04'::date, '2025-10-17'::date, '1 day'::interval)::date
  LOOP
    -- Create partition for this date
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS events_%s PARTITION OF events 
       FOR VALUES FROM (%L) TO (%L)',
      to_char(partition_date, 'YYYY_MM_DD'),
      partition_date,
      partition_date + interval '1 day'
    );
    
    RAISE NOTICE 'Created partition for %', partition_date;
  END LOOP;
END $$;

-- Verify partitions were created
SELECT tablename 
FROM pg_tables 
WHERE tablename LIKE 'events_2025_%' 
ORDER BY tablename;

