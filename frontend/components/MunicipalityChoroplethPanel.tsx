"use client";

import { useMemo, useState } from "react";
import type { GeoFeatureCollection, Indicator, RankingMode } from "@/types/api";

type Geometry = GeoJSON.Geometry;
type MapView = "state" | "rio_city";

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(number);
}

function polygonPath(ring: number[][], bbox: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const width = maxLon - minLon || 1;
  const height = maxLat - minLat || 1;
  const points = ring.map(([lon, lat]) => {
    const x = ((lon - minLon) / width) * 1000;
    const y = (1 - (lat - minLat) / height) * 680;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return points.length ? `M${points.join("L")}Z` : "";
}

function geometryPath(geometry: Geometry | null | undefined, bbox: [number, number, number, number]) {
  if (!geometry) {
    return "";
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => polygonPath(ring as number[][], bbox)).join("");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => polygonPath(ring as number[][], bbox)))
      .join("");
  }
  return "";
}

function collectCoordinates(geometry: Geometry | null | undefined): number[][] {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat() as number[][];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2) as number[][];
  }
  return [];
}

function color(value: number, max: number, mode: RankingMode) {
  if (mode === "yoy" && value > 0) {
    const intensity = Math.min(1, value / Math.max(max, 1));
    return `rgb(${120 + Math.round(104 * intensity)}, ${24 + Math.round(20 * (1 - intensity))}, ${24 + Math.round(20 * (1 - intensity))})`;
  }
  const intensity = Math.max(0, Math.min(1, value / Math.max(max, 1)));
  const shade = 42 + Math.round(178 * intensity);
  return `rgb(${shade}, ${shade}, ${shade})`;
}

export function MunicipalityChoroplethPanel({
  indicators,
  initialData,
  latestYear,
  latestMonth
}: {
  indicators: Indicator[];
  initialData: GeoFeatureCollection;
  latestYear: number;
  latestMonth: number;
}) {
  const [indicator, setIndicator] = useState("letalidade_violenta");
  const [mode, setMode] = useState<RankingMode>("count");
  const [view, setView] = useState<MapView>("state");
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bbox = useMemo<[number, number, number, number]>(() => {
    const coordinates = data.features.flatMap((feature) => collectCoordinates(feature.geometry));
    const lons = coordinates.map(([lon]) => lon);
    const lats = coordinates.map(([, lat]) => lat);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }, [data]);

  const maxMetric = useMemo(() => {
    return Math.max(
      1,
      ...data.features.map((feature) => Math.max(0, Number(feature.properties.metric_value ?? 0)))
    );
  }, [data]);

  async function loadMap(nextIndicator = indicator, nextMode = mode, nextView = view) {
    setLoading(true);
    setError(null);
    try {
      const { getMapData, getRioCityMapData } = await import("@/lib/api");
      const nextData =
        nextView === "rio_city"
          ? await getRioCityMapData(nextIndicator, nextMode, latestYear, latestMonth)
          : await getMapData(nextIndicator, nextMode, latestYear, latestMonth);
      setData(nextData);
      setSelected(null);
    } catch {
      setError("Falha ao carregar mapa.");
    } finally {
      setLoading(false);
    }
  }

  function openRioCity() {
    setView("rio_city");
    void loadMap(indicator, mode, "rio_city");
  }

  function backToState() {
    setView("state");
    void loadMap(indicator, mode, "state");
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 border border-border bg-surface p-5 shadow-hard md:grid-cols-3">
        <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">
          Indicador
          <select
            className="h-10 border border-border bg-surface px-3 text-sm text-foreground"
            value={indicator}
            onChange={(event) => {
              const nextIndicator = event.target.value;
              setIndicator(nextIndicator);
              void loadMap(nextIndicator, mode, view);
            }}
          >
            {indicators.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">
          Métrica
          <select
            className="h-10 border border-border bg-surface px-3 text-sm text-foreground"
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value as RankingMode;
              setMode(nextMode);
              void loadMap(indicator, nextMode, view);
            }}
          >
            <option value="count">VALOR ABSOLUTO</option>
            <option value="yoy">VARIAÇÃO ANUAL</option>
          </select>
        </label>

        <div className="flex items-end justify-between gap-3 font-mono text-xs uppercase tracking-widest text-muted">
          <span>{loading ? "Carregando mapa..." : error ?? (view === "rio_city" ? `Bairros: ${data.features.length}` : `Municípios: ${data.features.length}`)}</span>
          {view === "rio_city" ? (
            <button type="button" className="border border-border px-3 py-2 text-foreground hover:border-foreground" onClick={backToState}>
              Voltar
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden border border-border bg-surface p-4 shadow-hard">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <svg viewBox="0 0 1000 680" role="img" aria-label={view === "rio_city" ? "Mapa da cidade do Rio de Janeiro por bairros" : "Mapa do estado do Rio de Janeiro por municípios"} className="h-[420px] w-full sm:h-[560px] lg:h-[680px]">
            <rect width="1000" height="680" fill="#050505" />
            {data.features.map((feature) => {
              const value = Number(feature.properties.metric_value ?? 0);
              const name = String(feature.properties.territory_name ?? "");
              const sourceName = String(feature.properties.source_territory_name ?? "");
              const canOpenRio = view === "state" && name === "Rio de Janeiro";
              return (
                <path
                  key={`${name}-${sourceName}`}
                  d={geometryPath(feature.geometry, bbox)}
                  fill={color(value, maxMetric, mode)}
                  stroke="#050505"
                  strokeWidth={canOpenRio ? "2.4" : "1.2"}
                  className={canOpenRio ? "cursor-pointer transition-opacity hover:opacity-80" : "transition-opacity hover:opacity-80"}
                  onMouseEnter={() => setSelected(feature.properties)}
                  onFocus={() => setSelected(feature.properties)}
                  onClick={canOpenRio ? openRioCity : undefined}
                  onKeyDown={(event) => {
                    if (canOpenRio && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      openRioCity();
                    }
                  }}
                  tabIndex={0}
                >
                  <title>{canOpenRio ? "Rio de Janeiro · abrir bairros" : sourceName ? `${name} · ${sourceName}` : name}</title>
                </path>
              );
            })}
          </svg>

          <aside className="border border-border bg-background p-5 shadow-hard">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted">
              {view === "rio_city" ? "Bairro" : "Município"}
            </p>
            <h3 className="mt-2 text-3xl font-display uppercase leading-none text-foreground">
              {String(selected?.territory_name ?? "Passe o mouse")}
            </h3>
            {selected?.source_territory_name ? (
              <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted">
                {String(selected.source_territory_name)}
              </p>
            ) : null}
            <dl className="mt-6 grid gap-4 font-mono text-xs uppercase tracking-wide">
              <div className="border-t border-border pt-3">
                <dt className="text-muted">Valor</dt>
                <dd className="mt-1 text-lg font-bold text-foreground">{formatNumber(selected?.value)}</dd>
              </div>
              <div className="border-t border-border pt-3">
                <dt className="text-muted">Variação anual</dt>
                <dd className={Number(selected?.yoy_percent_change ?? 0) > 0 ? "mt-1 text-lg font-bold text-accent-red" : "mt-1 text-lg font-bold text-foreground"}>
                  {formatNumber(selected?.yoy_percent_change)}%
                </dd>
              </div>
              <div className="border-t border-border pt-3">
                <dt className="text-muted">Rank</dt>
                <dd className="mt-1 text-lg font-bold text-foreground">{formatNumber(selected?.rank)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </section>
  );
}
