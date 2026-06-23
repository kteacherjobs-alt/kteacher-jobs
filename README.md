# K-Teacher Jobs — 웹 배포

한국어 강사 채용공고 허브 사이트. 정적 HTML + Supabase 자동 연동 + Vercel 호스팅.

## 구조

```
deploy/
├── index.html          ← 홈 (채용공고 목록)
├── library.html        ← 자료실
├── institutions.html   ← 기관 둘러보기
├── about.html          ← 소개·의견
├── data.js             ← jobs · institutions 데이터 (자동 생성됨)
├── build/
│   ├── fetch-supabase.js   ← Supabase에서 data.js/events.js 생성
│   └── fetch-airtable.js   ← Airtable fallback 빌드
├── scripts/
│   └── migrate-airtable-to-supabase.js
├── supabase/
│   └── schema.sql
├── package.json
├── vercel.json
└── .gitignore
```

## 작동 방식

1. **Vercel 배포 시점**: `npm run build` 실행 → `fetch-supabase.js`가 Supabase에서 데이터 가져와서 `data.js`와 `events.js` 새로 씀.
2. **사이트 로드 시점**: 브라우저가 `data.js`를 `<script>` 태그로 읽음 → `jobs` · `institutions` 전역 변수 채워짐 → 페이지 렌더.
3. **데이터 갱신**: Supabase에 새 공고 추가 → Vercel Deploy Hook 호출 → Vercel 재빌드 (1~2분) → 사이트 갱신.
4. **전환 중 fallback**: Supabase 환경변수가 없고 Airtable 환경변수가 있으면 기존 Airtable 빌드를 자동 사용합니다.

## 환경변수 (Vercel Settings에 입력)

| 변수명 | 필수 | 값 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable key. 공개 읽기 전용 빌드에 사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | 선택 | 서버 전용 관리자 키. 일반 빌드에는 필요 없음 |
| `AIRTABLE_PAT` | 전환 중 | Airtable Personal Access Token (migration/fallback용) |
| `AIRTABLE_BASE_ID` | 전환 중 | `appI0Zp7SQfgXP5P7` (현재 Base ID) |
| `AIRTABLE_JOBS_TABLE` | ⬜ | 기본값 `Jobs` |
| `AIRTABLE_INSTITUTIONS_TABLE` | ⬜ | 기본값 `Institutions` |
| `AIRTABLE_EVENTS_TABLE` | ⬜ | 기본값 `Events` |

일반 사이트 빌드는 `SUPABASE_PUBLISHABLE_KEY`를 사용합니다. `SUPABASE_SERVICE_ROLE_KEY`는 마이그레이션이나 관리자 작업이 필요할 때만 사용하고 GitHub에 커밋하지 않습니다.

## Supabase 초기 설정

1. Supabase SQL Editor에서 `supabase/schema.sql` 내용을 실행합니다.
2. Airtable과 Supabase 환경변수를 로컬에 준비합니다.
3. dry-run으로 이전 대상을 확인합니다.

```bash
npm run migrate:supabase -- --dry-run
```

4. 문제가 없으면 실제 이전을 실행합니다.

```bash
npm run migrate:supabase
```

마이그레이션 스크립트는 `airtable_record_id` 기준으로 upsert하므로 같은 데이터를 다시 실행해도 중복 삽입하지 않습니다.

## 로컬 테스트

```bash
# Supabase 환경변수 셋업 후 빌드 한 번 돌리기
SUPABASE_URL=https://xxx.supabase.co SUPABASE_PUBLISHABLE_KEY=xxx npm run build

# 전환 중 Airtable fallback 직접 테스트
AIRTABLE_PAT=pat_xxx AIRTABLE_BASE_ID=app_xxx npm run build:airtable

# 그냥 브라우저로 index.html 열어서 확인 (data.js의 가짜 데이터로 렌더됨)
open index.html
```
