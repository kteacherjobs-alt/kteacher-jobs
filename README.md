# K-Teacher Jobs — 웹 배포

한국어 강사 채용공고 허브 사이트. 정적 HTML + Airtable 자동 연동 + Vercel 호스팅.

## 구조

```
deploy/
├── index.html          ← 홈 (채용공고 목록)
├── library.html        ← 자료실
├── institutions.html   ← 기관 둘러보기
├── about.html          ← 소개·의견
├── data.js             ← jobs · institutions 데이터 (자동 생성됨)
├── build/
│   └── fetch-airtable.js   ← Airtable에서 data.js 생성
├── package.json
├── vercel.json
└── .gitignore
```

## 작동 방식

1. **Vercel 배포 시점**: `npm run build` 실행 → `fetch-airtable.js`가 Airtable에서 데이터 가져와서 `data.js` 새로 씀.
2. **사이트 로드 시점**: 브라우저가 `data.js`를 `<script>` 태그로 읽음 → `jobs` · `institutions` 전역 변수 채워짐 → 페이지 렌더.
3. **데이터 갱신**: Airtable에 새 공고 추가 → Airtable Automation이 Vercel Deploy Hook 호출 → Vercel 재빌드 (1~2분) → 사이트 갱신.

## 환경변수 (Vercel Settings에 입력)

| 변수명 | 필수 | 값 |
|---|---|---|
| `AIRTABLE_PAT` | ✅ | Airtable Personal Access Token (Read 권한) |
| `AIRTABLE_BASE_ID` | ✅ | `appI0Zp7SQfgXP5P7` (현재 Base ID) |
| `AIRTABLE_JOBS_TABLE` | ⬜ | 기본값 `Jobs` |
| `AIRTABLE_INSTITUTIONS_TABLE` | ⬜ | 기본값 `Institutions` |

환경변수가 없으면 빌드는 진행되지만 기존 `data.js` (시안 시연용 가짜 데이터)가 그대로 표시됨.

## 로컬 테스트

```bash
# (선택) 환경변수 셋업하고 빌드 한 번 돌리기
AIRTABLE_PAT=pat_xxx AIRTABLE_BASE_ID=app_xxx npm run build

# 그냥 브라우저로 index.html 열어서 확인 (data.js의 가짜 데이터로 렌더됨)
open index.html
```
