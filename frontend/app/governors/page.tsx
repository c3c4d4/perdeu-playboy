import { GovernorsPerformanceTable } from "@/components/GovernorsPerformanceTable";
import { SourceBadge } from "@/components/SourceBadge";
import { getGovernorPerformance } from "@/lib/api";

export default async function GovernorsPage() {
  const performance = await getGovernorPerformance();

  return (
    <div className="grid gap-8">
      <section className="flex flex-col gap-4 border-l-4 border-border pl-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted">Governadores</p>
          <h2 className="m-0 mt-1 text-4xl font-display uppercase leading-none text-foreground">Performance por mandato</h2>
        </div>
        <SourceBadge label="RJ - ISP Dados Abertos" />
      </section>

      <section className="border border-border bg-surface p-5 shadow-hard">
        <div className="grid gap-4 font-mono text-xs uppercase leading-5 tracking-wide text-muted">
          <p>{performance.methodology}</p>
          <p>
            A comparação usa o período exato disponível no mandato e uma linha de base dos 12 meses anteriores à posse.
            Para mandatos muito curtos, o ranking é volátil e aparece com aviso próprio.
          </p>
          <p>
            Indicadores usados: {performance.indicators.join(" / ")}.
          </p>
          <p>
            O ranking descreve variação registrada nos dados do ISP; não é atribuição causal isolada ao governador.
          </p>
        </div>
      </section>

      <GovernorsPerformanceTable rows={performance.rows} />
    </div>
  );
}
