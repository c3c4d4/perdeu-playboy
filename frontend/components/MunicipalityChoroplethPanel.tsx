"use client";

import { useMemo, useState } from "react";
import type { GeoFeatureCollection, Indicator, RankingMode } from "@/types/api";

type Geometry = GeoJSON.Geometry;

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

  async function refresh(nextIndicator = indicator, nextMode = mode) {
    setLoading(true);
    setError(null);
    try {
      const { getMapData } = await import("@/lib/api");
      const nextData = await getMapData(nextIndicator, nextMode, latestYear, latestMonth);
      setData(nextData);
      setSelected(null);
    } catch {
      setError("Falha ao carregar mapa municipal.");
    } finally {
      setLoading(false);
    }
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
              void refresh(nextIndicator, mode);
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
              void refresh(indicator, nextMode);
            }}
          >
            <option value="count">VALOR ABSOLUTO</option>
            <option value="rate">TAXA 100 MIL</option>
            <option value="yoy">VARIAÇÃO ANUAL</option>
          </select>
        </label>

        <div className="flex items-end font-mono text-xs uppercase tracking-widest text-muted">
          {loading ? "Carregando mapa..." : error ?? `Municípios: ${data.features.length}`}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden border border-border bg-surface p-4 shadow-hard">
          <svg viewBox="0 0 1000 680" role="img" aria-label="Mapa municipal do Rio de Janeiro" className="h-[360px] w-full sm:h-[500px] lg:h-[560px]">
            <rect width="1000" height="680" fill="#050505" />
            {data.features.map((feature) => {
              const value = Number(feature.properties.metric_value ?? 0);
              const name = String(feature.properties.territory_name ?? "");
              return (
                <path
                  key={name}
                  d={geometryPath(feature.geometry, bbox)}
                  fill={color(value, maxMetric, mode)}
                  stroke="#050505"
                  strokeWidth="1.5"
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseEnter={() => setSelected(feature.properties)}
                  onFocus={() => setSelected(feature.properties)}
                  tabIndex={0}
                >
                  <title>{name}</title>
                </path>
              );
            })}
          </svg>
        </div>

        <aside className="border border-border bg-surface p-5 shadow-hard">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted">Município</p>
          <h3 className="mt-2 text-3xl font-display uppercase leading-none text-foreground">
            {String(selected?.territory_name ?? "Passe o mouse")}
          </h3>
          <dl className="mt-6 grid gap-4 font-mono text-xs uppercase tracking-wide">
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Valor</dt>
              <dd className="mt-1 text-lg font-bold text-foreground">{formatNumber(selected?.value)}</dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Taxa 100 mil</dt>
              <dd className="mt-1 text-lg font-bold text-foreground">{formatNumber(selected?.rate_per_100k)}</dd>
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
    </section>
  );
}
