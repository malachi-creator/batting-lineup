import React, { useRef } from "react";
import { ZONES, ZONE_LABELS } from "../stats.js";
import { tap } from "../haptics.js";

// Top-down field, home plate at bottom. Tap anywhere on the fan for an exact
// spot {a: angle°, d: depth 0–1}. Zone labels are visual guides only.
const HOME = { x: 210, y: 330 };
const R_IN = 150;
const R_OUT = 300;
const SLICES = {
  L: [-45, -15],
  M: [-15, 15],
  R: [15, 45],
};

function pt(deg, r) {
  const rad = (deg * Math.PI) / 180;
  return { x: HOME.x + r * Math.sin(rad), y: HOME.y - r * Math.cos(rad) };
}

function sectorPath(t0, t1, r0, r1) {
  const a = pt(t0, r1);
  const b = pt(t1, r1);
  if (r0 === 0) {
    return `M ${HOME.x} ${HOME.y} L ${a.x} ${a.y} A ${r1} ${r1} 0 0 1 ${b.x} ${b.y} Z`;
  }
  const c = pt(t1, r0);
  const d = pt(t0, r0);
  return `M ${a.x} ${a.y} A ${r1} ${r1} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${r0} ${r0} 0 0 0 ${d.x} ${d.y} Z`;
}

const FIELD_FAN = (() => {
  const lf = pt(-45, R_OUT);
  const rf = pt(45, R_OUT);
  return `M ${HOME.x} ${HOME.y} L ${lf.x} ${lf.y} A ${R_OUT} ${R_OUT} 0 0 1 ${rf.x} ${rf.y} Z`;
})();

const ZONE_GEO = {
  LF: { path: sectorPath(...SLICES.L, R_IN, R_OUT), label: pt(-30, (R_IN + R_OUT) / 2) },
  CF: { path: sectorPath(...SLICES.M, R_IN, R_OUT), label: pt(0, (R_IN + R_OUT) / 2) },
  RF: { path: sectorPath(...SLICES.R, R_IN, R_OUT), label: pt(30, (R_IN + R_OUT) / 2) },
  IF_L: { path: sectorPath(...SLICES.L, 0, R_IN), label: pt(-30, R_IN * 0.62) },
  IF_M: { path: sectorPath(...SLICES.M, 0, R_IN), label: pt(0, R_IN * 0.62) },
  IF_R: { path: sectorPath(...SLICES.R, 0, R_IN), label: pt(30, R_IN * 0.62) },
};

export function locToZone(loc) {
  const slice = loc.a < -15 ? "L" : loc.a > 15 ? "R" : "M";
  return loc.d * R_OUT < R_IN
    ? { L: "IF_L", M: "IF_M", R: "IF_R" }[slice]
    : { L: "LF", M: "CF", R: "RF" }[slice];
}

const DOT_COLORS = { hit: "#3DDC84", roe: "#FFC24B", out: "#FF6B6B", pick: "#249EFF" };

function clientToLoc(clientX, clientY, svg) {
  const p = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
  const dx = p.x - HOME.x;
  const dy = HOME.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) return null;

  let a = (Math.atan2(dx, dy) * 180) / Math.PI;
  a = Math.max(-45, Math.min(45, a));
  let d = dist / R_OUT;
  d = Math.max(0.04, Math.min(1, d));
  return { a: Math.round(a), d: +d.toFixed(2) };
}

// onZone(zone, loc): tap mode. marker: pending pin. heat/points: stats view.
export default function FieldDiagram({ onZone, marker, heat, heatColor = "#249EFF", points, size }) {
  const svgRef = useRef(null);

  const handlePointer = (e) => {
    if (!onZone) return;
    e.preventDefault();
    const loc = clientToLoc(e.clientX, e.clientY, svgRef.current);
    if (!loc) return;
    tap();
    onZone(locToZone(loc), loc);
  };

  const max = heat ? Math.max(1, ...Object.values(heat)) : 1;
  const markerPt = marker ? pt(marker.a, marker.d * R_OUT) : null;

  return (
    <div className="field-wrap" style={size ? { maxWidth: size } : undefined}>
      <svg ref={svgRef} viewBox="0 0 420 345" width="100%" role="img" aria-label="Field diagram">
        {/* Outfield */}
        <path className="field-outfield" d={FIELD_FAN} pointerEvents="none" />
        {/* Infield wedge */}
        {ZONES.filter((z) => z.startsWith("IF_")).map((z) => (
          <path key={`in-${z}`} className="field-infield" d={ZONE_GEO[z].path} pointerEvents="none" />
        ))}

        {/* Zone guides (not separate tap targets) */}
        {ZONES.map((z) => {
          const g = ZONE_GEO[z];
          const count = heat ? heat[z] || 0 : 0;
          return (
            <g key={z} pointerEvents="none">
              <path className="field-zone-guide" d={g.path} />
              {heat && count > 0 && (
                <path d={g.path} fill={heatColor} opacity={0.12 + 0.45 * (count / max)} />
              )}
              <text className="field-label" x={g.label.x} y={g.label.y} textAnchor="middle" fontSize={heat ? 15 : 17}>
                {ZONE_LABELS[z]}
              </text>
            </g>
          );
        })}

        {/* Single tap surface — exact placement anywhere on the fan */}
        {onZone && (
          <path
            className="field-surface"
            d={FIELD_FAN}
            onPointerDown={handlePointer}
          />
        )}

        {(points || []).map((p, i) => {
          const c = pt(p.a, p.d * R_OUT);
          return (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={8}
              fill={DOT_COLORS[p.kind] || DOT_COLORS.out}
              stroke="#0A1628"
              strokeWidth={2}
              opacity={0.9}
              pointerEvents="none"
            />
          );
        })}

        {markerPt && (
          <>
            <circle className="field-marker-ring" cx={markerPt.x} cy={markerPt.y} r={16} pointerEvents="none" />
            <circle className="field-marker" cx={markerPt.x} cy={markerPt.y} r={9} pointerEvents="none" />
          </>
        )}

        <circle cx={HOME.x} cy={HOME.y - 4} r={6} fill="#249EFF" pointerEvents="none" />
      </svg>
    </div>
  );
}
