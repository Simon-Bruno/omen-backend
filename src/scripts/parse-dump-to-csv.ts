import { readFileSync, createWriteStream } from 'fs';
import { resolve } from 'path';

const EVENT_TYPE_TO_NUMBER: Record<string, number> = {
  EXPOSURE: 0,
  PAGEVIEW: 1,
  CONVERSION: 2,
  CUSTOM: 3,
  PURCHASE: 4
};

function parseDumpToCSV() {
  const dumpPath = resolve(__dirname, '07974f11-97d5-4c3d-a768-fbae3ced61df');
  const outputPath = resolve(process.cwd(), 'events_export.csv');
  
  console.log('[PARSE] Reading dump file...');
  const dumpContent = readFileSync(dumpPath, 'utf-8');
  
  // Debug: show first 2000 chars of dump
  console.log('[DEBUG] First 2000 chars of dump:');
  console.log(dumpContent.substring(0, 2000));
  
  const writeStream = createWriteStream(outputPath);
  writeStream.write('ts,project_id,session_id,event_type,experiment_id,variant_key,view_id,props\n');
  
  let exported = 0;
  
  // Match COPY analytics_events statements and INSERT statements
  const copyRegex = /COPY .*?analytics_events.*?\((.*?)\) FROM stdin;([\s\S]*?)\\\.$/gm;
  const insertRegex = /INSERT INTO .*?analytics_events.*?VALUES\s*\((.*?)\);/gi;
  
  // Try COPY format first
  let match;
  while ((match = copyRegex.exec(dumpContent)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().replace(/"/g, ''));
    const dataLines = match[2].trim().split('\n');
    
    for (const line of dataLines) {
      if (!line.trim()) continue;
      
      const values = line.split('\t');
      const record: Record<string, string> = {};
      
      columns.forEach((col, idx) => {
        record[col] = values[idx] === '\\N' ? '' : values[idx];
      });
      
      // Handle timestamp - could be BigInt string or already a date
      let ts: string;
      try {
        const timestampNum = BigInt(record.timestamp);
        ts = new Date(Number(timestampNum)).toISOString();
      } catch {
        // Already a date string
        ts = new Date(record.timestamp).toISOString();
      }
      
      const eventType = EVENT_TYPE_TO_NUMBER[record.eventType] ?? 3;
      const props = record.properties || '{}';
      
      const escapedProps = props.replace(/"/g, '""');
      writeStream.write(
        `${ts},${record.projectId},${record.sessionId},${eventType},"${record.experimentId || ''}","${record.variantKey || ''}","${record.viewId || ''}","${escapedProps}"\n`
      );
      exported++;
    }
  }
  
  // Try INSERT format if COPY didn't work
  if (exported === 0) {
    while ((match = insertRegex.exec(dumpContent)) !== null) {
      const values = match[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      
      // Assuming order: id, projectId, experimentId, sessionId, viewId, variantKey, properties, timestamp, createdAt, eventType
      const timestamp = values[7];
      const eventType = EVENT_TYPE_TO_NUMBER[values[9]] ?? 3;
      
      const ts = new Date(Number(timestamp)).toISOString();
      const props = values[6] || '{}';
      const escapedProps = props.replace(/"/g, '""');
      
      writeStream.write(
        `${ts},${values[1]},${values[3]},${eventType},"${values[2] || ''}","${values[5] || ''}","${values[4] || ''}","${escapedProps}"\n`
      );
      exported++;
    }
  }
  
  writeStream.end();
  
  console.log(`\n✅ Successfully exported ${exported} events to: ${outputPath}`);
  console.log('\nNext steps:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to Table Editor → events');
  console.log('3. Click "Insert" → "Import data from CSV"');
  console.log(`4. Upload: ${outputPath}`);
}

parseDumpToCSV();

