"""PM × 관광: from the synced files (scripts/sync.py), site/data/pmtour.json and site/data/pmtour/<시도 index>.json.

For every open lodging (숙박 대시보드 pts, 영업) and tourist spot (tour): the straight distance to the nearest
'usable' stop — a bus stop with at least `good_routes` routes (or an unknown count) or a rail station (PM 대동여지도
stops/stations). Classes: 도보권 (≤ bus_m), PM 10분권 (≤ pm10_m), 먼 곳. '마지막 1~3km': that distance, or the
distance from a lodging to the nearest tourist spot, between 1 and 3 km.

Per 시군구 of the 숙박 대시보드 (기초지자체, 일반구 merged; its 시도·시군구 indices) the counts, the PM figures of
PM 대동여지도 (운영, 기기, 주차구역, 견인·규제, 자전거도로, 사고 합성데이터) and 외지인 방문객 (지난 4분기).
시군구 whose bus stop data PM 대동여지도 marks as missing get no distance figures. Nothing about 빔모빌리티 is read."""
import json
import math
import os

import numpy as np
from scipy.spatial import cKDTree

DATA = os.path.join(os.path.dirname(__file__), "..", "site", "data")
L13 = (1.0, 3.0)  # km


def load(*p):
    with open(os.path.join(DATA, *p), encoding="utf-8") as f:
        return json.load(f)


def xy(lat, lon):  # km on a local plane (good enough for nearest-neighbour distances in Korea)
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    return np.c_[lon * 111.32 * math.cos(math.radians(36.5)), lat * 110.95]


