# PM Tourism Dashboard

관광객이 대중교통으로 닿기 어려운 곳과 '마지막 1~3km'를 숙박·관광지 자료와 개인형 이동장치(PM) 자료로 함께 보여 주는 공개 대시보드입니다.

- 바탕은 [전국 숙박시설 현황 대시보드](https://github.com/ms1238/korea-lodging-dashboard-)의 화면이고, [PM 대동여지도](https://github.com/ms1238/korea-transit-gap)의 교통 공백·PM 연계·규제·안전 자료를 더해 갑니다.
- 빔모빌리티 운영지역 등 사내 정보는 넣지 않습니다(`scripts/sync.py`가 `beam.geojson`을 받지 않음).

## 자료를 받는 방식

이 저장소는 공공 API를 직접 부르지 않습니다. 매일 05:37(KST) 두 대시보드가 배포한 데이터 파일을 받아(`scripts/sync.py`) 함께 배포합니다. 그래서 GitHub Secrets가 필요 없습니다.

| 원본 | 받는 파일 | 저장 위치 |
|---|---|---|
| 숙박 대시보드 | 그 화면이 읽는 `data/` 파일 전부 | `site/data/` |
| PM 대동여지도 | `stats.json`, `pm.json`, 정류장·역, 행정동 경계, PM 연계 격자, 자전거도로, 사고 합성데이터 | `site/data/pm/` |

필수 파일을 못 받으면 배포를 멈춰 지난 사이트가 그대로 남습니다. 원본 대시보드의 자료 형식이 바뀌면 이 저장소의 화면도 같이 고쳐야 합니다.

## 처음 설정

Settings → Pages → Build and deployment → Source: **GitHub Actions**. 그다음 Actions 탭 → "Sync data and deploy" → Run workflow.

## 로컬 실행

```bash
pip install -r requirements.txt
python scripts/sync.py
python -m http.server -d site 8000
```
