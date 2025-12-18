// Property Valuation Dashboard (GitHub Pages)
// Reads: data/valuations.json
// Renders: horizontal floating bars (min-max) + red base dots
// Interaction: click row -> detail panel + quick Q&A

function money(x){ return `£${Number(x).toFixed(2)}m`; }

function overlapBand(rows){
  const lo = Math.max(...rows.map(r => r.low));
  const hi = Math.min(...rows.map(r => r.high));
  return lo < hi ? [lo, hi] : null;
}

function mostLikelyWinner(rows){
  // Simple heuristic: winner tends to sit near top of overlap, with lowest discount rate.
  const ov = overlapBand(rows);
  if(!ov) return null;
  const inBand = rows.filter(r => r.base >= ov[0] && r.base <= ov[1]);
  const pool = inBand.length ? inBand : rows;
  pool.sort((a,b) => (a.discount_rate ?? 99) - (b.discount_rate ?? 99));
  return pool[0] ?? null;
}

function buildAnswer(kind, rows, selected){
  const ov = overlapBand(rows);
  const overlapText = ov ? `${money(ov[0])}–${money(ov[1])}` : "No full overlap band (ranges don't all intersect).";

  const sorted = [...rows].sort((a,b) => b.base - a.base);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const winner = mostLikelyWinner(rows);

  if(kind === "overlap") return `Overlap band: ${overlapText}`;
  if(kind === "highest") return `Highest base value: ${highest.investor} at ${money(highest.base)}.\nWhy: ${highest.why ?? "Lower cost of capital / greater willingness to pay for durability & scarcity."}`;
  if(kind === "lowest") return `Lowest base value: ${lowest.investor} at ${money(lowest.base)}.\nWhy: ${lowest.why ?? "Higher required returns / more aggressive risk pricing."}`;
  if(kind === "winner"){
    if(!winner) return `Winner: unclear (no overlap band).\nTry narrowing the investor set or re-check ranges.`;
    return `Most likely winner (heuristic): ${winner.investor}.\nRationale: ${winner.profile ?? "Patient capital / lower cost of capital in the overlap band."}`;
  }
  return "";
}

async function loadData(){
  const res = await fetch("./data/valuations.json");
  if(!res.ok) throw new Error("Could not load data/valuations.json");
  const rows = await res.json();
  // Normalize
  return rows.map(r => ({
    investor: r.investor,
    low: Number(r.low),
    base: Number(r.base),
    high: Number(r.high),
    discount_rate: r.discount_rate != null ? Number(r.discount_rate) : null,
    exit_yield: r.exit_yield != null ? Number(r.exit_yield) : null,
    hold_years: r.hold_years != null ? Number(r.hold_years) : null,
    profile: r.profile || "",
    why: r.why || ""
  }));
}

function renderDetail(selected){
  const detail = document.getElementById("detail");
  if(!selected){
    detail.textContent = "Hello! Click on any investor row in the chart to see the profile and reasoning.";
    return;
  }
  const lines = [];
  lines.push(`${selected.investor}`);
  lines.push(`Base: ${money(selected.base)} · Range: ${money(selected.low)}–${money(selected.high)}`);
  const extra = [];
  if(selected.discount_rate != null) extra.push(`Discount: ${selected.discount_rate}%`);
  if(selected.exit_yield != null) extra.push(`Exit yield: ${selected.exit_yield}%`);
  if(selected.hold_years != null) extra.push(`Hold: ${selected.hold_years}y`);
  if(extra.length) lines.push(extra.join(" · "));
  if(selected.profile) lines.push(`\nMandate lens: ${selected.profile}`);
  if(selected.why) lines.push(`\nKey driver: ${selected.why}`);
  detail.textContent = lines.join("\n");
}

function computeDomain(rows){
  const minX = Math.min(...rows.map(r => r.low));
  const maxX = Math.max(...rows.map(r => r.high));
  const pad = (maxX - minX) * 0.08 || 1;
  return [Math.floor((minX - pad) * 10) / 10, Math.ceil((maxX + pad) * 10) / 10];
}

