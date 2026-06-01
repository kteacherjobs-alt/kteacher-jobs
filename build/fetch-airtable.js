// build/fetch-airtable.js
// 빌드 시 Airtable에서 Jobs · Institutions 가져와서 data.js로 저장.
// 환경변수가 없으면 기존 data.js (가짜 데이터) 유지.

const fs = require('fs');
const path = require('path');

const PAT = process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const JOBS_TABLE = process.env.AIRTABLE_JOBS_TABLE || 'Jobs';
const INST_TABLE = process.env.AIRTABLE_INSTITUTIONS_TABLE || 'Institutions';

if (!PAT || !BASE_ID) {
  console.log('⚠️  Airtable 환경변수 없음 (AIRTABLE_PAT / AIRTABLE_BASE_ID).');
  console.log('    기존 data.js를 그대로 두고 빌드 진행합니다.');
  process.exit(0);
}

async function fetchAll(table) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable ${table} (${res.status}): ${text.slice(0, 200)}`);
    }
    const j = await res.json();
    records.push(...j.records);
    offset = j.offset;
  } while (offset);
  return records;
}

function daysFromToday(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.round((target - now) / 86400000);
  return diff;
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
const normBadges = (arr) => Array.isArray(arr) ? arr.map(b => BADGE_MAP[b] || b) : [];

function instSlug(rec) {
  const f = rec.fields;
  if (f.inst_id) return String(f.inst_id);
  if (f.slug) return String(f.slug);
  return rec.id;
}

function mapInstitution(rec) {
  const f = rec.fields;
  return {
    name: f.name || '',
    type: f.institution_type || f.type || '',
    country: f.country || '',
    city: f.city || f.region || '',
    website: (f.website || '').replace(/^https?:\/\//, ''),
    desc: f.description || f.desc || '',
  };
}

function mapJob(rec, idx, instLookup) {
  const f = rec.fields;
  const linked = f.institution || f.Institutions || [];
  const instRecId = Array.isArray(linked) ? linked[0] : linked;
  const inst = instLookup[instRecId] || 'unknown';
  return {
    id: idx + 1,
    inst,
    title: f.title || '',
    original_title: f.original_title || '',
    country: f.country || '',
    region: f.region || '',
    type: f.institution_type || '',
    employment: f.employment_type || '',
    category: f.job_category || '강사',
    mode: f.work_mode || '대면',
    salary: f.salary_text || '협의',
    salaryDisclosed: !!f.salary_disclosed,
    cert: f.cert_required || '',
    degree: f.degree_required || '',
    experience: f.experience_required || '',
    visa: !!f.visa_support,
    deadline: daysFromToday(f.deadline),
    posted: daysAgoLabel(f.posted_date),
    verified: f.status !== 'closed',
    desc: f.description || '',
    quals: f.qualifications || '',
    preferred: f.preferred || '',
    apply: f.how_to_apply || '',
    badges: normBadges(f.quality_badges),
  };
}

(async () => {
  try {
    console.log('📥 Institutions 가져오는 중...');
    const instRecs = await fetchAll(INST_TABLE);
    const instLookup = {};
    const institutions = {};
    instRecs.forEach(rec => {
      const slug = instSlug(rec);
      instLookup[rec.id] = slug;
      institutions[slug] = mapInstitution(rec);
    });
    console.log(`   ${instRecs.length}개 기관`);

    console.log('📥 Jobs 가져오는 중...');
    const jobRecs = await fetchAll(JOBS_TABLE);
    const jobs = jobRecs.map((rec, idx) => mapJob(rec, idx, instLookup));
    console.log(`   ${jobs.length}개 공고`);

    const out = path.join(__dirname, '..', 'data.js');
    const content =
      `// data.js — Airtable에서 자동 생성됨 (${new Date().toISOString()})\n` +
      `// Source: Airtable Base ${BASE_ID}\n\n` +
      `var institutions = ${JSON.stringify(institutions, null, 2)};\n\n` +
      `var jobs = ${JSON.stringify(jobs, null, 2)};\n`;
    fs.writeFileSync(out, content, 'utf8');
    console.log(`✅ data.js 저장 완료 (${content.length} bytes, ${jobRecs.length}공고 + ${instRecs.length}기관)`);
  } catch (e) {
    console.error('❌ 빌드 실패:', e.message);
    process.exit(1);
  }
})();