def main():
    meta = load("meta.json")
    st = load("pm", "stats.json")
    pmeta, C = st["meta"], {c: i for i, c in enumerate(st["cols"])}
    pm = load("pm", "pm.json") if os.path.exists(os.path.join(DATA, "pm", "pm.json")) else {}
    acc = load("pm", "accidents.json") if os.path.exists(os.path.join(DATA, "pm", "accidents.json")) else None
    visits = load("visits.json") if os.path.exists(os.path.join(DATA, "visits.json")) else None
    walk, pm10, good = pmeta["bus_m"] / 1000, pmeta["pm10_m"] / 1000, pmeta["good_routes"]

    stops = load("pm", "stops.json")  # [lon, lat, routes (-1 unknown), src]
    rail = load("pm", "stations.json")  # [lon, lat, name]
    use = [(s[1], s[0]) for s in stops if s[2] < 0 or s[2] >= good] + [(r[1], r[0]) for r in rail]
    tree = cKDTree(xy([p[0] for p in use], [p[1] for p in use]))

    # PM 대동여지도 시군구 codes of each 숙박 대시보드 시군구 (by name; a 시 with 일반구 → its 구; 세종 → the whole 시도)
    pm_codes, gap = {}, set()
    for r in st["rows"]:
        pm_codes.setdefault((r[C["sidonm"]], r[C["sggnm"]]), r[C["sgg"]])
        if r[C["stop_gap"]]:
            gap.add(r[C["sgg"]])

    def codes(sido, sgg):
        out = [v for (a, b), v in pm_codes.items() if a == sido and (b == sgg or (sgg.endswith("시") and b.startswith(sgg) and b != sgg))]
        return out or [v for (a, b), v in pm_codes.items() if a == sido and sido.startswith("세종")]

    fleet = {g: pm["fleet"][i] for g, i in (pm.get("fleet_by_sgg") or {}).items()}
    parku = {}
    for u in pm.get("parking_units") or []:
        for g in u["sgg"]:
            parku[g] = u
    ops, ordi, bike = st.get("sgg_pm_ops") or {}, st.get("sgg_ordinance") or {}, st.get("sgg_bike_road") or {}
    acc_by = {}
    if acc:
        ac = {c: i for i, c in enumerate(acc["cols"])}
        for r in acc["rows"]:
            a = acc_by.setdefault(r[ac["unit"]], [0, 0])
            a[0] += 1
            a[1] += r[ac["dead"]] + r[ac["serious"]]

    def pm_figures(mem):
        own = lambda u: u and all(g in mem for g in u["sgg"])  # a figure of the 시군구 itself, not of its whole 시도
        fl = {id(u): u for u in (fleet.get(g) for g in mem) if own(u)}
        newest = lambda u: max(str(u.get("date") or "").split(" · "))
        ops_now = int(any(ops.get(g) == 1 for g in mem) or any(u["total"] > 0 and newest(u) > (pmeta.get("pm_ops_date") or "") for u in fl.values()))
        if not any(g in ops for g in mem) and not fl:
            ops_now = None
        pk = {id(u): u for u in (parku.get(g) for g in mem) if own(u)}
        o = next((ordi[g] for g in mem if g in ordi), None)
        bk = [bike[g] for g in mem if g in bike]
        acc_n = acc_k = None
        if acc:
            us = [i for i, u in enumerate(acc["units"]) if set(u["sgg"]) & set(mem) and set(u["sgg"]) <= set(mem)]
            if us:
                acc_n, acc_k = sum(acc_by.get(i, [0, 0])[0] for i in us), sum(acc_by.get(i, [0, 0])[1] for i in us)
        lv = (o or {}).get("lv", {})
        return [ops_now, sum(u["total"] for u in fl.values()) if fl else None, " · ".join(sorted({newest(u) for u in fl.values()})) or None,
                sum(u["n"] for u in pk.values()) if pk else None,
                (o or {}).get("t"), (o or {}).get("fee"), (o or {}).get("grace"), (o or {}).get("note"), (o or {}).get("b"),
                lv.get("p"), lv.get("n"), round(sum(sum(v) for v in bk), 1) if bk else None, round(sum(v[0] for v in bk), 1) if bk else None,
                acc_n, acc_k]

    def visitors(si, gi):  # 외지인 방문객, the last 4 quarters with data
        try:
            s = visits["sgg"][si][gi][0]
        except (TypeError, IndexError, KeyError):
            return None
        vals = [v for v in s if v is not None]
        return round(sum(vals[-4:])) if len(vals) >= 4 else None

    os.makedirs(os.path.join(DATA, "pmtour"), exist_ok=True)
    units = []
    for si, sd in enumerate(meta["sido"]):
        pts = load("pts", f"{si}.json")["rows"]
        tour = load("tour", f"{si}.json") if os.path.exists(os.path.join(DATA, "tour", f"{si}.json")) else []
        tour = [t if t[0] is not None and t[1] is not None else [0, 0, t[2], -1, *t[4:]] for t in tour]  # keep the row order (codes align)
        mem_of = [codes(sd["name"], g) for g in sd["sgg"]]
        no_bus = [bool(m) and all(g in gap for g in m) for m in mem_of]
        # lodgings: open, exact position (approx flag 0)
        li = [i for i, r in enumerate(pts) if r[6] == 0 and not r[13] and r[0] is not None and r[1] is not None]
        lx = xy([pts[i][0] for i in li], [pts[i][1] for i in li]) if li else np.zeros((0, 2))
        ld = tree.query(lx)[0] if li else np.zeros(0)
        tx = xy([t[0] for t in tour], [t[1] for t in tour]) if tour else np.zeros((0, 2))
        td = tree.query(tx)[0] if tour else np.zeros(0)
        lt = cKDTree(tx).query(lx)[0] if tour and li else np.full(len(li), np.inf)  # lodging → nearest tourist spot
        cls = lambda d: 0 if d <= walk else 1 if d <= pm10 else 2
        lcode, tcode = ["9"] * len(pts), ["9"] * len(tour)
        agg = [[0] * 10 for _ in sd["sgg"]]  # lod n, walk, pm, far, transit 1-3, tour 1-3 | tour n, walk, pm, far
        for k, i in enumerate(li):
            g = pts[i][3]
            if no_bus[g]:
                continue
            c = cls(ld[k])
            lcode[i] = str(c)
            a = agg[g]
            a[0] += 1
            a[1 + c] += 1
            a[4] += int(L13[0] < ld[k] <= L13[1])
            a[5] += int(L13[0] < lt[k] <= L13[1])
        tagg = [[0] * 5 for _ in sd["sgg"]]  # n, walk, pm, far, transit 1-3
        for k, t in enumerate(tour):
            g = t[3]
            if g < 0 or g >= len(sd["sgg"]) or no_bus[g]:
                continue
            c = cls(td[k])
            tcode[k] = str(c)
            a = tagg[g]
            a[0] += 1
            a[1 + c] += 1
            a[4] += int(L13[0] < td[k] <= L13[1])
        with open(os.path.join(DATA, "pmtour", f"{si}.json"), "w", encoding="utf-8") as f:
            json.dump({"lod": "".join(lcode), "tour": "".join(tcode)}, f, separators=(",", ":"))
        for gi, g in enumerate(sd["sgg"]):
            units.append([si, gi, int(no_bus[gi]), *agg[gi][:6], *tagg[gi], visitors(si, gi), *pm_figures(mem_of[gi])])
        print(f"{sd['name']}: {len(li)} lodgings, {len(tour)} tourist spots", flush=True)

    cols = ["si", "gi", "nobus", "lod", "lod_walk", "lod_pm", "lod_far", "lod_l13", "lod_t13", "tour", "tour_walk", "tour_pm", "tour_far", "tour_l13",
            "vis", "ops", "fleet", "fleet_date", "park", "tow", "fee", "grace", "note", "btow", "dpark", "nokick", "bike_km", "bike_ded_km", "acc", "acc_ks"]
    out = {"cols": cols, "units": units,
           "meta": {"walk_m": pmeta["bus_m"], "pm10_m": pmeta["pm10_m"], "good_routes": good, "pm_speed": pmeta.get("pm_speed"),
                    "pm_detour": pmeta.get("pm_detour"), "pm_ops_date": pmeta.get("pm_ops_date"), "stops_collected": pmeta.get("stops_collected"),
                    "visits_last": (visits or {}).get("last"), "acc_title": (acc or {}).get("meta", {}).get("title"),
                    "bike_date": (pmeta.get("bike_road") or {}).get("date")}}
    with open(os.path.join(DATA, "pmtour.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    tot = np.array([u[3:14] for u in units if not u[2]]).sum(0)
    print(f"pmtour: {len(units)} 시군구; lodgings {tot[0]:,} (walk {tot[1] / tot[0]:.0%}, PM 10분 {tot[2] / tot[0]:.0%}, far {tot[3] / tot[0]:.0%}, "
          f"transit 1-3km {tot[4] / tot[0]:.0%}, tour 1-3km {tot[5] / tot[0]:.0%}); tourist spots {tot[6]:,} (walk {tot[7] / tot[6]:.0%}, "
          f"PM 10분 {tot[8] / tot[6]:.0%}, far {tot[9] / tot[6]:.0%})", flush=True)


if __name__ == "__main__":
    main()