function setupQA(rows, getSelected){
  const answerEl = document.getElementById("answer");
  document.querySelectorAll(".qa button").forEach(btn => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-q");
      const selected = getSelected();
      answerEl.textContent = buildAnswer(kind, rows, selected);
    });
  });
}

function setOverlapLabel(rows){
  const ov = overlapBand(rows);
  const el = document.getElementById("overlap");
  el.textContent = ov ? `Overlap band: ${money(ov[0])}–${money(ov[1])}` : "Overlap band: none";
}

function makeChart(rows){
  const labels = rows.map(r => r.investor);

  // Floating bars: data as [min, max]
  const rangeData = rows.map(r => [r.low, r.high]);
  const baseData = rows.map((r, idx) => ({ x: r.base, y: idx }));

  const [xMin, xMax] = computeDomain(rows);

  const ctx = document.getElementById("chart").getContext("2d");
  const ov = overlapBand(rows);

  let selectedIndex = null;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Range",
          data: rangeData,
          borderWidth: 0,
          borderRadius: 999,
          barPercentage: 0.65,
          categoryPercentage: 0.8
        },
        {
          type: "scatter",
          label: "Base",
          data: baseData,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: false,
      scales: {
        x: {
          min: xMin,
          max: xMax,
          ticks: {
            callback: (v) => `£${v}m`,
            color: "#94a3b8"
          },
          grid: { color: "rgba(148,163,184,0.15)" }
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items?.[0]?.label ?? "",
            label: (item) => {
              const i = item.dataIndex;
              const r = rows[i];
              return [
                `Range: ${money(r.low)}–${money(r.high)}`,
                `Base: ${money(r.base)}`,
                r.discount_rate != null ? `Discount: ${r.discount_rate}%` : null,
                r.exit_yield != null ? `Exit yield: ${r.exit_yield}%` : null
              ].filter(Boolean);
            }
          }
        }
      },
      onClick: (evt) => {
        const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
        if(!points.length) return;

        const p = points[0];
        // For bar dataset, index is investor row index. For scatter, y is also index.
        const idx = p.index ?? p.element?.$context?.raw?.y ?? null;
        if(idx == null) return;

        selectedIndex = idx;
        chart.update();
        window.__selectedInvestor = rows[idx];
        renderDetail(rows[idx]);
      }
    },
    plugins: [{
      id: "overlapBand",
      beforeDatasetsDraw(chart){
        if(!ov) return;
        const {ctx, chartArea, scales} = chart;
        const x1 = scales.x.getPixelForValue(ov[0]);
        const x2 = scales.x.getPixelForValue(ov[1]);
        ctx.save();
        ctx.fillStyle = "rgba(148,163,184,0.08)";
        ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    },{
      id: "styleDatasets",
      beforeDatasetDraw(chart, args){
        // Apply dataset colors without hardcoding in CSS
        // Range bars (blue)
        if(args.index === 0){
          chart.data.datasets[0].backgroundColor = "rgba(59,130,246,0.7)";
        }
        // Base points (red)
        if(args.index === 1){
          chart.data.datasets[1].backgroundColor = "rgba(239,68,68,0.9)";
        }
      }
    },{
      id: "highlightSelectedRow",
      afterDatasetsDraw(chart){
        if(selectedIndex == null) return;
        const {ctx, chartArea, scales} = chart;
        const yCenter = scales.y.getPixelForTick(selectedIndex);
        const band = scales.y.getPixelForTick(Math.min(selectedIndex+1, scales.y.ticks.length-1)) - yCenter;
        const h = Math.abs(band) * 0.8;
        ctx.save();
        ctx.strokeStyle = "rgba(226,232,240,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(chartArea.left, yCenter - h/2, chartArea.right - chartArea.left, h);
        ctx.restore();
      }
    }]
  });

  window.__selectedInvestor = null;
  return () => window.__selectedInvestor;
}

(async function init(){
  const rows = await loadData();
  setOverlapLabel(rows);
  const getSelected = makeChart(rows);
  setupQA(rows, getSelected);
})();
