# 명일방주 리세계 찾기

구매자가 계정번호, 가격과 6성 오퍼레이터 목록을 검색하는 GitHub Pages 정적 앱입니다.

- 배포 주소: https://mbreset.github.io/arknights-accounts-search/

## 로컬 실행

```powershell
npm install
npm run dev
```

공개 계정 데이터는 `public/data/accounts.json`에 있으며 관리 웹앱이 변경 시 자동 갱신합니다.

## 방문자 통계

방문자 통계는 `worker/`의 Cloudflare Worker와 D1에 저장합니다. 통계 서버가 응답하지 않아도 계정 검색은 정상 작동합니다.

최초 배포 순서:

```powershell
npx wrangler login
npx wrangler d1 create arknights-visitor-stats
# 반환된 database_id를 worker/wrangler.jsonc에 입력
npx wrangler d1 migrations apply arknights-visitor-stats --remote --config worker/wrangler.jsonc
npx wrangler secret put VISITOR_HASH_PEPPER --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

검색 앱은 기본적으로 배포된 Worker 주소를 사용합니다. 다른 Worker로 바꿀 때만 빌드 변수 `VITE_VISITOR_API_URL`을 지정합니다.
