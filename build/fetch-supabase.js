// build/fetch-supabase.js
// Build-time data fetcher for Supabase. It writes data.js and events.js.
// If Supabase env vars are missing, it falls back to the Airtable fetcher.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_API_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';
const JOB_LIST_GRACE_DAYS = Number(process.env.JOB_LIST_GRACE_DAYS || 0);

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.log('Supabase env vars missing (SUPABASE_URL / SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY).');
  if (process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID) {
    console.log('Falling back to Airtable build.');
    require('./fetch-airtable');
  } else {
    console.log('No Airtable fallback env vars found. Keeping existing data.js/events.js.');
  }
} else {
  main().catch((error) => {
    console.error('Supabase build failed:', error.message);
    process.exit(1);
  });
}

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'id.asc');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase ${table} (${response.status}): ${text.slice(0, 300)}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function daysFromToday(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function daysAgoLabel(dateStr) {
  if (!dateStr) return '';
  const diff = -daysFromToday(dateStr);
  if (diff === 0) return '오늘';
  if (diff < 0) return `${Math.abs(diff)}일 후`;
  return `${diff}일 전`;
}

const BADGE_MAP = {
  '급여공개': 'salary',
  '비자지원': 'visa',
  '공식링크확인': 'verified',
  '운영자검수': 'verified',
  '신입가능': 'junior',
  '마감임박': 'urgent',
};

const TYPE_ALIASES = {
  '대학어학당': '대학 어학당',
  '대학교어학당': '대학 어학당',
  '대학부설어학당': '대학 어학당',
  '다문화가족센터': '다문화·가족센터',
  '다문화센터': '다문화·가족센터',
  '가족센터': '다문화·가족센터',
  '세종학당': '해외 파견',
  '해외파견': '해외 파견',
  '사설어학원': '사설 어학원',
  '민간학원': '사설 어학원',
  '기업교육': '기업교육·출강',
  '기업출강': '기업교육·출강',
  '기업교육출강': '기업교육·출강',
  '온라인플랫폼': '온라인',
  '온라인강의': '온라인',
  '초등': '초등학교',
  '중고등학교': '중·고등학교',
};

function normalizeInstitutionType(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const compact = text.replace(/[\s·-]/g, '');
  return TYPE_ALIASES[compact] || text;
}

function normalizeJobCategory(value) {
  const text = String(value || '').trim();
  const compact = text.replace(/\s+/g, '');
  if (!compact || ['채용', '강사채용', '한국어강사'].includes(compact)) return '강사';
  return text;
}

function hasSupport(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  if (['없음', '미기재', '해당없음', '해당 없음', 'n/a', 'na', 'no', 'none', 'false'].includes(text)) {
    return false;
  }
  return /지원|제공|가능|협의|있음|yes|true/.test(text);
}

function normBadges(value) {
  if (!value) return [];
  const badges = Array.isArray(value) ? value : String(value).split(',').map((item) => item.trim());
  return badges.filter(Boolean).map((badge) => BADGE_MAP[badge] || badge);
}

function instSlug(row) {
  return String(row.institution_id || row.inst_id || row.slug || row.airtable_record_id || row.id);
}

function mapInstitution(row) {
  return {
    name: row.name_ko || row.name_en || row.name || '',
    name_en: row.name_en || '',
    type: normalizeInstitutionType(row.institution_type || row.type || ''),
    country: row.country || '',
    city: row.city || row.region || '',
    website: String(row.website || '').replace(/^https?:\/\//, ''),
    desc: row.description || row.desc || '',
    verified: !!row.verified,
  };
}

function mapEvent(row, idx) {
  return {
    id: idx + 1,
    title: row.title || '',
    organizer: row.organizer || row.host || '',
    event_date: row.event_date || '',
    event_end_date: row.event_end_date || '',
    location: row.location || row.venue || '',
    format: row.format || row.event_format || '',
    deadline: row.registration_deadline || row.deadline || '',
    registration_url: row.registration_url || row.url || '',
    description: row.description || '',
    status: row.status || 'open',
  };
}

function mapJob(row, idx, instLookup) {
  let inst = row.institution_slug || row.institution || 'unknown';
  if (row.institution_airtable_record_id && instLookup[row.institution_airtable_record_id]) {
    inst = instLookup[row.institution_airtable_record_id];
  } else if (instLookup[inst]) {
    inst = instLookup[inst];
  }

  const deadlineDays = daysFromToday(row.deadline);
  const status = String(row.status || '').trim() || (deadlineDays < 0 ? 'closed' : 'open');
  const statusKey = status.toLowerCase();
  const isClosedStatus = ['closed', '마감', '모집완료', '접수마감', 'completed', 'done'].includes(statusKey);
  const visibleInJobs = !isClosedStatus && (!row.deadline || deadlineDays >= -JOB_LIST_GRACE_DAYS);

  return {
    id: idx + 1,
    inst,
    title: row.title || '',
    original_title: row.original_title || '',
    country: row.country || '',
    region: row.region || '',
    type: normalizeInstitutionType(row.institution_type || ''),
    employment: row.employment_type || '',
    category: normalizeJobCategory(row.job_category),
    mode: row.work_mode || '대면',
    salary: row.salary_text || '협의',
    salaryDisclosed: !!row.salary_disclosed,
    cert: row.cert_required || '',
    degree: row.degree_required || '',
    experience: row.experience_required || '',
    visa: hasSupport(row.visa_support),
    deadline: deadlineDays,
    posted: daysAgoLabel(row.posted_date),
    posted_date: row.posted_date || '',
    deadline_date: row.deadline || '',
    status,
    closed: isClosedStatus || deadlineDays < 0,
    visible_in_jobs: visibleInJobs,
    verified: !isClosedStatus,
    desc: row.description || '',
    quals: row.qualifications || '',
    preferred: row.preferred || '',
    apply: row.how_to_apply || '',
    apply_url: row.application_url || '',
    badges: normBadges(row.quality_badges),
  };
}

async function main() {
  console.log('Fetching institutions from Supabase...');
  const instRows = await fetchAll('institutions');
  const instLookup = {};
  const institutions = {};
  instRows.forEach((row) => {
    const slug = instSlug(row);
    instLookup[row.airtable_record_id] = slug;
    instLookup[slug] = slug;
    institutions[slug] = mapInstitution(row);
  });
  console.log(`  ${instRows.length} institutions`);

  console.log('Fetching jobs from Supabase...');
  const jobRows = await fetchAll('jobs');
  const jobs = jobRows.map((row, idx) => mapJob(row, idx, instLookup));
  console.log(`  ${jobs.length} jobs`);

  const dataOut = path.join(__dirname, '..', 'data.js');
  const dataContent =
    `// data.js - generated from Supabase (${new Date().toISOString()})\n` +
    `// Source: ${SUPABASE_URL}\n\n` +
    `var institutions = ${JSON.stringify(institutions, null, 2)};\n\n` +
    `var jobs = ${JSON.stringify(jobs, null, 2)};\n`;
  fs.writeFileSync(dataOut, dataContent, 'utf8');
  console.log(`Saved data.js (${jobRows.length} jobs + ${instRows.length} institutions)`);

  console.log('Fetching events from Supabase...');
  let events = [];
  try {
    const eventRows = await fetchAll('events');
    events = eventRows.map((row, idx) => mapEvent(row, idx));
    console.log(`  ${events.length} events`);
  } catch (error) {
    console.log(`  Events table unavailable. Writing empty events.js. (${error.message})`);
  }

  const eventsOut = path.join(__dirname, '..', 'events.js');
  const eventsContent =
    `// events.js - generated from Supabase (${new Date().toISOString()})\n` +
    `var events = ${JSON.stringify(events, null, 2)};\n`;
  fs.writeFileSync(eventsOut, eventsContent, 'utf8');
  console.log(`Saved events.js (${events.length} events)`);
}
