# PM Tourism Dashboard

관광객이 대중교통으로 닿기 어려운 곳과 '마지막 1~3km'를 숙박·관광지 자료와 개인형 이동장치(PM) 자료로 함께 보여 주는 공개 대시보드입니다.

- 바탕은 [전국 숙박시설 현황 대시보드](https://github.com/ms1238/korea-lodging-dashboard-)의 화면이고, [PM 대동여지도](https://github.com/ms1238/korea-transit-gap)의 교통 공백·PM 연계·규제·안전 자료를 더해 갑니다.
- 빔모빌리티 운영지역 등 사내 정보는 넣지 않습니다(`scripts/sync.py`가 `beam.geojson`을 받지 않음).

## PM 연계 탭

탭 줄의 'PM 연계'에 네 화면이 있습니다(`site/pmtour.js`, 계산은 `scripts/pm_tour.py`).

| 화면 | 내용 |
|---|---|
| 관광 이동 공백 | 지도 바탕에 대중교통 공백 격자(약 170m, PM 대동여지도 기준. 회색 단계: 도보권 / PM 5분권 / PM 10분권 / PM으로도 먼 곳, 갈색: 경사로 PM 곤란. 산림·수면·습지는 비움). 숙박 대시보드의 숙소·관광지 점(업종별 색)은 그대로 위에 보임. 영업 중인 숙소와 관광지(관광지·문화시설·레포츠)에서 가장 가까운 '쓸 만한' 대중교통(노선 3개 이상 버스 정류장 또는 철도역)까지의 직선거리로 도보권(500m) / PM 5분권(약 1km) / PM 10분권(약 1.9km) / 먼 곳 비율을 표로. 시군구를 고르면 PM으로 메울 수 있는 관광지 목록 |
| 마지막 1~3km | 숙소→대중교통, 숙소→가장 가까운 관광지, 관광지→대중교통 거리가 1~3km인 비중, 관광 PM 기회 순위(PM 10분권 비율·1~3km 비중·외지인 방문 연인원의 백분위 평균) |
| PM 공급·규제 | 공유 PM 운영, 기기, 주차구역, 견인료·유예시간, 자전거 견인, 지정주차제, E-scooter Free Zone, 자전거도로 |
| 안전 | 도로교통공단 PM 교통사고 합성데이터(실제 통계 아님), 외지인 방문 대비 |

시군구 단위는 숙박 대시보드의 시군구(기초지자체, 일반구는 시로 합침)입니다. 거리는 직선거리이고 경사는 반영하지 않습니다. 버스 정류장 자료가 크게 부족한 시군구(PM 대동여지도 기준)는 거리를 계산하지 않습니다.

## 자료를 받는 방식

이 저장소는 공공 API를 직접 부르지 않습니다. 매일 05:37(KST) 두 대시보드가 배포한 데이터 파일을 받아(`scripts/sync.py`) 함께 배포합니다. 그래서 GitHub Secrets가 필요 없습니다.

| 원본 | 받는 파일 | 저장 위치 |
|---|---|---|
| 숙박 대시보드 | 그 화면이 읽는 `data/` 파일 전부 | `site/data/` |
| PM 대동여지도 | `stats.json`, `pm.json`, 정류장·역, 행정동 경계, PM 연계 격자, 자전거도로, 사고 합성데이터 | `site/data/pm/` |

받은 뒤 `scripts/pm_tour.py`가 PM 연계 탭 자료(`site/data/pmtour.json`, `site/data/pmtour/`, 지도 격자 `site/data/pmzone.png`)를 만듭니다. 필수 파일을 못 받으면 배포를 멈춰 지난 사이트가 그대로 남습니다. 원본 대시보드의 자료 형식이 바뀌면 이 저장소의 화면도 같이 고쳐야 합니다.

## 처음 설정

Settings → Pages → Build and deployment → Source: **GitHub Actions**. 그다음 Actions 탭 → "Sync data and deploy" → Run workflow.

## 로컬 실행

```bash
pip install -r requirements.txt
python scripts/sync.py
python -m http.server -d site 8000
```
