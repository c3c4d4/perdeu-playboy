"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { ANALYSIS_START_YEAR } from "@/lib/constants";
import { getTerritories, getTimeseries } from "@/lib/api";
import type { Indicator, Territory, TerritoryType, TimeSeriesPoint } from "@/types/api";

interface TrendsExplorerProps {
  indicators: Indicator[];
  initialTerritories: Territory[];
  initialData: TimeSeriesPoint[];
}

export function TrendsExplorer({ indicators, initialTerritories, initialData }: TrendsExplorerProps) {
  const [indicator, setIndicator] = useState("roubo_rua");
  const [territoryType, setTerritoryType] = useState<TerritoryType>("state");
  const [territoryName, setTerritoryName] = useState("Estado do Rio de Janeiro");
  const [territories, setTerritories] = useState<Territory[]>(initialTerritories);
  const [startYear, setStartYear] = useState(ANALYSIS_START_YEAR);
  const [endYear, setEndYear] = useState(2026);
  const [data, setData] = useState<TimeSeriesPoint[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTerritories = useMemo(() => territories.map((territory) => territory.name), [territories]);

  useEffect(() => {
    let cancelled = false;
    async function loadTerritories() {
      const nextTerritories = await getTerritories(territoryType);
      if (cancelled) {
        return;
      }
      setTerritories(nextTerritories);
      setTerritoryName(nextTerritories[0]?.name ?? "");
    }
    loadTerritories().catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar territórios."));
    return () => {
      cancelled = true;
    };
  }, [territoryType]);

  useEffect(() => {
    let cancelled = false;
    async function loadSeries() {
      setLoading(true);
      setError(null);
      const nextData = await getTimeseries(indicator, territoryType, territoryName, startYear, endYear);
      if (!cancelled) {
        setData(nextData);
      }
    }
    if (territoryName) {
      loadSeries()
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar série."))
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [indicator, territoryType, territoryName, startYear, endYear]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 border border-border bg-surface p-5 shadow-hard lg:grid-cols-[1fr_1.4fr_1fr]">
        <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted min-w-0">
          Indicador
          <select
            className="h-10 w-full min-w-0 border border-border bg-surface px-3 text-sm text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            value={indicator}
            onChange={(event) => setIndicator(event.target.value)}
          >
            {indicators.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 min-w-0 md:grid-cols-[180px_1fr]">
          <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted min-w-0">
            Tipo
            <select
              className="h-10 w-full min-w-0 border border-border bg-surface px-3 text-sm text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
              value={territoryType}
              onChange={(event) => setTerritoryType(event.target.value as TerritoryType)}
            >
              <option value="state">ESTADO</option>
              <option value="municipality">MUNICÍPIO</option>
              <option value="police_area">ÁREA POLICIAL</option>
            </select>
          </label>

          <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted min-w-0">
            Território
            <select
              className="h-10 w-full min-w-0 border border-border bg-surface px-3 text-sm text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
              value={territoryName}
              onChange={(event) => setTerritoryName(event.target.value)}
            >
              {visibleTerritories.map((name) => (
                <option key={name} value={name}>
                  {name.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 min-w-0 md:grid-cols-2">
          <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted min-w-0">
            Ano inicial
            <input
              className="h-10 w-full min-w-0 border border-border bg-surface px-3 text-sm text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
              type="number"
              value={startYear}
              min={ANALYSIS_START_YEAR}
              max={endYear}
              onChange={(event) => setStartYear(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted min-w-0">
            Ano final
            <input
              className="h-10 w-full min-w-0 border border-border bg-surface px-3 text-sm text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
              type="number"
              value={endYear}
              min={startYear}
              max={2026}
              onChange={(event) => setEndYear(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <div className="flex min-h-6 items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest text-muted">
        <span>{loading ? "Carregando dados oficiais do ISP..." : `${data.length} pontos mensais oficiais`}</span>
        {error ? <span className="text-accent-red">{error}</span> : null}
      </div>

      <TrendChart data={data} />
    </div>
  );
}
