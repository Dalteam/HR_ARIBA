"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";

// Colours from the prototype's final chart patch (ariba-v41-chart-colors).
const C = { dark: "#014D3D", light: "#29B35E", beige: "#E4E4BC", black: "#111111", gray: "#B8BFBC" };

function norm(v: string): string {
  return v.trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
}

export type Palette = "nationality" | "department" | "employer";

export function colorFor(palette: Palette, labelAr: string): string {
  const k = norm(labelAr);
  if (palette === "nationality") {
    if (k.startsWith("اردني")) return C.beige;
    if (k.startsWith("سوداني")) return C.dark;
    if (k.startsWith("تونسي")) return C.black;
    if (k.startsWith("سوري")) return C.gray;
    if (k.startsWith("مصري")) return C.light;
    if (k.startsWith("سعودي")) return C.dark;
  }
  if (palette === "department") {
    if (k === "التطوير") return C.black;
    if (k === "الماليه") return C.beige;
    if (k === "التسويق") return C.light;
    if (k === "التشغيل") return C.dark;
  }
  if (k === "اريبا" || k === "ariba") return C.dark;
  if (k.includes("جيوميك") || k.includes("geomech")) return C.light;
  if (k === "اوبتيموم" || k === "optimum") return C.beige;
  return C.gray;
}

interface ChartProps {
  labels: string[];
  data: number[];
  colors: string[];
  height: number;
}

/** Prototype `mkBar`. */
export function BarChart({ labels, data, colors, height }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => " " + Number(c.parsed.y).toLocaleString() } },
        },
        scales: {
          x: { ticks: { color: "#6B7280", font: { size: 10 } }, grid: { color: "rgba(36,48,68,.18)" } },
          y: { ticks: { color: "#6B7280", font: { size: 10 } }, grid: { color: "rgba(36,48,68,.18)" } },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, data, colors]);
  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}

/** Prototype `mkDonut`. */
export function DonutChart({ labels, data, colors, height }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: "62%",
        plugins: {
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}` } },
          legend: { position: "bottom", labels: { color: "#8A928F", font: { size: 10 }, boxWidth: 10, padding: 6 } },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, data, colors]);
  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}
