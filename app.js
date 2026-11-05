/* STORYTELLER.VTG — back office app (Supabase) */
window.STORYTELLER_APP_LOADED = true;
(function () {
"use strict";

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const has = v => v !== undefined && v !== null && v !== "";
const baht = v => (v < 0 ? "−" : "") + "฿" + Math.abs(Math.round(v)).toLocaleString("th-TH");
const signed = v => (v > 0 ? "+" : v < 0 ? "−" : "") + "฿" + Math.abs(Math.round(v)).toLocaleString("th-TH");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmtDate = s => { if (!s) return "—"; const d = new Date(s + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); };
const totalCost = s => n(s.cost) + n(s.extra_cost);
const profitOf = s => s.sold ? n(s.sold_price) - totalCost(s) : null;
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const addDays = (d, k) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + k); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800); }

// ---------- config / client ----------
const CFG = window.STORYTELLER_CONFIG || {};
const BUCKET = CFG.PHOTO_BUCKET || "shirt-photos";
const configured = CFG.SUPABASE_URL && !/YOUR-PROJECT-ID/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(CFG.SUPABASE_ANON_KEY);
const sb = (configured && window.supabase) ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : (window.__MOCK_SB__ || null);

// ---------- state ----------
const state = { shirts: [], layaways: [], layReady: true, view: "dash", label: null, q: "", sort: "new", loaded: false, user: null };
try { const v = localStorage.getItem("stvtg_view"); if (v) state.view = v; } catch (e) {}

// =========================================================
//  AUTH
// =========================================================
const authView = $("#authView"), appView = $("#appView");
function showAuth(which, msg, kind) {
  authView.hidden = false; appView.hidden = true;
  $("#loginForm").hidden = which !== "login";
  $("#resetForm").hidden = which !== "reset";
  $("#newPassForm").hidden = which !== "newpass";
  const m = $("#authMsg"); m.textContent = msg || ""; m.className = "auth-msg " + (kind || "");
}
function authError(err) {
  const msg = (err && err.message) || "";
  if (/Invalid login credentials/i.test(msg)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (/Email not confirmed/i.test(msg)) return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล";
  if (/rate limit|too many/i.test(msg)) return "ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่";
  return msg || "เกิดข้อผิดพลาด ลองอีกครั้ง";
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), password = $("#loginPass").value;
  if (!email || !password) return showAuth("login", "กรอกอีเมลและรหัสผ่าน", "err");
  const btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "กำลังเข้าสู่ระบบ…";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "เข้าสู่หลังร้าน";
  if (error) showAuth("login", authError(error), "err");
});
$("#forgotBtn").onclick = () => { $("#resetEmail").value = $("#loginEmail").value; showAuth("reset"); };
$("#backToLogin").onclick = () => showAuth("login");
$("#resetForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#resetEmail").value.trim(); if (!email) return;
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) showAuth("reset", authError(error), "err");
  else showAuth("login", "ส่งลิงก์ไปที่อีเมลแล้ว เปิดลิงก์ในอีเมลเพื่อตั้งรหัสผ่านใหม่", "ok");
});
$("#newPassForm").addEventListener("submit", async e => {
  e.preventDefault();
  const password = $("#newPass").value;
  if (password.length < 8) return showAuth("newpass", "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร", "err");
  const { error } = await sb.auth.updateUser({ password });
  if (error) return showAuth("newpass", authError(error), "err");
  toast("ตั้งรหัสผ่านใหม่แล้ว");
  history.replaceState(null, "", location.pathname);
  location.reload();
});
$("#logoutBtn").onclick = async () => { await sb.auth.signOut(); };

let entering = false;
async function enterApp(session) {
  if (!session || entering) return;
  entering = true;
  try {
    // team check: team_members is only readable by team members (RLS)
    const { data, error } = await sb.from("team_members").select("email").limit(1);
    if (error || !data || !data.length) {
      await sb.auth.signOut();
      showAuth("login", "บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าหลังร้าน ติดต่อเจ้าของร้านเพื่อเพิ่มอีเมลในทีม", "err");
      return;
    }
    state.user = session.user;
    $("#whoAmI").textContent = session.user.email || "";
    authView.hidden = true; appView.hidden = false;
    await loadShirts();
    subscribe();
  } finally { entering = false; }
}
function leaveApp() {
  state.user = null; state.shirts = []; state.loaded = false;
  if (channel) { sb.removeChannel(channel); channel = null; }
  showAuth("login");
}

// =========================================================
//  DATA
// =========================================================
async function loadShirts() {
  const all = []; let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from("shirts").select("*").order("created_at", { ascending: false }).range(from, from + page - 1);
    if (error) { toast("โหลดข้อมูลไม่สำเร็จ: " + error.message); break; }
    all.push(...data); if (data.length < page) break; from += page;
  }
  state.shirts = all;
  await loadLayaways(false);
  state.loaded = true;
  await render();
}
async function loadLayaways(draw = true) {
  const { data, error } = await sb.from("layaways").select("*, layaway_payments(*)").order("created_at", { ascending: false });
  if (error) { state.layReady = false; state.layaways = []; }
  else {
    state.layReady = true;
    state.layaways = data.map(l => ({ ...l, payments: (l.layaway_payments || []).sort((a, b) => (a.paid_at || "").localeCompare(b.paid_at || "") || (a.created_at || "").localeCompare(b.created_at || "")) }));
  }
  if (draw) await render();
}
let channel = null, reloadT = null;
function subscribe() {
  if (channel || !sb.channel) return;
  channel = sb.channel("shirts-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "shirts" }, () => {
      clearTimeout(reloadT); reloadT = setTimeout(loadShirts, 400);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "layaways" }, () => {
      clearTimeout(reloadT); reloadT = setTimeout(loadShirts, 400);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "layaway_payments" }, () => {
      clearTimeout(reloadT); reloadT = setTimeout(loadShirts, 400);
    }).subscribe();
}
async function saveShirt(id, data) {
  if (id) {
    const { error } = await sb.from("shirts").update(data).eq("id", id); if (error) throw error;
    const i = state.shirts.findIndex(s => s.id === id); if (i >= 0) state.shirts[i] = { ...state.shirts[i], ...data };
  } else {
    const { data: row, error } = await sb.from("shirts").insert(data).select().single(); if (error) throw error;
    state.shirts.unshift(row);
  }
  await render();
}
async function removeShirt(s) {
  const { error } = await sb.from("shirts").delete().eq("id", s.id); if (error) throw error;
  if (s.photos && s.photos.length) await sb.storage.from(BUCKET).remove(s.photos);
  state.shirts = state.shirts.filter(x => x.id !== s.id);
  await render();
}

// photos: private bucket → short-lived signed URLs, cached
const urlCache = new Map(); // path -> {url, exp}
async function ensureUrls(paths) {
  const now = Date.now();
  const need = [...new Set(paths.filter(p => p && !(urlCache.get(p)?.exp > now + 60000)))];
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(chunk, 3600);
    if (error || !data) continue;
    data.forEach(d => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 }); });
  }
}
const photoUrl = p => urlCache.get(p)?.url || "";
async function uploadPhoto(file) {
  const blob = await shrink(file);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${new Date().getFullYear()}/${uuid()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;
  await ensureUrls([path]);
  return path;
}
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5e6 && /image\/(jpeg|png|webp)/.test(file.type)) return file;
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise(r => c.toBlob(r, "image/jpeg", 0.86))) || file;
  } catch (e) { return file; }
}

