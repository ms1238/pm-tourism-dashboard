"""Fill site/data/ from the two published dashboards (no APIs of our own, so no keys):

- 숙박 대시보드 (https://ms1238.github.io/korea-lodging-dashboard-/): every data file its page reads, into site/data/
  (the page here is a copy of that page, so the files keep their names);
- PM 대동여지도 (https://ms1238.github.io/korea-transit-gap/): its data files into site/data/pm/ — except beam.geojson,
  which this public dashboard must never carry.

A required file that cannot be fetched stops the run, so the last deployed site stays up; optional ones are skipped
(the page treats a missing file as 'not built yet')."""
import os
import sys
import time

import requests

LODGING = "https://ms1238.github.io/korea-lodging-dashboard-/"
PM = "https://ms1238.github.io/korea-transit-gap/"
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "data")
UA = {"User-Agent": "pm-tourism-dashboard sync"}

LODGING_REQUIRED = ["meta.json", "cube.json", "close.json"]
LODGING_OPTIONAL = ["cubeq.json", "closeq.json", "minbak.json", "visits.json", "arrivals.json", "bus.json", "park_areas.json",
                    "subway.json", "food.json", "survival.json", "stations.json", "festivals.json", "park_lodging.json",
                    "kto_index.json", "icn.json", "kac.json", "trrsrt.json", "ivs.json",
                    "download/lodging.csv.gz", "download/panel_sgg.csv"]
PER_SIDO = ["pts", "tour", "admin"]  # data/<dir>/<시도 index>.json
PM_REQUIRED = ["stats.json"]
PM_OPTIONAL = ["pm.json", "stops.json", "stations.json", "dongs.geojson", "pmgrid.png", "bike.geojson", "bounds.geojson", "accidents.json"]
NEVER = {"beam.geojson"}  # 빔모빌리티 운영지역: internal, not for this dashboard


def get(url, tries=3):
    for k in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=120)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.content
        except requests.RequestException as e:
            if k == tries - 1:
                raise RuntimeError(f"{url}: {e}") from e
            time.sleep(5 * (k + 1))


def save(base, name, dest, required):
    assert os.path.basename(name) not in NEVER
    body = get(base + "data/" + name)
    if body is None:
        if required:
            sys.exit(f"missing required file: {base}data/{name}")
        print(f"  skip (not published): {name}")
        return None
    path = os.path.join(OUT, dest, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(body)
    return body


def main():
    import json
    meta = json.loads(save(LODGING, "meta.json", "", True))
    for n in LODGING_REQUIRED[1:]:
        save(LODGING, n, "", True)
    for n in LODGING_OPTIONAL:
        save(LODGING, n, "", False)
    n_sido = len(meta["sido"])
    for d in PER_SIDO:
        for i in range(n_sido):
            save(LODGING, f"{d}/{i}.json", "", d == "pts")
    print(f"lodging: {n_sido} 시도, updated {meta.get('updated')}", flush=True)
    for n in PM_REQUIRED:
        save(PM, n, "pm", True)
    for n in PM_OPTIONAL:
        save(PM, n, "pm", False)
    print("pm: done", flush=True)


if __name__ == "__main__":
    main()
