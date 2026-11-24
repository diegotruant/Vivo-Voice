import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  Target,
  Award,
  RotateCcw,
} from "lucide-react";
import { VocalSessionRecord } from "../types/vocal";

interface VocalProgressSectionProps {
  sessions: VocalSessionRecord[];
  onResetHistory: () => void;
  onNavigateToStudio: () => void;
}

/** Absolute Italian date label from the stored ISO date (legacy records keep their label). */
function formatSessionDate(s: VocalSessionRecord): string {
  if (s.fullDate && s.fullDate.length > 10) {
    const d = new Date(s.fullDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("it-IT", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  // Legacy records stored a relative "Oggi HH:MM" label plus a YYYY-MM-DD date
  if (s.dateLabel?.startsWith("Oggi") && /^\d{4}-\d{2}-\d{2}$/.test(s.fullDate)) {
    const d = new Date(`${s.fullDate}T00:00:00`);
    const day = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    return `${day}${s.dateLabel.slice(4)}`;
  }
  return s.dateLabel;
}

export const VocalProgressSection: React.FC<VocalProgressSectionProps> = ({
  sessions,
  onResetHistory,
  onNavigateToStudio,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("Tutte");
  const [chartMetric, setChartMetric] = useState<"accuracy" | "cents">("accuracy");

  const categories = useMemo(() => {
    const unique = new Set<string>(["Tutte"]);
    sessions.forEach((s) => unique.add(s.category));
    return Array.from(unique);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const base =
      selectedCategory === "Tutte"
        ? sessions
        : sessions.filter((s) => s.category === selectedCategory);
    // Date label derived at render time from the stored ISO date
    return base.map((s) => ({ ...s, dateLabel: formatSessionDate(s) }));
  }, [sessions, selectedCategory]);

  // Compute aggregate KPIs with tabular precision
  const stats = useMemo(() => {
    if (filteredSessions.length === 0) {
      return {
        latestAccuracy: 0,
        avgAccuracy: 0,
        improvementDelta: null as number | null,
        avgStability: 0,
        avgAbsCents: 0,
        totalMinutes: null as number | null,
      };
    }
    const firstAcc = filteredSessions[0].accuracyPercent;
    const latestAcc =
      filteredSessions[filteredSessions.length - 1].accuracyPercent;
    const sumAcc = filteredSessions.reduce((acc, s) => acc + s.accuracyPercent, 0);
    const sumStab = filteredSessions.reduce(
      (acc, s) => acc + s.stabilityPercent,
      0
    );
    const sumAbsCents = filteredSessions.reduce(
      (acc, s) => acc + Math.abs(s.avgCentsDeviation),
      0
    );
    // durationMin 0 = not measured; only sum measured durations
    const measured = filteredSessions.filter((s) => s.durationMin > 0);
    const totalMin =
      measured.length > 0
        ? Math.round(measured.reduce((acc, s) => acc + s.durationMin, 0))
        : null;

    return {
      latestAccuracy: latestAcc,
      avgAccuracy: Math.round(sumAcc / filteredSessions.length),
      // Only meaningful with at least two sessions
      improvementDelta: filteredSessions.length >= 2 ? latestAcc - firstAcc : null,
      avgStability: Math.round(sumStab / filteredSessions.length),
      avgAbsCents: +(sumAbsCents / filteredSessions.length).toFixed(1),
      totalMinutes: totalMin,
    };
  }, [filteredSessions]);

  if (sessions.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-10 flex flex-col items-center text-center gap-4">
        <TrendingUp className="w-8 h-8 text-sky-400" />
        <h2 className="text-xl font-semibold text-slate-100">Nessuna sessione ancora</h2>
        <p className="text-sm text-slate-400 max-w-lg">
          Completa un esercizio nella Palestra Vocale con il microfono attivo: ogni sessione
          misurata (accuratezza, stabilità, scarto in cent) comparirà qui e potrai seguire i tuoi
          progressi nel tempo.
        </p>
        <button
          type="button"
          onClick={onNavigateToStudio}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
        >
          Vai alla Palestra Vocale →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top KPI Summary Row (4 Columns, Tabular Numerals, Explicit Semantic State) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Accuratezza Ultima Sessione</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
            <span className="text-2xl font-bold text-slate-100">
              {stats.latestAccuracy}%
            </span>
            {stats.improvementDelta !== null ? (
              <span
                className={`text-xs font-semibold ${
                  stats.improvementDelta >= 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {stats.improvementDelta >= 0
                  ? `▲ +${stats.improvementDelta}% vs Inizio`
                  : `▼ ${stats.improvementDelta}% vs Inizio`}
              </span>
            ) : (
              <span className="text-xs text-slate-500">prima sessione</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Media periodo: <span className="font-mono text-slate-200">{stats.avgAccuracy}%</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Stabilità Sostenuto & Fiato</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
            <span className="text-2xl font-bold text-sky-400">
              {stats.avgStability}%
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Tenuta media su note lunghe e passaggi
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Scarto Medio Intonazione</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
            <span className="text-2xl font-bold text-emerald-400">
              ±{stats.avgAbsCents} cent
            </span>
            <span className="text-xs text-emerald-300 font-semibold">
              {stats.avgAbsCents <= 12 ? "● CENTRO ARMONICO" : "▲ IN CALIBRAZIONE"}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Soglia conservatoriale ottimale: ≤15 cent
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Sessioni & Volume Studio</div>
          <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
            <span className="text-2xl font-bold text-slate-100">
              {filteredSessions.length} sessioni
            </span>
            <span className="text-xs text-slate-300">
              {stats.totalMinutes !== null ? `${stats.totalMinutes} min totali` : "— min"}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Aggiornato in tempo reale dalla Palestra
          </div>
        </div>
      </div>

      {/* Main Two-Zone Progress Chart & Session Log Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Zone: Recharts Evolution Visualizer (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Telemetria Storica Recharts</span>
                <span aria-hidden="true">·</span>
                <span>Accuratezza (%) & Stabilità Diaframmatica</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
                Evoluzione dell&apos;Accuratezza Vocale nel Tempo
              </h2>
            </div>

            {/* Interactive Metric Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMetric("accuracy")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMetric === "accuracy"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Accuratezza & Stabilità (%)
              </button>
              <button
                type="button"
                onClick={() => setChartMetric("cents")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMetric === "cents"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Deviazione Centesimi (cent)
              </button>
            </div>
          </div>

          {/* Interactive Category Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategory === cat
                      ? "bg-slate-800 text-sky-300 border border-sky-500/40"
                      : "bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Cancellare definitivamente tutte le sessioni registrate?"
                    )
                  ) {
                    onResetHistory();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancella Storico</span>
              </button>
            </div>
          </div>

          {/* Primary Recharts Visualization Container */}
          <div className="w-full h-[320px] bg-[#0B1120] border border-slate-800 rounded-xl p-4">
            {chartMetric === "accuracy" ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={filteredSessions}
                  margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="stabilityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1E293B"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    fontFamily="IBM Plex Mono, monospace"
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    unit="%"
                    fontFamily="IBM Plex Mono, monospace"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontFamily: "IBM Plex Mono, monospace",
                      color: "#F8FAFC",
                    }}
                    formatter={(value, name) => [
                      `${value}%`,
                      name === "accuracyPercent"
                        ? "Accuratezza Intonazione"
                        : "Stabilità Appoggio",
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as VocalSessionRecord | undefined;
                      return item
                        ? `${label} · ${item.exerciseTitle} (${item.registerName})`
                        : label;
                    }}
                  />
                  <ReferenceLine
                    y={85}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    label={{
                      value: "Target Accademia 85%",
                      position: "insideTopRight",
                      fill: "#10B981",
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracyPercent"
                    stroke="#38BDF8"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#accuracyGrad)"
                    activeDot={{ r: 6, fill: "#38BDF8", stroke: "#F8FAFC" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="stabilityPercent"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#stabilityGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filteredSessions}
                  margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1E293B"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    fontFamily="IBM Plex Mono, monospace"
                  />
                  <YAxis
                    domain={[
                      (dataMin: number) => Math.min(-30, Math.floor(dataMin)),
                      (dataMax: number) => Math.max(30, Math.ceil(dataMax)),
                    ]}
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    unit="c"
                    fontFamily="IBM Plex Mono, monospace"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontFamily: "IBM Plex Mono, monospace",
                      color: "#F8FAFC",
                    }}
                    formatter={(value: any) => [
                      `${Number(value) > 0 ? `+${value}` : value} cent`,
                      "Scarto Medio dal Centro Armonico",
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#10B981" strokeWidth={1.5} />
                  <Bar
                    dataKey="avgCentsDeviation"
                    fill="#38BDF8"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend & Interpretation Callout */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-5 font-mono">
              <span className="text-sky-400">■ Accuratezza Intonazione (%)</span>
              <span className="text-emerald-400">■ Stabilità Sostenuto (%)</span>
              <span>--- Soglia Target (85%)</span>
            </div>
            <button
              type="button"
              onClick={onNavigateToStudio}
              className="text-sky-400 hover:text-sky-300 font-semibold underline whitespace-nowrap shrink-0"
            >
              Vai alla Palestra per registrare una nuova esecuzione →
            </button>
          </div>
        </div>

        {/* Right Zone: Chronological Session Log & Pedagogical Milestones (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Registro Storico Sessioni
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dettaglio cronologico delle valutazioni vocali.
                </p>
              </div>
              <Award className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {[...filteredSessions].reverse().map((session) => (
                <div
                  key={session.id}
                  className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-3.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>
                      {session.dateLabel} · {session.registerName}
                    </span>
                    <span
                      className={
                        session.accuracyPercent >= 85
                          ? "text-emerald-400 font-semibold"
                          : "text-amber-400 font-semibold"
                      }
                    >
                      {session.accuracyPercent >= 85 ? "●" : "▲"} {session.accuracyPercent}%
                      Intonazione
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-100">
                    {session.exerciseTitle}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>Stabilità: {session.stabilityPercent}%</span>
                    <span>·</span>
                    <span>
                      Scarto:{" "}
                      {session.avgCentsDeviation > 0
                        ? `+${session.avgCentsDeviation}`
                        : session.avgCentsDeviation}
                      c
                    </span>
                    <span>·</span>
                    <span>{session.durationMin > 0 ? `${session.durationMin} min` : "— min"}</span>
                  </div>

                  {session.coachNote && (
                    <p className="text-[11px] text-slate-300 mt-1 border-t border-slate-800/80 pt-1.5">
                      {session.coachNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