// =========================================================
//  DERIVED
// =========================================================
function allLabels() {
  const m = new Map();
  state.shirts.forEach(s => (s.labels || []).forEach(l => m.set(l, (m.get(l) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = state.shirts.filter(s => {
    if (state.label && !(s.labels || []).includes(state.label)) return false;
    if (q) {
      const hay = [s.code, s.name, s.tag, s.style, s.fit, s.defects, (s.labels || []).join(" "), s.note].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by = {
    new: (a, b) => (b.buy_date || "").localeCompare(a.buy_date || "") || (b.created_at || "").localeCompare(a.created_at || ""),
    old: (a, b) => (a.buy_date || "9").localeCompare(b.buy_date || "9"),
    costHi: (a, b) => totalCost(b) - totalCost(a),
    cond: (a, b) => n(b.condition) - n(a.condition),
    profit: (a, b) => (profitOf(b) ?? -1e12) - (profitOf(a) ?? -1e12)
  }[state.sort];
  return list.sort(by);
}
function nextCode() {
  let max = 0;
  state.shirts.forEach(s => { const m = /(\d+)\s*$/.exec(s.code || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return "STV-" + String(max + 1).padStart(3, "0");
}

// =========================================================
//  RENDER
// =========================================================
async function render() {
  const all = state.shirts, stock = all.filter(s => !s.sold && !activeLay(s.id)), sold = all.filter(s => s.sold);
  $("#cStock").textContent = stock.length; $("#cSold").textContent = sold.length; $("#cAll").textContent = all.length;
  const actives = state.layaways.filter(l => l.status === "active");
  $("#cLay").textContent = actives.length;
  $("#cLay").classList.toggle("alert", actives.some(isOverdue));
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.v === state.view)));
  $("#toolbar").hidden = state.view === "dash" || state.view === "lay";

  const labs = allLabels();
  $("#labelBar").innerHTML = labs.length ? `<button class="chip" data-l="" aria-pressed="${!state.label}">ทุกป้าย</button>` +
    labs.map(([l, c]) => `<button class="chip" data-l="${esc(l)}" aria-pressed="${state.label === l}">#${esc(l)}<span class="n">${c}</span></button>`).join("") : "";

  const main = $("#main");
  if (!state.loaded) { main.innerHTML = `<div class="loading-screen">กำลังเปิดตู้เสื้อ…</div>`; return; }
  if (state.view === "dash") { main.innerHTML = dashHTML(); bindRows(main); return; }
  if (state.view === "lay") { await renderLayaways(main); return; }
  let list = filtered();
  if (state.view === "stock") list = list.filter(s => !s.sold && !activeLay(s.id));
  if (state.view === "sold") list = list.filter(s => s.sold);
  if (!list.length) {
    main.innerHTML = `<p class="empty">${all.length ? "ไม่พบเสื้อที่ตรงกับตัวกรอง" : "ตู้ยังว่างอยู่ กด “+ เพิ่มเสื้อ” เพื่อลงตัวแรก"}</p>`; return;
  }
  await ensureUrls(list.map(s => (s.photos || [])[0]).filter(Boolean));
  main.innerHTML = `<div class="grid">${list.map(cardHTML).join("")}</div>`;
  main.querySelectorAll(".card").forEach(c => c.onclick = () => openDetail(c.dataset.id));
}
function sizeText(s) {
  const p = [];
  if (has(s.chest)) p.push(`อก ${esc(s.chest)}”`);
  if (has(s.length)) p.push(`ยาว ${esc(s.length)}”`);
  return p.join(" / ") || "ยังไม่ได้วัดไซส์";
}
const SHIRT_SVG = `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3c0 1.7-1.3 3-3 3S8 4.7 8 3z"/></svg>`;
function cardHTML(s) {
  const p = profitOf(s), first = (s.photos || [])[0];
  const img = first && photoUrl(first) ? `<img src="${esc(photoUrl(first))}" alt="" loading="lazy">` : `<div class="none">${SHIRT_SVG}</div>`;
  return `<button class="card" type="button" data-id="${esc(s.id)}">
    <div class="ph">${img}
      ${(() => { const l = activeLay(s.id); return s.sold ? `<span class="stamp sold">SOLD</span>` : l ? `<span class="stamp lay ${isOverdue(l) ? "late" : ""}">ผ่อนอยู่</span>` : `<span class="stamp">IN STOCK</span>`; })()}
      ${has(s.condition) ? `<span class="cond">${esc(s.condition)}</span>` : ""}
    </div>
    <div class="body">
      <span class="code">${esc(s.code || "")}${s.tag ? " · " + esc(s.tag) : ""}</span>
      <span class="name">${esc(s.name || "ไม่มีชื่อ")}</span>
      <span class="size">${sizeText(s)}${s.fit ? " · " + esc(s.fit) : ""}</span>
      <div class="money">
        <span>ทุน <span class="num">${baht(totalCost(s))}</span></span>
        ${s.sold ? `<span class="pill ${p >= 0 ? "gain" : "loss"}">${signed(p)}</span>` : activeLay(s.id) ? `<span class="num">ค้าง ${baht(remainOf(activeLay(s.id)))}</span>` : (has(s.ask_price) ? `<span class="num">ตั้ง ${baht(n(s.ask_price))}</span>` : "")}
      </div>
    </div>
  </button>`;
}

// ---------- dashboard ----------
function dashHTML() {
  let list = state.shirts;
  if (state.label) list = list.filter(s => (s.labels || []).includes(state.label));
  const sold = list.filter(s => s.sold), stock = list.filter(s => !s.sold && !activeLay(s.id));
  const listIds = new Set(list.map(s => s.id));
  const actLays = state.layaways.filter(l => l.status === "active" && listIds.has(l.shirt_id));
  const layRemain = actLays.reduce((a, l) => a + remainOf(l), 0), layPaid = actLays.reduce((a, l) => a + paidOf(l), 0);
  const layLate = actLays.filter(isOverdue).length;
  const revenue = sold.reduce((a, s) => a + n(s.sold_price), 0);
  const soldCost = sold.reduce((a, s) => a + totalCost(s), 0);
  const profit = revenue - soldCost;
  const stockCost = stock.reduce((a, s) => a + totalCost(s), 0);
  const stockAsk = stock.reduce((a, s) => a + n(s.ask_price), 0);
  const invested = list.reduce((a, s) => a + totalCost(s), 0);
  const margin = revenue ? profit / revenue * 100 : 0;
  const losers = sold.filter(s => profitOf(s) < 0).length;
  const scope = state.label ? ` · #${esc(state.label)}` : "";

  const lm = new Map();
  sold.forEach(s => { const ls = (s.labels && s.labels.length) ? s.labels : ["(ไม่มีป้าย)"]; ls.forEach(l => { const o = lm.get(l) || { c: 0, r: 0, p: 0 }; o.c++; o.r += n(s.sold_price); o.p += profitOf(s); lm.set(l, o); }); });
  const lrows = [...lm.entries()].sort((a, b) => b[1].p - a[1].p);
  const recent = [...sold].sort((a, b) => (b.sold_date || "").localeCompare(a.sold_date || "")).slice(0, 8);
  const aging = [...stock].sort((a, b) => (a.buy_date || "9").localeCompare(b.buy_date || "9")).slice(0, 6);
  const pill = v => `<span class="pill ${v >= 0 ? "gain" : "loss"}">${signed(v)}</span>`;

  if (!state.shirts.length) return `<div class="panel" style="text-align:center;padding:40px 20px">
    <h2 class="section-h" style="margin-top:0">ยินดีต้อนรับสู่หลังร้าน</h2>
    <p class="muted">ยังไม่มีเสื้อในระบบ เริ่มจากกด “+ เพิ่มเสื้อ” ด้านบนได้เลย</p></div>`;

  return `
  <div class="kpis">
    <div class="kpi hero ${profit < 0 ? "neg" : ""}"><span class="l">กำไร / ขาดทุนสุทธิ${scope}</span><span class="v">${signed(profit)}</span><span class="s">จากที่ขายแล้ว ${sold.length} ตัว${losers ? ` · ขาดทุน ${losers} ตัว` : ""}</span></div>
    <div class="kpi"><span class="l">ยอดขายรวม</span><span class="v">${baht(revenue)}</span><span class="s">มาร์จิ้น ${margin.toFixed(1)}%</span></div>
    <div class="kpi"><span class="l">ทุนของตัวที่ขายแล้ว</span><span class="v">${baht(soldCost)}</span><span class="s">รวมค่าซัก/ค่าส่ง</span></div>
    <div class="kpi"><span class="l">ทุนจมในสต็อก</span><span class="v">${baht(stockCost)}</span><span class="s">${stock.length} ตัว · ตั้งขายรวม ${baht(stockAsk)}</span></div>
    ${state.layReady ? `<div class="kpi ${layLate ? "warn" : ""}" data-go="lay" role="button" tabindex="0"><span class="l">ผ่อนค้างรับ</span><span class="v">${baht(layRemain)}</span><span class="s">${actLays.length} ราย · รับแล้ว ${baht(layPaid)}${layLate ? ` · <b>เกินกำหนด ${layLate} ราย</b>` : ""}</span></div>` : ""}
    <div class="kpi"><span class="l">ลงทุนทั้งหมด</span><span class="v">${baht(invested)}</span><span class="s">${list.length} ตัวที่เคยซื้อ</span></div>
  </div>
  <div class="dash-grid">
    <div class="panel chart"><h3>กำไรรายเดือน <small>6 เดือนล่าสุด ตามวันที่ขาย</small></h3>${chartSVG(sold)}</div>
    <div class="panel"><h3>กำไรตามป้ายกำกับ <small>เฉพาะที่ขายแล้ว</small></h3>
      ${lrows.length ? `<div class="tbl-wrap"><table><thead><tr><th>ป้าย</th><th class="r">ขาย</th><th class="r">ยอดขาย</th><th class="r">กำไร</th></tr></thead><tbody>
      ${lrows.map(([l, o]) => `<tr><td>#${esc(l)}</td><td class="r num">${o.c}</td><td class="r num">${baht(o.r)}</td><td class="r">${pill(o.p)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">ยังไม่มียอดขาย</p>`}
    </div>
  </div>
  <h2 class="section-h">Latest sold <small>ขายล่าสุด</small></h2>
  <div class="panel">${recent.length ? `<div class="tbl-wrap"><table><thead><tr><th>วันที่ขาย</th><th>รหัส</th><th>เสื้อ</th><th class="r">ทุน</th><th class="r">ขายได้</th><th class="r">กำไร</th></tr></thead><tbody>
    ${recent.map(s => `<tr class="click" data-id="${esc(s.id)}" tabindex="0"><td>${fmtDate(s.sold_date)}</td><td class="num">${esc(s.code || "")}</td><td>${esc(s.name || "")}</td><td class="r num">${baht(totalCost(s))}</td><td class="r num">${baht(n(s.sold_price))}</td><td class="r">${pill(profitOf(s))}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">ยังไม่มีเสื้อที่ขายแล้ว</p>`}</div>
  <h2 class="section-h">Dusty rack <small>ค้างสต็อกนานสุด</small></h2>
  <div class="panel">${aging.length ? `<div class="tbl-wrap"><table><thead><tr><th>ซื้อเมื่อ</th><th>รหัส</th><th>เสื้อ</th><th class="r">อยู่มา</th><th class="r">ทุน</th><th class="r">ตั้งขาย</th></tr></thead><tbody>
    ${aging.map(s => { const d = s.buy_date ? Math.max(0, Math.round((Date.now() - new Date(s.buy_date + "T00:00:00")) / 864e5)) : null; return `<tr class="click" data-id="${esc(s.id)}" tabindex="0"><td>${fmtDate(s.buy_date)}</td><td class="num">${esc(s.code || "")}</td><td>${esc(s.name || "")}</td><td class="r num ${d > 90 ? "loss" : ""}">${d === null ? "—" : d + " วัน"}</td><td class="r num">${baht(totalCost(s))}</td><td class="r num">${has(s.ask_price) ? baht(n(s.ask_price)) : "—"}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<p class="empty">ไม่มีเสื้อค้างสต็อก</p>`}</div>`;
}
function bindRows(root) {
  root.querySelectorAll("[data-go]").forEach(k => { const go = () => { state.view = k.dataset.go; render(); }; k.onclick = go; k.onkeydown = e => { if (e.key === "Enter") go(); }; });
  root.querySelectorAll("tr.click").forEach(r => { r.onclick = () => openDetail(r.dataset.id); r.onkeydown = e => { if (e.key === "Enter") openDetail(r.dataset.id); }; });
}
function chartSVG(sold) {
  const now = new Date(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), lab: d.toLocaleDateString("th-TH", { month: "short" }), v: 0, c: 0 }); }
  sold.forEach(s => { const m = months.find(x => x.k === (s.sold_date || "").slice(0, 7)); if (m) { m.v += profitOf(s); m.c++; } });
  const W = 560, H = 230, L = 58, R = 12, T = 24, B = 34, iw = W - L - R, ih = H - T - B;
  let max = Math.max(0, ...months.map(m => m.v)), min = Math.min(0, ...months.map(m => m.v));
  if (max === 0 && min === 0) max = 1000;
  const nice = v => { if (v <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  max = nice(max); min = min < 0 ? -nice(-min) : 0;
  const y = v => T + (max - v) / (max - min) * ih;
  const ticks = [max, 0]; if (max > 0) ticks.splice(1, 0, max / 2); if (min < 0 && (-min) / (max - min) * ih > 16) ticks.push(min);
  const bw = iw / months.length * 0.56;
  const mono = "Courier Prime,monospace";
  let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "#1D1A16" : "#D6CAB3"}" stroke-width="${t === 0 ? 1.5 : 1}" ${t === 0 ? "" : 'stroke-dasharray="3 4"'}/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#6B6254" font-family="${mono}">${t === 0 ? "0" : (t < 0 ? "−" : "") + Math.abs(t).toLocaleString("th-TH")}</text>`).join("");
  months.forEach((m, i) => {
    const cx = L + iw / months.length * (i + .5), x = cx - bw / 2, y0 = y(0), y1 = y(m.v), top = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), m.c ? 2 : 0);
    const col = m.v >= 0 ? "#F0641C" : "#C0392B";
    if (m.c) g += `<rect x="${x}" y="${top}" width="${bw}" height="${h}" fill="${col}" stroke="#1D1A16" stroke-width="1.5"><title>${m.lab}: ${signed(m.v)} (${m.c} ตัว)</title></rect>
      <text x="${cx}" y="${m.v >= 0 ? top - 7 : top + h + 14}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${m.v >= 0 ? "#1D1A16" : "#C0392B"}" font-family="${mono}">${signed(m.v)}</text>`;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="12.5" fill="#6B6254" font-family="Sarabun,sans-serif">${m.lab}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟกำไรรายเดือน">${g}</svg>`;
}

// =========================================================
//  MODALS
// =========================================================
let onClose = null;
function openModal(html) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const sc = $(".scrim", root); sc.addEventListener("mousedown", e => { if (e.target === sc) closeModal(); });
  document.addEventListener("keydown", escClose); document.body.style.overflow = "hidden";
  return $(".modal", root);
}
function closeModal() { if (onClose) { const f = onClose; onClose = null; f(); } $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); document.body.style.overflow = ""; }
function escClose(e) { if (e.key === "Escape") closeModal(); }
function dbErr(err) {
  const m = (err && err.message) || "";
  if (/row-level security|permission/i.test(m)) return "บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล";
  if (/JWT|expired/i.test(m)) return "หมดเวลาการเข้าสู่ระบบ ลอง login ใหม่";
  return "บันทึกไม่สำเร็จ: " + (m || "ลองอีกครั้ง");
}

function detailsText(s) {
  return `Details\nSize : อก ${s.chest || "-"}” / ยาว ${s.length || "-"}”\nFit : ${s.fit || "-"}\nTag : ${s.tag || "-"}\nStyle : ${s.style || "-"}\nCONDITION : ${has(s.condition) ? s.condition : "-"}/10\nตำหนิ : ${s.defects || "-"}`;
}

async function openDetail(id) {
  const s = state.shirts.find(x => x.id === id); if (!s) return;
  const photos = s.photos || [];
  await ensureUrls(photos);
  const p = profitOf(s);
  const m = openModal(`
    <div class="modal-h"><h2 class="num">${esc(s.code || "")}</h2><button class="x" type="button" aria-label="ปิด" id="mx">×</button></div>
    <div class="modal-b detail">
      <div class="gal">
        <div class="main">${photos.length ? `<img id="gmain" src="${esc(photoUrl(photos[0]))}" alt="${esc(s.name)}">` : `<div class="ph" style="height:100%;border:0"><div class="none">${SHIRT_SVG}</div></div>`}</div>
        ${photos.length > 1 ? `<div class="thumbs">${photos.map((ph, i) => `<button type="button" data-i="${i}" aria-current="${i === 0}"><img src="${esc(photoUrl(ph))}" alt="รูปที่ ${i + 1}"></button>`).join("")}</div>` : ""}
        ${photos.length ? `<div class="dl-row"><button class="btn small" type="button" id="dlOne">⤓ โหลดรูปนี้</button>${photos.length > 1 ? `<button class="btn small" type="button" id="dlAll">⤓ โหลดทุกรูป (${photos.length})</button>` : ""}</div>` : ""}
      </div>
      <div class="meta">
        <div>
          <h2 class="name">${esc(s.name || "ไม่มีชื่อ")}</h2>
          ${(s.labels || []).length ? `<div class="labels" style="margin-top:8px">${s.labels.map(l => `<span class="chip">#${esc(l)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="hangtag">
          <div class="t">DETAILS</div>
          <div class="row"><span class="k">Size :</span>อก ${esc(s.chest || "-")}” / ยาว ${esc(s.length || "-")}”</div>
          <div class="row"><span class="k">Fit :</span>${esc(s.fit || "-")}</div>
          <div class="row"><span class="k">Tag :</span>${esc(s.tag || "-")}</div>
          <div class="row"><span class="k">Style :</span>${esc(s.style || "-")}</div>
          <div class="row"><span class="k">CONDITION :</span>${esc(has(s.condition) ? s.condition : "-")}/10</div>
          <div class="row"><span class="k">ตำหนิ :</span>${esc(s.defects || "-")}</div>
        </div>
        <div><button class="btn small" type="button" id="copyD">คัดลอกรายละเอียดไปโพสต์</button></div>
        <div class="ledger">
          <div><div class="l">ทุนที่ซื้อ</div><div class="v">${baht(n(s.cost))}</div></div>
          <div><div class="l">วันที่ซื้อ</div><div class="v">${fmtDate(s.buy_date)}</div></div>
          <div><div class="l">ค่าซัก/ส่ง/อื่นๆ</div><div class="v">${baht(n(s.extra_cost))}</div></div>
          <div><div class="l">ราคาตั้งขาย</div><div class="v">${has(s.ask_price) ? baht(n(s.ask_price)) : "—"}</div></div>
          ${s.sold ? `<div><div class="l">ขายได้</div><div class="v">${baht(n(s.sold_price))}</div></div>
          <div><div class="l">วันที่ขาย</div><div class="v">${fmtDate(s.sold_date)}${s.channel ? " · " + esc(s.channel) : ""}</div></div>
          <div class="full"><div class="l">${p >= 0 ? "กำไร" : "ขาดทุน"}</div><div class="v ${p >= 0 ? "gain" : "loss"}" style="font-size:22px">${signed(p)}</div></div>` : ""}
          ${s.note ? `<div class="full"><div class="l">หมายเหตุ</div><div style="white-space:pre-wrap">${esc(s.note)}</div></div>` : ""}
        </div>
        ${(() => { const l = activeLay(s.id); if (!l) return ""; const pc = Math.min(100, paidOf(l) / Math.max(1, n(l.total_price)) * 100);
          return `<button type="button" class="laybox ${isOverdue(l) ? "late" : ""}" id="openLay">
            <span class="lb-h"><b>ผ่อนอยู่ · ${esc(l.customer_name)}</b><span>${dueText(l)}</span></span>
            <span class="bar"><i style="width:${pc.toFixed(1)}%"></i></span>
            <span class="lb-f num">จ่ายแล้ว ${baht(paidOf(l))} / ${baht(n(l.total_price))} · ค้าง ${baht(remainOf(l))}</span>
            <span class="lb-go">เปิดรายการผ่อน →</span></button>`; })()}
        ${!s.sold && !activeLay(s.id) ? `<form class="sellbox" id="sellF">
          <div class="field"><label for="sp">ขายได้ (฿)</label><input id="sp" type="number" inputmode="decimal" min="0" required value="${esc(s.ask_price ?? "")}"></div>
          <div class="field"><label for="sd">วันที่ขาย</label><input id="sd" type="date" required value="${today()}"></div>
          <button class="btn orange" type="submit">บันทึกว่าขายแล้ว</button>
        </form>
        ${state.layReady ? `<button class="btn" type="button" id="startLay">เปิดผ่อนให้ลูกค้า</button>` : ""}` : ""}
        <div id="delZone"></div>
      </div>
    </div>
    <div class="modal-f">
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="editB">แก้ไข</button>${s.sold ? `<button class="btn" type="button" id="unsell">ย้ายกลับเข้าสต็อก</button>` : ""}</div>
      <button class="btn danger" type="button" id="delB">ลบ</button>
    </div>`);
  $("#mx", m).onclick = closeModal;
  let cur = 0;
  m.querySelectorAll(".thumbs button").forEach(b => b.onclick = () => { cur = +b.dataset.i; $("#gmain", m).src = photoUrl(photos[cur]); m.querySelectorAll(".thumbs button").forEach(x => x.setAttribute("aria-current", String(x === b))); });
  const d1 = $("#dlOne", m), dA = $("#dlAll", m);
  if (d1) d1.onclick = () => downloadPhotos(s, [cur], d1);
  if (dA) dA.onclick = () => downloadPhotos(s, photos.map((_, i) => i), dA);
  const ol = $("#openLay", m); if (ol) ol.onclick = () => { const l = activeLay(s.id); closeModal(); openLayDetail(l.id); };
  const sl = $("#startLay", m); if (sl) sl.onclick = () => { closeModal(); openLayForm(s); };
  $("#copyD", m).onclick = async () => {
    try { await navigator.clipboard.writeText(detailsText(s)); toast("คัดลอกแล้ว"); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($(".hangtag", m)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("เลือกข้อความไว้แล้ว กด Ctrl/⌘+C"); }
  };
  $("#editB", m).onclick = () => { closeModal(); openForm(s); };
  const sf = $("#sellF", m);
  if (sf) sf.onsubmit = async e => {
    e.preventDefault();
    try { await saveShirt(s.id, { sold: true, sold_price: n($("#sp", m).value), sold_date: $("#sd", m).value || today() }); closeModal(); toast("บันทึกการขายแล้ว"); }
    catch (err) { toast(dbErr(err)); }
  };
  const us = $("#unsell", m);
  if (us) us.onclick = async () => {
    try { await saveShirt(s.id, { sold: false, sold_price: null, sold_date: null, channel: null }); closeModal(); toast("ย้ายกลับเข้าสต็อกแล้ว"); }
    catch (err) { toast(dbErr(err)); }
  };
  $("#delB", m).onclick = () => {
    $("#delZone", m).innerHTML = `<div class="confirm"><span>ลบ “${esc(s.name || s.code)}” และรูปทั้งหมดถาวร?</span><button class="btn small danger" type="button" id="delY">ลบเลย</button><button class="btn small" type="button" id="delN">ยกเลิก</button></div>`;
    $("#delN", m).onclick = () => { $("#delZone", m).innerHTML = ""; };
    $("#delY", m).onclick = async () => { try { await removeShirt(s); closeModal(); toast("ลบแล้ว"); } catch (err) { toast(dbErr(err)); } };
  };
}

// =========================================================
//  PHOTO DOWNLOAD
// =========================================================
const isTouch = () => matchMedia("(pointer: coarse)").matches;
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
let jszipP = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return jszipP ||= new Promise((ok, bad) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; sc.onload = () => ok(window.JSZip); sc.onerror = bad; document.head.appendChild(sc); });
}
async function downloadPhotos(s, idxs, btn) {
  const base = (s.code || s.name || "shirt").replace(/[\\/:*?"<>|\s]+/g, "-");
  const label = btn.textContent; btn.disabled = true; btn.textContent = "กำลังโหลด…";
  try {
    const files = [];
    for (const i of idxs) {
      const path = s.photos[i];
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) throw error || new Error("download failed");
      const ext = (path.split(".").pop() || "jpg").toLowerCase();
      files.push(new File([data], `${base}-${i + 1}.${ext}`, { type: data.type || "image/jpeg" }));
    }
    // มือถือ: เปิดเมนูแชร์ ให้กด "บันทึกรูปภาพ" ลงคลังรูปได้ทันที
    if (isTouch() && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    if (files.length === 1) { saveBlob(files[0], files[0].name); return; }
    const JSZip = await loadJSZip();
    const zip = new JSZip(); files.forEach(f => zip.file(f.name, f));
    saveBlob(await zip.generateAsync({ type: "blob" }), `${base}-photos.zip`);
  } catch (e) { toast("โหลดรูปไม่สำเร็จ ลองอีกครั้ง"); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// =========================================================
//  LAYAWAY (ผ่อน)
// =========================================================
function activeLay(shirtId) { return state.layaways.find(l => l.shirt_id === shirtId && l.status === "active") || null; }
function paidOf(l) { return (l.payments || []).reduce((a, p) => a + n(p.amount), 0); }
function remainOf(l) { return Math.max(0, n(l.total_price) - paidOf(l)); }
function isOverdue(l) { return l.status === "active" && l.due_date && l.due_date < today() && remainOf(l) > 0; }
function dueText(l) {
  if (!l.due_date) return "ไม่กำหนดวันครบ";
  const d = daysBetween(today(), l.due_date);
  if (l.status !== "active") return "ครบกำหนด " + fmtDate(l.due_date);
  return d < 0 ? `เกินกำหนด ${-d} วัน` : d === 0 ? "ครบกำหนดวันนี้" : `เหลือ ${d} วัน (${fmtDate(l.due_date)})`;
}
const shirtOf = id => state.shirts.find(s => s.id === id);
const STATUS_TH = { active: "กำลังผ่อน", completed: "ผ่อนครบ", cancelled: "ยกเลิก" };

async function renderLayaways(main) {
  if (!state.layReady) {
    main.innerHTML = `<div class="panel"><h3>ยังไม่ได้เปิดระบบผ่อน</h3><p class="muted">ไปที่ Supabase › SQL Editor แล้วรันไฟล์ <b>supabase/update-02-layaway.sql</b> จากนั้นรีเฟรชหน้านี้</p></div>`; return;
  }
  const act = state.layaways.filter(l => l.status === "active").sort((a, b) => (a.due_date || "9").localeCompare(b.due_date || "9"));
  const late = act.filter(isOverdue), ok = act.filter(l => !isOverdue(l));
  const done = state.layaways.filter(l => l.status !== "active").slice(0, 20);
  await ensureUrls(state.layaways.map(l => (shirtOf(l.shirt_id)?.photos || [])[0]).filter(Boolean));
  const row = l => {
    const s = shirtOf(l.shirt_id) || {}, ph = (s.photos || [])[0], pc = Math.min(100, paidOf(l) / Math.max(1, n(l.total_price)) * 100);
    return `<button type="button" class="lay-row ${isOverdue(l) ? "late" : ""} ${l.status}" data-lay="${esc(l.id)}">
      <span class="lr-ph">${ph && photoUrl(ph) ? `<img src="${esc(photoUrl(ph))}" alt="">` : SHIRT_SVG}</span>
      <span class="lr-main">
        <span class="lr-top"><b>${esc(l.customer_name)}</b>${l.customer_contact ? `<span class="muted"> · ${esc(l.customer_contact)}</span>` : ""}</span>
        <span class="lr-shirt">${esc(s.code || "")} ${esc(s.name || "(ลบเสื้อแล้ว)")}</span>
        <span class="bar"><i style="width:${pc.toFixed(1)}%"></i></span>
        <span class="lr-money num">${baht(paidOf(l))} / ${baht(n(l.total_price))}</span>
      </span>
      <span class="lr-side">${l.status === "active" ? `<span class="num big">${baht(remainOf(l))}</span><span class="lr-due">${dueText(l)}</span>` : `<span class="st ${l.status}">${STATUS_TH[l.status]}</span><span class="lr-due">${fmtDate(l.completed_at || (l.updated_at || "").slice(0, 10))}</span>`}</span>
    </button>`;
  };
  const totalRemain = act.reduce((a, l) => a + remainOf(l), 0);
  main.innerHTML = `
    <div class="kpis">
      <div class="kpi hero"><span class="l">ยอดผ่อนค้างรับทั้งหมด</span><span class="v">${baht(totalRemain)}</span><span class="s">${act.length} รายการที่กำลังผ่อน</span></div>
      <div class="kpi ${late.length ? "warn" : ""}"><span class="l">เกินกำหนด</span><span class="v">${late.length} ราย</span><span class="s">ค้าง ${baht(late.reduce((a, l) => a + remainOf(l), 0))}</span></div>
      <div class="kpi"><span class="l">รับเงินผ่อนแล้ว</span><span class="v">${baht(act.reduce((a, l) => a + paidOf(l), 0))}</span><span class="s">จากรายการที่ยังเปิดอยู่</span></div>
    </div>
    ${late.length ? `<h2 class="section-h">Overdue <small>เกินกำหนด ต้องตาม</small></h2><div class="lay-list">${late.map(row).join("")}</div>` : ""}
    <h2 class="section-h">On layaway <small>กำลังผ่อน · เรียงตามวันครบกำหนด</small></h2>
    ${ok.length ? `<div class="lay-list">${ok.map(row).join("")}</div>` : `<p class="empty">ไม่มีรายการผ่อนที่เปิดอยู่ · เปิดผ่อนได้จากหน้ารายละเอียดเสื้อ</p>`}
    ${done.length ? `<h2 class="section-h">History <small>ผ่อนครบ / ยกเลิก ล่าสุด</small></h2><div class="lay-list">${done.map(row).join("")}</div>` : ""}`;
  main.querySelectorAll("[data-lay]").forEach(b => b.onclick = () => openLayDetail(b.dataset.lay));
}

// เปิดผ่อน / แก้ไขรายการผ่อน
function openLayForm(s, existing) {
  const l = existing || {};
  const m = openModal(`
    <form id="layF" novalidate>
    <div class="modal-h"><h2>${existing ? "แก้ไขรายการผ่อน" : "เปิดผ่อน · " + esc(s.code || s.name)}</h2><button class="x" type="button" aria-label="ปิด" id="lx">×</button></div>
    <div class="modal-b">
      <p class="muted" style="margin-bottom:12px">${esc(s.name || "")}</p>
      <div class="form">
        <div class="field s4"><label for="lName">ชื่อลูกค้า</label><input id="lName" required value="${esc(l.customer_name || "")}"></div>
        <div class="field s2"><label for="lContact">IG / LINE / เบอร์</label><input id="lContact" value="${esc(l.customer_contact || "")}"></div>
        <div class="field s2"><label for="lTotal">ราคาเต็ม (฿)</label><input id="lTotal" type="number" min="0" inputmode="decimal" required value="${esc(l.total_price ?? s.ask_price ?? "")}"></div>
        ${existing ? "" : `<div class="field s2"><label for="lDep">มัดจำ (฿)</label><input id="lDep" type="number" min="0" inputmode="decimal" required></div>
        <div class="field s2"><label for="lDepM">จ่ายมัดจำด้วย</label><input id="lDepM" list="dlPay" placeholder="โอน / เงินสด"></div>`}
        <div class="field s2"><label for="lStart">วันที่เริ่มผ่อน</label><input id="lStart" type="date" value="${esc(l.start_date || today())}"></div>
        <div class="field s2"><label for="lDays">ระยะเวลาผ่อน</label>
          <select id="lDays"><option value="">กำหนดวันเอง</option><option value="14">14 วัน</option><option value="30">30 วัน</option><option value="45">45 วัน</option><option value="60">60 วัน</option><option value="90">90 วัน</option></select></div>
        <div class="field s2"><label for="lDue">ต้องจ่ายครบภายใน</label><input id="lDue" type="date" value="${esc(l.due_date || addDays(today(), 30))}"></div>
        <div class="field s6"><label for="lNote">หมายเหตุ / เงื่อนไข</label><textarea id="lNote" placeholder="เช่น ถ้าไม่ครบตามกำหนด ขอยึดมัดจำ">${esc(l.note || "")}</textarea></div>
      </div>
      <datalist id="dlPay"><option value="โอน"><option value="เงินสด"><option value="TrueMoney"><option value="PromptPay"></datalist>
    </div>
    <div class="modal-f"><span class="hint" id="lMsg" style="align-self:center"></span><div style="display:flex;gap:8px"><button class="btn" type="button" id="lCancel">ยกเลิก</button><button class="btn orange" type="submit" id="lSave">${existing ? "บันทึก" : "เปิดผ่อน"}</button></div></div>
    </form>`);
  $("#lx", m).onclick = closeModal; $("#lCancel", m).onclick = closeModal;
  if (!existing) $("#lDays", m).value = "30";
  $("#lDays", m).onchange = () => { const d = +$("#lDays", m).value; if (d) $("#lDue", m).value = addDays($("#lStart", m).value || today(), d); };
  $("#lStart", m).onchange = () => $("#lDays", m).onchange();
  $("#lDue", m).oninput = () => { $("#lDays", m).value = ""; };
  $("#layF", m).onsubmit = async e => {
    e.preventDefault();
    const msg = t => { $("#lMsg", m).textContent = t; };
    const name = $("#lName", m).value.trim(), total = n($("#lTotal", m).value);
    if (!name) return msg("ใส่ชื่อลูกค้า");
    if (!(total > 0)) return msg("ใส่ราคาเต็ม");
    const dep = existing ? 0 : n($("#lDep", m).value);
    if (!existing && dep > total) return msg("มัดจำมากกว่าราคาเต็ม");
    const data = { customer_name: name, customer_contact: $("#lContact", m).value.trim() || null, total_price: total,
      start_date: $("#lStart", m).value || today(), due_date: $("#lDue", m).value || null, note: $("#lNote", m).value.trim() || null };
    const btn = $("#lSave", m); btn.disabled = true; msg("กำลังบันทึก…");
    try {
      let id = existing && existing.id;
      if (existing) { const { error } = await sb.from("layaways").update(data).eq("id", id); if (error) throw error; }
      else {
        const { data: row, error } = await sb.from("layaways").insert({ ...data, shirt_id: s.id }).select().single(); if (error) throw error;
        id = row.id;
        if (dep > 0) { const { error: e2 } = await sb.from("layaway_payments").insert({ layaway_id: id, kind: "deposit", amount: dep, paid_at: data.start_date, method: $("#lDepM", m).value.trim() || null }); if (e2) throw e2; }
      }
      await loadLayaways(false);
      await completeIfPaid(id);
      closeModal(); toast(existing ? "บันทึกแล้ว" : "เปิดผ่อนแล้ว");
      await render(); openLayDetail(id);
    } catch (err) { btn.disabled = false; msg(/one_active|duplicate/i.test(err.message || "") ? "เสื้อตัวนี้มีรายการผ่อนเปิดอยู่แล้ว" : dbErr(err)); }
  };
  setTimeout(() => $("#lName", m).focus(), 30);
}

// ผ่อนครบ → ปิดรายการ + เสื้อย้ายไป "ขายแล้ว" อัตโนมัติ
async function completeIfPaid(id) {
  const l = state.layaways.find(x => x.id === id);
  if (!l || l.status !== "active" || remainOf(l) > 0) return false;
  const last = (l.payments[l.payments.length - 1] || {}).paid_at || today();
  const { error } = await sb.from("layaways").update({ status: "completed", completed_at: last }).eq("id", id); if (error) throw error;
  await saveShirt(l.shirt_id, { sold: true, sold_price: n(l.total_price), sold_date: last, channel: "ผ่อน" });
  await loadLayaways(false);
  toast("ผ่อนครบแล้ว! ย้ายเสื้อไป “ขายแล้ว” ให้เรียบร้อย");
  return true;
}

function laySummaryText(l) {
  const s = shirtOf(l.shirt_id) || {};
  const lines = [`สรุปยอดผ่อน · STORYTELLER.VTG`, `${s.code || ""} ${s.name || ""}`.trim(), `ราคาเต็ม ${baht(n(l.total_price))}`, ``];
  l.payments.forEach((p, i) => lines.push(`${i + 1}. ${fmtDate(p.paid_at)} ${p.kind === "deposit" ? "มัดจำ" : "ชำระ"} ${baht(n(p.amount))}`));
  lines.push(``, `จ่ายแล้ว ${baht(paidOf(l))}`, `คงเหลือ ${baht(remainOf(l))}`);
  if (l.due_date && l.status === "active") lines.push(`กรุณาชำระให้ครบภายใน ${fmtDate(l.due_date)}`);
  return lines.join("\n");
}

async function openLayDetail(id) {
  const l = state.layaways.find(x => x.id === id); if (!l) return;
  const s = shirtOf(l.shirt_id) || {};
  const ph = (s.photos || [])[0]; if (ph) await ensureUrls([ph]);
  const paid = paidOf(l), remain = remainOf(l), pc = Math.min(100, paid / Math.max(1, n(l.total_price)) * 100);
  const active = l.status === "active";
  const m = openModal(`
    <div class="modal-h"><h2>ผ่อน · ${esc(l.customer_name)}</h2><button class="x" type="button" aria-label="ปิด" id="yx">×</button></div>
    <div class="modal-b">
      <div class="lay-head">
        <button type="button" class="lr-ph big" id="toShirt" title="ดูเสื้อ">${ph && photoUrl(ph) ? `<img src="${esc(photoUrl(ph))}" alt="">` : SHIRT_SVG}</button>
        <div class="lay-meta">
          <span class="st ${l.status} ${isOverdue(l) ? "late" : ""}">${isOverdue(l) ? "เกินกำหนด" : STATUS_TH[l.status]}</span>
          <h2 class="name">${esc(s.code || "")} ${esc(s.name || "(ลบเสื้อแล้ว)")}</h2>
          <p class="muted">${l.customer_contact ? esc(l.customer_contact) + " · " : ""}เริ่ม ${fmtDate(l.start_date)} · ${dueText(l)}</p>
        </div>
      </div>
      <div class="lay-sum">
        <div><span class="l">ราคาเต็ม</span><span class="v num">${baht(n(l.total_price))}</span></div>
        <div><span class="l">จ่ายแล้ว</span><span class="v num gain">${baht(paid)}</span></div>
        <div><span class="l">คงเหลือ</span><span class="v num ${remain > 0 ? "loss" : "gain"}">${baht(remain)}</span></div>
      </div>
      <span class="bar big"><i style="width:${pc.toFixed(1)}%"></i></span>
      ${l.note ? `<p class="lay-note">${esc(l.note)}</p>` : ""}

      ${active ? `<form class="paybox" id="payF">
        <div class="field"><label for="pAmt">รับเงินงวดนี้ (฿)</label><input id="pAmt" type="number" min="1" inputmode="decimal" required placeholder="${remain}"></div>
        <div class="field"><label for="pDate">วันที่รับ</label><input id="pDate" type="date" value="${today()}"></div>
        <div class="field"><label for="pMethod">ช่องทาง</label><input id="pMethod" list="dlPay2" placeholder="โอน / เงินสด"></div>
        <button class="btn orange" type="submit">+ บันทึกยอด</button>
        <button class="linkbtn" type="button" id="payAll">รับยอดที่เหลือทั้งหมด ${baht(remain)}</button>
      </form><datalist id="dlPay2"><option value="โอน"><option value="เงินสด"><option value="TrueMoney"><option value="PromptPay"></datalist>` : ""}

      <h3 class="sub-h">ประวัติการจ่าย</h3>
      ${l.payments.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>วันที่</th><th>ประเภท</th><th>ช่องทาง</th><th class="r">ยอด</th>${active ? "<th></th>" : ""}</tr></thead><tbody>
        ${l.payments.map((p, i) => `<tr><td class="num">${i + 1}</td><td>${fmtDate(p.paid_at)}</td><td>${p.kind === "deposit" ? "มัดจำ" : "ชำระ"}</td><td>${esc(p.method || "—")}</td><td class="r num">${baht(n(p.amount))}</td>${active ? `<td class="r"><button class="linkbtn danger-link" type="button" data-delpay="${esc(p.id)}">ลบ</button></td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">ยังไม่มีการจ่าย</p>`}
      <div id="layZone"></div>
    </div>
    <div class="modal-f">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="button" id="copySum">คัดลอกสรุปยอดส่งลูกค้า</button>
        ${active ? `<button class="btn" type="button" id="editLay">แก้ไข</button>` : ""}
      </div>
      ${active ? `<button class="btn danger" type="button" id="cancelLay">ยกเลิกการผ่อน</button>` : ""}
    </div>`);
  $("#yx", m).onclick = closeModal;
  $("#toShirt", m).onclick = () => { if (s.id) { closeModal(); openDetail(s.id); } };
  $("#copySum", m).onclick = async () => { try { await navigator.clipboard.writeText(laySummaryText(l)); toast("คัดลอกสรุปยอดแล้ว"); } catch (e) { toast("คัดลอกไม่สำเร็จ"); } };
  if (!active) return;
  $("#editLay", m).onclick = () => { closeModal(); openLayForm(s, l); };
  $("#payAll", m).onclick = () => { $("#pAmt", m).value = remain; $("#pAmt", m).focus(); };
  $("#payF", m).onsubmit = async e => {
    e.preventDefault();
    const amt = n($("#pAmt", m).value);
    if (!(amt > 0)) { toast("ใส่ยอดเงินที่รับ"); return; }
    if (amt > remain) { toast(`ยอดเกินที่ค้างอยู่ (${baht(remain)})`); return; }
    const btn = e.submitter || $("#payF button[type=submit]", m); btn.disabled = true;
    try {
      const { error } = await sb.from("layaway_payments").insert({ layaway_id: l.id, kind: "payment", amount: amt, paid_at: $("#pDate", m).value || today(), method: $("#pMethod", m).value.trim() || null });
      if (error) throw error;
      await loadLayaways(false);
      const done = await completeIfPaid(l.id);
      if (!done) toast("บันทึกยอดแล้ว");
      closeModal(); await render(); openLayDetail(l.id);
    } catch (err) { btn.disabled = false; toast(dbErr(err)); }
  };
  m.querySelectorAll("[data-delpay]").forEach(b => b.onclick = () => {
    $("#layZone", m).innerHTML = `<div class="confirm"><span>ลบยอดจ่ายรายการนี้?</span><button class="btn small danger" type="button" id="dpY">ลบ</button><button class="btn small" type="button" id="dpN">ไม่ลบ</button></div>`;
    $("#dpN", m).onclick = () => { $("#layZone", m).innerHTML = ""; };
    $("#dpY", m).onclick = async () => {
      const { error } = await sb.from("layaway_payments").delete().eq("id", b.dataset.delpay);
      if (error) return toast(dbErr(error));
      await loadLayaways(false); closeModal(); await render(); openLayDetail(l.id);
    };
  });
  $("#cancelLay", m).onclick = () => {
    $("#layZone", m).innerHTML = `<div class="confirm"><span>ยกเลิกการผ่อนของ ${esc(l.customer_name)}? เสื้อจะกลับเข้าสต็อก (ประวัติการจ่าย ${baht(paid)} ยังเก็บไว้)</span><button class="btn small danger" type="button" id="clY">ยกเลิกการผ่อน</button><button class="btn small" type="button" id="clN">ไม่ใช่</button></div>`;
    $("#clN", m).onclick = () => { $("#layZone", m).innerHTML = ""; };
    $("#clY", m).onclick = async () => {
      const { error } = await sb.from("layaways").update({ status: "cancelled", completed_at: today() }).eq("id", l.id);
      if (error) return toast(dbErr(error));
      await loadLayaways(false); closeModal(); await render(); toast("ยกเลิกการผ่อนแล้ว เสื้อกลับเข้าสต็อก");
    };
  };
}

// ---------- add / edit ----------
const FITS = ["Boxy", "Regular", "Oversize", "Slim", "Cropped", "Loose"];
const STYLES = ["Single stitch", "Double stitch", "Band tee", "Movie tee", "Harley", "3D Emblem", "Sport", "Souvenir", "Cartoon"];
const CHANNELS = ["IG", "Facebook", "TikTok", "Shopee", "Lazada", "หน้าร้าน", "ตลาดนัด"];
function datalists() {
  const uniq = (key, base) => [...new Set([...base, ...state.shirts.map(s => s[key]).filter(Boolean)])];
  const dl = (id, arr) => `<datalist id="${id}">${arr.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`;
  return dl("dlFit", uniq("fit", FITS)) + dl("dlStyle", uniq("style", STYLES)) + dl("dlTag", uniq("tag", [])) + dl("dlCh", uniq("channel", CHANNELS));
}
async function openForm(existing) {
  const s = existing ? { ...existing } : { code: nextCode(), buy_date: today(), labels: [], photos: [], sold: false };
  const photos = [...(s.photos || [])], labels = [...(s.labels || [])];
  const removed = [], uploadedNow = [];
  let saved = false, pending = 0;
  await ensureUrls(photos);
  const v = k => esc(s[k] ?? "");
  const m = openModal(`
    <form id="shirtF" novalidate>
    <div class="modal-h"><h2>${existing ? "แก้ไขเสื้อ" : "เพิ่มเสื้อเข้าตู้"}</h2><button class="x" type="button" aria-label="ปิด" id="fx">×</button></div>
    <div class="modal-b">
      <div class="form">
        <div class="field s6"><label>รูปเสื้อ (รูปแรกเป็นปก · ลากวางหรือกดเลือกได้หลายรูป)</label>
          <div class="photos" id="phs"></div>
          <input type="file" id="fileIn" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden>
        </div>
        <div class="group">The piece</div>
        <div class="field s2 half"><label for="fCode">รหัส</label><input id="fCode" value="${v("code")}"></div>
        <div class="field s4"><label for="fName">ชื่อ / รุ่น</label><input id="fName" required placeholder="เช่น เสื้อวง Nirvana 1993" value="${v("name")}"></div>
        <div class="field s6"><label for="lblIn">ป้ายกำกับ (แท็กรายตัว)</label>
          <div class="lbl-input" id="lblBox"><input id="lblIn" placeholder="พิมพ์แล้วกด Enter เช่น เสื้อวง, 90s, ล็อตตลาดนัด"></div>
          <div class="suggest" id="lblSug"></div>
        </div>
        <div class="group">Details</div>
        <div class="field half"><label for="fChest">Size · อก</label><div class="unit"><input id="fChest" inputmode="decimal" value="${v("chest")}"><span>”</span></div></div>
        <div class="field half"><label for="fLen">Size · ยาว</label><div class="unit"><input id="fLen" inputmode="decimal" value="${v("length")}"><span>”</span></div></div>
        <div class="field s2"><label for="fFit">Fit</label><input id="fFit" list="dlFit" value="${v("fit")}"></div>
        <div class="field s2"><label for="fTag">Tag</label><input id="fTag" list="dlTag" placeholder="เช่น Screen Stars, Hanes" value="${v("tag")}"></div>
        <div class="field s2"><label for="fStyle">Style</label><input id="fStyle" list="dlStyle" value="${v("style")}"></div>
        <div class="field s2"><label for="fCond">CONDITION (/10)</label><input id="fCond" type="number" min="0" max="10" step="0.5" inputmode="decimal" value="${v("condition")}"></div>
        <div class="field s4"><label for="fDef">ตำหนิ</label><input id="fDef" placeholder="เช่น รูเล็กที่ชายเสื้อ, ด่างจางๆ" value="${v("defects")}"></div>
        <div class="group">Money</div>
        <div class="field s2"><label for="fCost">ทุนที่ซื้อ (฿)</label><input id="fCost" type="number" min="0" inputmode="decimal" value="${v("cost")}"></div>
        <div class="field s2"><label for="fExtra">ค่าซัก/ส่ง/อื่นๆ (฿)</label><input id="fExtra" type="number" min="0" inputmode="decimal" value="${v("extra_cost")}"></div>
        <div class="field s2"><label for="fBuy">วันที่ซื้อ</label><input id="fBuy" type="date" value="${v("buy_date")}"></div>
        <div class="field s2"><label for="fAsk">ราคาตั้งขาย (฿)</label><input id="fAsk" type="number" min="0" inputmode="decimal" value="${v("ask_price")}"></div>
        <div class="field s4"><label class="check" for="fSold"><input type="checkbox" id="fSold" ${s.sold ? "checked" : ""}> ขายแล้ว</label></div>
        <div class="field s2 soldF"><label for="fSP">ขายได้ (฿)</label><input id="fSP" type="number" min="0" inputmode="decimal" value="${v("sold_price")}"></div>
        <div class="field s2 soldF"><label for="fSD">วันที่ขาย</label><input id="fSD" type="date" value="${esc(s.sold_date || today())}"></div>
        <div class="field s2 soldF"><label for="fCh">ช่องทางขาย</label><input id="fCh" list="dlCh" value="${v("channel")}"></div>
        <div class="field s6"><label for="fNote">หมายเหตุ</label><textarea id="fNote">${v("note")}</textarea></div>
      </div>
      ${datalists()}
    </div>
    <div class="modal-f"><span class="hint" id="fMsg" style="align-self:center"></span><div style="display:flex;gap:8px"><button class="btn" type="button" id="fCancel">ยกเลิก</button><button class="btn primary" type="submit" id="fSave">บันทึก</button></div></div>
    </form>`);

  onClose = () => { if (!saved && uploadedNow.length) sb.storage.from(BUCKET).remove(uploadedNow); };

  const phs = $("#phs", m), fileIn = $("#fileIn", m);
  function drawPhotos() {
    phs.innerHTML = photos.map((p, i) => `<div class="p"><img src="${esc(photoUrl(p))}" alt="รูปที่ ${i + 1}">${i === 0 ? '<span class="first">ปก</span>' : ""}<button type="button" data-i="${i}" aria-label="ลบรูปที่ ${i + 1}">✕</button></div>`).join("")
      + Array.from({ length: pending }, () => `<div class="p loading">กำลังอัป…</div>`).join("")
      + `<button type="button" class="add" id="addPh">+ เพิ่มรูป</button>`;
    phs.querySelectorAll(".p button").forEach(b => b.onclick = () => {
      const p = photos.splice(+b.dataset.i, 1)[0];
      const j = uploadedNow.indexOf(p);
      if (j >= 0) { uploadedNow.splice(j, 1); sb.storage.from(BUCKET).remove([p]); } else removed.push(p);
      drawPhotos();
    });
    const add = $("#addPh", m);
    add.onclick = () => fileIn.click();
    add.ondragover = e => { e.preventDefault(); add.classList.add("drag"); };
    add.ondragleave = () => add.classList.remove("drag");
    add.ondrop = e => { e.preventDefault(); add.classList.remove("drag"); handleFiles(e.dataTransfer.files); };
  }
  async function handleFiles(files) {
    for (const f of [...files].filter(f => f.type.startsWith("image/"))) {
      pending++; drawPhotos();
      try { const path = await uploadPhoto(f); photos.push(path); uploadedNow.push(path); }
      catch (err) { toast(/mime|type/i.test(err.message || "") ? "ไฟล์นี้ไม่รองรับ ใช้ JPG / PNG / WEBP" : /size|large/i.test(err.message || "") ? "รูปใหญ่เกิน 10MB" : "อัปโหลดรูปไม่สำเร็จ"); }
      pending--; drawPhotos();
    }
  }
  fileIn.onchange = () => { handleFiles(fileIn.files); fileIn.value = ""; };
  drawPhotos();

  const lblIn = $("#lblIn", m), lblBox = $("#lblBox", m), lblSug = $("#lblSug", m);
  function drawLabels() {
    lblBox.querySelectorAll(".chip").forEach(c => c.remove());
    labels.forEach((l, i) => { const c = document.createElement("span"); c.className = "chip"; c.innerHTML = `#${esc(l)}<button type="button" aria-label="เอาป้าย ${esc(l)} ออก">✕</button>`; c.querySelector("button").onclick = () => { labels.splice(i, 1); drawLabels(); }; lblBox.insertBefore(c, lblIn); });
    const sug = allLabels().map(x => x[0]).filter(l => !labels.includes(l)).slice(0, 12);
    lblSug.innerHTML = sug.map(l => `<button type="button" class="chip" data-l="${esc(l)}">+ ${esc(l)}</button>`).join("");
    lblSug.querySelectorAll("button").forEach(b => b.onclick = () => { labels.push(b.dataset.l); drawLabels(); });
  }
  function addLabel() { const val = lblIn.value.replace(/^#/, "").trim(); if (val && !labels.includes(val)) labels.push(val); lblIn.value = ""; drawLabels(); }
  lblIn.onkeydown = e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLabel(); } else if (e.key === "Backspace" && !lblIn.value && labels.length) { labels.pop(); drawLabels(); } };
  lblIn.onblur = () => { if (lblIn.value.trim()) addLabel(); };
  drawLabels();

  const soldCk = $("#fSold", m);
  const syncSold = () => m.querySelectorAll(".soldF").forEach(el => el.hidden = !soldCk.checked);
  soldCk.onchange = syncSold; syncSold();

  $("#fx", m).onclick = closeModal; $("#fCancel", m).onclick = closeModal;
  $("#shirtF", m).onsubmit = async e => {
    e.preventDefault();
    if (lblIn.value.trim()) addLabel();
    const name = $("#fName", m).value.trim();
    if (!name) { $("#fMsg", m).textContent = "ใส่ชื่อเสื้อก่อนบันทึก"; $("#fName", m).focus(); return; }
    if (pending) { $("#fMsg", m).textContent = "รอรูปอัปโหลดให้เสร็จก่อน"; return; }
    const val = id => $(id, m).value.trim();
    const numOrNull = id => { const x = val(id); return x === "" ? null : n(x); };
    const data = {
      code: val("#fCode") || null, name, labels, photos,
      chest: val("#fChest") || null, length: val("#fLen") || null, fit: val("#fFit") || null, tag: val("#fTag") || null, style: val("#fStyle") || null,
      condition: numOrNull("#fCond"), defects: val("#fDef") || null,
      cost: n(val("#fCost")), extra_cost: n(val("#fExtra")), buy_date: val("#fBuy") || null, ask_price: numOrNull("#fAsk"),
      sold: soldCk.checked, note: $("#fNote", m).value.trim() || null,
      sold_price: null, sold_date: null, channel: null
    };
    if (data.sold) { data.sold_price = n(val("#fSP")); data.sold_date = val("#fSD") || today(); data.channel = val("#fCh") || null; }
    const btn = $("#fSave", m); btn.disabled = true; $("#fMsg", m).textContent = "กำลังบันทึก…";
    try {
      await saveShirt(existing ? existing.id : null, data);
      saved = true;
      if (removed.length) sb.storage.from(BUCKET).remove(removed);
      closeModal(); toast(existing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มเสื้อเข้าตู้แล้ว");
    } catch (err) { btn.disabled = false; $("#fMsg", m).textContent = dbErr(err); }
  };
  setTimeout(() => $("#fName", m).focus(), 30);
}

// =========================================================
//  EVENTS + BOOT
// =========================================================
$("#tabs").onclick = e => { const b = e.target.closest("button[data-v]"); if (!b) return; state.view = b.dataset.v; try { localStorage.setItem("stvtg_view", state.view); } catch (err) {} render(); };
$("#labelBar").onclick = e => { const b = e.target.closest("button[data-l]"); if (!b) return; state.label = b.dataset.l || null; render(); };
let qT; $("#q").oninput = e => { clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value; render(); }, 150); };
$("#sort").onchange = e => { state.sort = e.target.value; render(); };
$("#addBtn").onclick = () => openForm(null);
$(".brand").onclick = e => { e.preventDefault(); state.view = "dash"; render(); };

(async function boot() {
  if (!sb) {
    showAuth("login", configured ? "โหลดไลบรารี Supabase ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรช" : "ยังไม่ได้ตั้งค่า js/config.js (ใส่ SUPABASE_URL และ SUPABASE_ANON_KEY)", "err");
    $("#loginBtn").disabled = true; return;
  }
  let recovering = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || (recovering && session)) { recovering = true; showAuth("newpass"); return; }
    if (event === "SIGNED_OUT") { leaveApp(); return; }
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && !state.user) setTimeout(() => enterApp(session), 0);
    if (event === "INITIAL_SESSION" && !session) showAuth("login");
  });
})();
})();
