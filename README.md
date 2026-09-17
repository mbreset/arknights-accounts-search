# 명일방주 리세계 찾기

구매자가 계정번호, 가격과 6성 오퍼레이터 목록을 검색하는 GitHub Pages 정적 앱입니다.

- 배포 주소: https://mbreset.github.io/arknights-accounts-search/

## 로컬 실행

```powershell
npm install
npm run dev
```

공개 계정 데이터는 `public/data/accounts.json`에 있으며 관리 웹앱이 변경 시 자동 갱신합니다.

오퍼레이터에 선택적 `potential` 값이 있으면 2 이상부터 `오퍼이름 x2`로 표시합니다. 이름 자체는 바꾸지 않아 검색과 이미지 매칭은 그대로 동작합니다. 해당 값이 없는 기존 데이터는 기존 표시를 유지합니다.

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

## 잠재 검색

오퍼 이름 뒤에 `x2`, ` x2`, `*2`, ` *2`, `2`, ` 2`를 붙여 자동완성을 선택하면 **2잠 이상**인 계정을 검색합니다. 태그는 `오퍼명 x2`로 표시합니다. 잠재는 1~6 범위이고 데이터의 `potential`이 없으면 1잠으로 취급합니다.

AND 검색에서 같은 오퍼를 다시 선택하면 태그 하나의 잠재가 1씩 올라갑니다(최대 6). 직접 잠재를 지정하면 그 값으로 바뀌고, OR에서는 반복 선택으로 증가시키지 않습니다. 모드 변경 시 기존 잠재 조건은 유지합니다. 계정번호 검색·가격 필터·정렬 방식은 그대로입니다.

검색 단위 테스트는 `node --test tests/operator-search.test.mjs`, 가상 카탈로그 브라우저 테스트는 개발 서버의 `tests/operator-search.html`에서 실행합니다. 테스트는 실제 계정 데이터나 방문자 API에 요청하지 않으며 배포 빌드에는 포함되지 않습니다.

정렬 영역의 `검색 옵션` 아이콘에서 `잠재 선택 표시`를 체크하면 태그 안의 `잠재` 메뉴로 제한 없음/2잠 이상~6잠을 선택할 수 있습니다. 기본은 숨김이며, 지정된 값은 `2+`~`6+`로 짧게 표시됩니다. 표시 옵션을 꺼도 검색 조건은 유지되고 태그에 작은 `2+` 표시가 남습니다. 직접 입력과 AND 재선택 방식도 그대로 사용할 수 있습니다. 메뉴는 키보드 방향키/Enter/Escape와 모바일 터치를 지원합니다. `tests/operator-search-mobile.html`은 가상 카탈로그로 390px 화면 배치를 확인하는 테스트 페이지입니다.
