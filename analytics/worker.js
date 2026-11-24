// YEDgames ziyaretçi sayacı + admin paneli
// Cloudflare Worker (tek dosya). Gerekenler:
//   - D1 veritabanı bağlantısı, adı: DB
//   - Gizli değişken (Secret): ADMIN_PASSWORD
// Adresler:
//   POST /hit    -> siteden gelen ziyaret kaydı
//   GET  /admin  -> şifreli panel (kullanıcı adı: admin)

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS visits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     path TEXT,
     referrer TEXT,
     country TEXT,
     device TEXT,
     visitor TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day)`,
];

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget/i;

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/hit" && request.method === "POST") {
      try {
        await ensureSchema(env.DB);
        await recordHit(request, env);
      } catch (e) {
        // Sayaç hatası siteyi asla etkilemesin
      }
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      if (!checkAuth(request, env)) {
        return new Response("Giriş gerekli", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="YEDgames Admin", charset="UTF-8"' },
        });
      }
      await ensureSchema(env.DB);
      const days = clampDays(url.searchParams.get("days"));
      const html = await renderAdmin(env.DB, days);
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function recordHit(request, env) {
  const ua = request.headers.get("User-Agent") || "";
  if (BOT_RE.test(ua)) return;

  let data = {};
  try {
    data = JSON.parse(await request.text());
  } catch (e) {}

  const origin = request.headers.get("Origin") || "";
  let siteHost = "";
  try { siteHost = new URL(origin).hostname; } catch (e) {}

  // Sadece dışarıdan gelen referrer'ın alan adını sakla
  let referrer = null;
  if (data.r) {
    try {
      const h = new URL(String(data.r)).hostname.replace(/^www\./, "");
      if (h && h !== siteHost.replace(/^www\./, "")) referrer = h.slice(0, 120);
    } catch (e) {}
  }

  const path = String(data.p || "/").slice(0, 200);
  const country = (request.cf && request.cf.country) || "XX";
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "Mobil" : "Masaüstü";

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  // Tekil ziyaretçi: IP + tarayıcı + gün'ün tek yönlü özeti. IP saklanmaz, çerez yok.
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const visitor = await sha256(`${day}|${ip}|${ua}|${env.ADMIN_PASSWORD || ""}`);

  await env.DB.prepare(
    "INSERT INTO visits (ts, day, path, referrer, country, device, visitor) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(now.getTime(), day, path, referrer, country, device, visitor.slice(0, 16)).run();
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkAuth(request, env) {
  const pass = env.ADMIN_PASSWORD;
  if (!pass) return false;
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0))); } catch (e) { return false; }
  const i = decoded.indexOf(":");
  const pw = i >= 0 ? decoded.slice(i + 1) : "";
  return safeEqual(pw, pass);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function clampDays(v) {
  const n = parseInt(v, 10);
  return [1, 7, 30, 90, 365].includes(n) ? n : 30;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let regionNames = null;
function countryName(code) {
  if (!code || code === "XX" || code === "T1") return "Bilinmiyor";
  try {
    regionNames = regionNames || new Intl.DisplayNames(["tr"], { type: "region" });
    return regionNames.of(code) || code;
  } catch (e) {
    return code;
  }
}

function flag(code) {
  if (!code || code.length !== 2 || code === "XX" || code === "T1") return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

async function renderAdmin(db, days) {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [totals, todayRow, perDay, countries, referrers, devices, pages] = await db.batch([
    db.prepare("SELECT COUNT(*) AS views, COUNT(DISTINCT visitor || day) AS visitors FROM visits WHERE day >= ?").bind(since),
    db.prepare("SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day = ?").bind(today),
    db.prepare("SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day >= ? GROUP BY day ORDER BY day").bind(since),
    db.prepare("SELECT country, COUNT(DISTINCT visitor || day) AS n FROM visits WHERE day >= ? GROUP BY country ORDER BY n DESC LIMIT 20").bind(since),
    db.prepare("SELECT COALESCE(referrer, '(doğrudan)') AS ref, COUNT(DISTINCT visitor || day) AS n FROM visits WHERE day >= ? GROUP BY ref ORDER BY n DESC LIMIT 20").bind(since),
    db.prepare("SELECT device, COUNT(DISTINCT visitor || day) AS n FROM visits WHERE day >= ? GROUP BY device ORDER BY n DESC").bind(since),
    db.prepare("SELECT path, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 10").bind(since),
  ]);

  const t = totals.results[0] || { views: 0, visitors: 0 };
  const td = todayRow.results[0] || { views: 0, visitors: 0 };

  // Boş günleri de göster
  const byDay = new Map(perDay.results.map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    series.push({ day: d, visitors: r ? r.visitors : 0, views: r ? r.views : 0 });
  }
  const maxV = Math.max(1, ...series.map((s) => s.visitors));

  const bars = series.map((s) => {
    const h = Math.round((s.visitors / maxV) * 100);
    return `<div class="bar" title="${esc(s.day)}: ${s.visitors} ziyaretçi, ${s.views} görüntüleme"><i style="height:${h}%"></i></div>`;
  }).join("");

  const list = (rows, label, valueKey = "n") => {
    const max = Math.max(1, ...rows.map((r) => r[valueKey]));
    if (!rows.length) return `<p class="empty">Henüz veri yok</p>`;
    return `<ul>${rows.map((r) => `<li><span class="lbl">${label(r)}</span><span class="num">${r[valueKey]}</span><b style="width:${Math.round((r[valueKey] / max) * 100)}%"></b></li>`).join("")}</ul>`;
  };

  const tabs = [1, 7, 30, 90, 365].map((d) =>
    `<a href="?days=${d}" class="${d === days ? "on" : ""}">${d === 1 ? "Bugün" : d === 365 ? "1 yıl" : d + " gün"}</a>`
  ).join("");

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YEDgames Admin</title>
<style>
:root{--bg:#f6f4ff;--card:#fff;--ink:#1d1640;--mute:#6b6590;--acc:#5b3df5;--soft:#e7e1ff}
@media (prefers-color-scheme:dark){:root{--bg:#120e24;--card:#1d1838;--ink:#f1eeff;--mute:#a49dc8;--acc:#8f78ff;--soft:#2d2654}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h1 span{color:var(--acc)}
.sub{color:var(--mute);margin:0 0 18px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.tabs a{padding:6px 12px;border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none;font-weight:600;font-size:13px}
.tabs a.on{background:var(--acc);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border-radius:16px;padding:16px}
.kpi .v{font-size:28px;font-weight:800}.kpi .k{color:var(--mute);font-size:13px}
.chart{display:flex;align-items:flex-end;gap:2px;height:140px;margin-top:8px}
.bar{flex:1;height:100%;display:flex;align-items:flex-end}.bar i{display:block;width:100%;background:var(--acc);border-radius:3px 3px 0 0;min-height:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}
h2{font-size:15px;margin:0 0 10px}
ul{list-style:none;margin:0;padding:0}
li{position:relative;display:flex;justify-content:space-between;padding:7px 10px;margin-bottom:4px;border-radius:8px;overflow:hidden}
li b{position:absolute;left:0;top:0;bottom:0;background:var(--soft);z-index:0;border-radius:8px}
li span{position:relative;z-index:1}.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px}.num{font-weight:700}
.empty{color:var(--mute)}
.range{display:flex;justify-content:space-between;color:var(--mute);font-size:12px;margin-top:6px}
</style></head><body><div class="wrap">
<h1>YED<span>games</span> Ziyaretçi Paneli</h1>
<p class="sub">Çerezsiz sayım. Tekil ziyaretçi her gün ayrı sayılır.</p>
<div class="tabs">${tabs}</div>
<div class="kpis">
  <div class="card kpi"><div class="v">${td.visitors}</div><div class="k">Bugün ziyaretçi</div></div>
  <div class="card kpi"><div class="v">${t.visitors}</div><div class="k">Ziyaretçi (seçili dönem)</div></div>
  <div class="card kpi"><div class="v">${t.views}</div><div class="k">Sayfa görüntüleme</div></div>
  <div class="card kpi"><div class="v">${countries.results.length}</div><div class="k">Ülke</div></div>
</div>
<div class="card"><h2>Günlük ziyaretçi</h2><div class="chart">${bars}</div>
<div class="range"><span>${esc(series[0].day)}</span><span>${esc(series[series.length - 1].day)}</span></div></div>
<div class="grid">
  <div class="card"><h2>Ülkeler</h2>${list(countries.results, (r) => `${flag(r.country)} ${esc(countryName(r.country))}`)}</div>
  <div class="card"><h2>Nereden geldiler</h2>${list(referrers.results, (r) => esc(r.ref))}</div>
  <div class="card"><h2>Cihaz</h2>${list(devices.results, (r) => esc(r.device))}</div>
  <div class="card"><h2>Sayfalar</h2>${list(pages.results, (r) => esc(r.path))}</div>
</div>
</div></body></html>`;
}
