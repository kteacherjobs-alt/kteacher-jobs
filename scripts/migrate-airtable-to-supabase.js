#!/usr/bin/env node
// One-time/idempotent Airtable to Supabase migration.
// Required env vars:
//   AIRTABLE_PAT, AIRTABLE_BASE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_JOBS_TABLE = process.env.AIRTABLE_JOBS_TABLE || 'Jobs';
const AIRTABLE_INSTITUTIONS_TABLE = process.env.AIRTABLE_INSTITUTIONS_TABLE || 'Institutions';
const AIRTABLE_EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE || 'Events';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

requireEnv('AIRTABLE_PAT', AIRTABLE_PAT);
requireEnv('AIRTABLE_BASE_ID', AIRTABLE_BASE_ID);
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

async function fetchAirtableAll(table) {
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable ${table} (${response.status}): ${text.slice(0, 300)}`);
    }

    const body = await response.json();
    records.push(...body.records);
    offset = body.offset;
  } while (offset);

  return records;
}

async function upsertSupabase(table, rows) {
  if (!rows.length) {
    console.log(`No ${table} rows to migrate.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Would upsert ${rows.length} rows into ${table}.`);
    return;
  }

  const chunkSize = 500;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set('on_conflict', 'airtable_record_id');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase ${table} upsert (${response.status}): ${text.slice(0, 500)}`);
    }

    console.log(`Upserted ${table}: ${Math.min(start + chunk.length, rows.length)}/${rows.length}`);
  }
}

function asString(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
  const text = String(value).trim();
  return text || null;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'checked'].includes(text);
}

function asDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function asTextArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function institutionSlug(record) {
  const fields = record.fields || {};
  return asString(fields.institution_id || fields.inst_id || fields.slug) || record.id;
}

function mapInstitution(record) {
  const fields = record.fields || {};
  return {
    airtable_record_id: record.id,
    institution_id: asString(fields.institution_id),
    inst_id: asString(fields.inst_id),
    slug: asString(fields.slug),
    name_ko: asString(fields.name_ko),
    name_en: asString(fields.name_en),
    name: asString(fields.name),
    institution_type: asString(fields.institution_type),
    type: asString(fields.type),
    country: asString(fields.country),
    city: asString(fields.city),
    region: asString(fields.region),
    website: asString(fields.website),
    description: asString(fields.description),
    desc: asString(fields.desc),
    verified: asBoolean(fields.verified),
    raw: { airtable_id: record.id, fields },
  };
}

function mapJob(record, instLookup) {
  const fields = record.fields || {};
  const linked = fields.institution || fields.Institutions || null;
  const linkedRecordId = Array.isArray(linked) ? linked[0] || null : null;
  const linkedText = !Array.isArray(linked) ? asString(linked) : null;

  return {
    airtable_record_id: record.id,
    institution_airtable_record_id: linkedRecordId,
    institution_slug: linkedRecordId ? instLookup[linkedRecordId] || null : linkedText,
    institution: linkedText,
    title: asString(fields.title) || '',
    original_title: asString(fields.original_title),
    country: asString(fields.country),
    region: asString(fields.region),
    institution_type: asString(fields.institution_type),
    employment_type: asString(fields.employment_type),
    job_category: asString(fields.job_category),
    work_mode: asString(fields.work_mode),
    salary_text: asString(fields.salary_text),
    salary_disclosed: asBoolean(fields.salary_disclosed),
    cert_required: asString(fields.cert_required),
    degree_required: asString(fields.degree_required),
    experience_required: asString(fields.experience_required),
    visa_support: asString(fields.visa_support),
    deadline: asDate(fields.deadline),
    posted_date: asDate(fields.posted_date),
    status: asString(fields.status),
    description: asString(fields.description),
    qualifications: asString(fields.qualifications),
    preferred: asString(fields.preferred),
    how_to_apply: asString(fields.how_to_apply),
    application_url: asString(fields.application_url),
    quality_badges: asTextArray(fields.quality_badges),
    source_url: asString(fields.source_url || fields.url),
    raw: { airtable_id: record.id, fields },
  };
}

function mapEvent(record) {
  const fields = record.fields || {};
  return {
    airtable_record_id: record.id,
    title: asString(fields.title) || '',
    organizer: asString(fields.organizer),
    host: asString(fields.host),
    event_date: asDate(fields.event_date || fields.date),
    event_end_date: asDate(fields.event_end_date || fields.end_date),
    location: asString(fields.location),
    venue: asString(fields.venue),
    format: asString(fields.format),
    event_format: asString(fields.event_format),
    registration_deadline: asDate(fields.registration_deadline),
    deadline: asDate(fields.deadline),
    registration_url: asString(fields.registration_url),
    url: asString(fields.url),
    description: asString(fields.description),
    status: asString(fields.status) || 'open',
    raw: { airtable_id: record.id, fields },
  };
}

async function main() {
  console.log('Fetching Airtable institutions...');
  const institutionRecords = await fetchAirtableAll(AIRTABLE_INSTITUTIONS_TABLE);
  const instLookup = {};
  institutionRecords.forEach((record) => {
    instLookup[record.id] = institutionSlug(record);
  });
  const institutions = institutionRecords.map(mapInstitution);
  console.log(`Fetched ${institutions.length} institutions.`);

  console.log('Fetching Airtable jobs...');
  const jobRecords = await fetchAirtableAll(AIRTABLE_JOBS_TABLE);
  const jobs = jobRecords.map((record) => mapJob(record, instLookup));
  console.log(`Fetched ${jobs.length} jobs.`);

  console.log('Fetching Airtable events...');
  let events = [];
  try {
    const eventRecords = await fetchAirtableAll(AIRTABLE_EVENTS_TABLE);
    events = eventRecords.map(mapEvent);
    console.log(`Fetched ${events.length} events.`);
  } catch (error) {
    console.log(`Events skipped: ${error.message}`);
  }

  await upsertSupabase('institutions', institutions);
  await upsertSupabase('jobs', jobs);
  await upsertSupabase('events', events);

  console.log(DRY_RUN ? 'Dry run complete.' : 'Migration complete.');
}
