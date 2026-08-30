const formatoDia = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" });

/** Barras simples (sin librería) — mismo espíritu que el Sparkline de AgentCard. */
export function UsoPorDia({ porDia }: { porDia: Record<string, number> }) {
  const dias = Object.keys(porDia).sort();
  if (dias.length === 0) {
    return <p className="mt-3 text-text-muted">Todavía no hay uso registrado este mes.</p>;
  }

  const max = Math.max(...dias.map((d) => porDia[d]), 1);
  // El `title` nativo no es visible en pantallas táctiles ni sin mouse — este
  // dato (el día con más uso) queda siempre a la vista, sin depender del hover.
  const diaPico = dias.reduce((mejor, d) => (porDia[d] > porDia[mejor] ? d : mejor), dias[0]);

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex h-32 items-end gap-1" role="img" aria-label="Gráfico de usos por día este mes">
        {dias.map((d) => {
          const valor = porDia[d];
          const alturaPct = Math.max((valor / max) * 100, valor > 0 ? 6 : 0);
          return (
            <div key={d} className="relative flex-1" title={`${formatoDia.format(new Date(d))}: ${valor} usos`}>
              <div
                className="mx-auto w-full rounded-t bg-primary motion-safe:transition-[height]"
                style={{ height: `${alturaPct}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* text-text-muted, no text-text-faint: #6E6E8A sobre bg da ~3.98:1, bajo
          el 4.5:1 de AA para texto normal (auditoría 8.1, WCAG 1.4.3). */}
      <div className="mt-2 flex justify-between text-xs text-text-muted">
        <span>{formatoDia.format(new Date(dias[0]))}</span>
        <span>{formatoDia.format(new Date(dias[dias.length - 1]))}</span>
      </div>
      {porDia[diaPico] > 0 && (
        <p className="mt-3 text-xs text-text-muted">
          Día con más uso: <span className="font-medium text-text">{formatoDia.format(new Date(diaPico))}</span> ·{" "}
          {porDia[diaPico].toLocaleString("es-CL")} usos
        </p>
      )}

      {/* Alternativa accesible al gráfico visual para lectores de pantalla. */}
      <table className="sr-only">
        <caption>Usos por día este mes</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Usos</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d}>
              <td>{formatoDia.format(new Date(d))}</td>
              <td>{porDia[d]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
