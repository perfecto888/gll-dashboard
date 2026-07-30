"use client";

import { useMemo, useState } from "react";
import { geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import statesTopo from "us-atlas/states-albers-10m.json";

// FIPS → USPS code
const FIPS: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC",
  "12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY",
  "22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT",
  "31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH",
  "40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT",
  "50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY",
};

export interface StateStat {
  state: string;
  orders: number;
  revenue: number;
}

export default function USMap({
  stats,
  selected,
  onSelect,
}: {
  stats: StateStat[];
  selected: string | null;
  onSelect: (code: string, name: string) => void;
}) {
  const [hover, setHover] = useState<{ code: string; name: string; x: number; y: number } | null>(null);

  const { features, path } = useMemo(() => {
    // states-albers-10m is pre-projected — geoPath with no projection
    const topo = statesTopo as unknown as Parameters<typeof feature>[0];
    const fc = feature(topo, (statesTopo as { objects: { states: Parameters<typeof feature>[1] } }).objects.states) as unknown as FeatureCollection<Geometry, { name: string }>;
    return { features: fc.features, path: geoPath() };
  }, []);

  const byCode = useMemo(() => new Map(stats.map((s) => [s.state, s])), [stats]);
  const maxOrders = Math.max(1, ...stats.map((s) => s.orders));

  return (
    <div className="usmap-wrap">
      <svg viewBox="0 0 975 610" className="usmap" role="img" aria-label="Orders by US state">
        {features.map((f: Feature<Geometry, { name: string }>) => {
          const code = FIPS[String(f.id).padStart(2, "0")];
          if (!code) return null;
          const stat = byCode.get(code);
          const isSel = selected === code;
          return (
            <path
              key={code}
              d={path(f) ?? undefined}
              className={`usmap-state${stat ? " has-orders" : ""}${isSel ? " selected" : ""}`}
              onClick={() => onSelect(code, f.properties.name)}
              onDoubleClick={() => onSelect(code, f.properties.name)}
              onMouseMove={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ code, name: f.properties.name, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {/* dots at state centroids, sized by order count */}
        {features.map((f: Feature<Geometry, { name: string }>) => {
          const code = FIPS[String(f.id).padStart(2, "0")];
          const stat = code ? byCode.get(code) : undefined;
          if (!stat) return null;
          const [cx, cy] = path.centroid(f);
          if (!isFinite(cx)) return null;
          const r = 5 + 22 * Math.sqrt(stat.orders / maxOrders);
          return (
            <g key={`dot-${code}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={r} className="usmap-dot" />
              <text x={cx} y={cy} dy="0.35em" textAnchor="middle" className="usmap-dot-label">
                {stat.orders}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="usmap-tooltip" style={{ left: hover.x + 12, top: hover.y - 10 }}>
          <b>{hover.name}</b>
          <div>
            {byCode.get(hover.code)
              ? `${byCode.get(hover.code)!.orders} orders · $${Math.round(byCode.get(hover.code)!.revenue).toLocaleString()}`
              : "No orders"}
          </div>
        </div>
      )}
    </div>
  );
}
