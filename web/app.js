"use strict";
const S = { token: localStorage.getItem("ka_token") || "", me: null, chat: [] };
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fd = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");
const can = (p) => S.me && S.me.permissions.includes(p);

// ------------------------------------------------------------ holatlar
const ST = {
  loading: `<div class="state">Yuklanmoqda…</div>`,
  empty: (t = "Ma'lumot topilmadi") => `<div class="state">${esc(t)}</div>`,
  error: (t = "Xatolik yuz berdi") => `<div class="state err">${esc(t)}</div>`,
  denied: `<div class="state err">Ruxsat mavjud emas</div>`,
};

async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/api/login") { logout(); throw new Error("401"); }
  if (!r.ok) { const e = new Error(j.error || "Xatolik yuz berdi"); e.status = r.status; toast(e.message, true); throw e; }
  return j;
}
async function openFile(url) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + S.token } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || "Fayl ochilmadi", true); return; }
  const blob = await r.blob();
  const u = URL.createObjectURL(blob);
  if (blob.type === "application/pdf") window.open(u, "_blank");
  else { const a = document.createElement("a"); a.href = u; a.download = decodeURIComponent((r.headers.get("Content-Disposition") || "").split("''")[1] || "fayl"); a.click(); }
}
function toast(t, bad) { const d = document.createElement("div"); d.className = "toast"; if (bad) d.style.background = "#b42318"; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 3500); }
const ok = (t = "Muvaffaqiyatli bajarildi") => toast(t);
function modal(html) { $("#modalBody").innerHTML = html; $("#modal").classList.remove("hidden"); }
$("#modalX").onclick = () => $("#modal").classList.add("hidden");
$("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); };

const pctBar = (p) => `<div class="bar"><i class="${p < 35 ? "lo" : p < 50 ? "mid" : ""}" style="width:${Math.min(100, p)}%"></i></div>`;
const lvl = (l) => `<span class="pill b-${l}">${{ red: "Qizil", yellow: "Sariq", green: "Yashil" }[l] || l}</span>`;
const stBadge = (s) => `<span class="pill ${{ tasdiqlangan: "b-green", kutilmoqda: "b-yellow", "rad etilgan": "b-red", bajarildi: "b-green", qisman: "b-yellow", jarayonda: "b-blue", yangi: "b-yellow", draft: "b-yellow", approved: "b-green" }[s] || ""}">${esc({ draft: "loyiha", approved: "tasdiqlangan" }[s] || s)}</span>`;
const lineage = (arr) => `<div class="lineage">${arr.map((x, i) => (i ? `<span class="ar">↓</span>` : "") + `<span>${esc(x)}</span>`).join("")}</div>`;
const docChip = (id, title) => `<button class="chip" data-doc="${esc(id)}">📄 ${esc(id)}${title ? " · " + esc(title) : ""}</button>`;
function bindDocs(root) {
  root.querySelectorAll("[data-doc]").forEach((b) => b.onclick = () => openDoc(b.dataset.doc));
  root.querySelectorAll("[data-ev]").forEach((b) => b.onclick = () => openFile(`/api/evidence/${b.dataset.ev}/file`));
}

// ------------------------------------------------------------ menyu
const PAGES = [
  ["grp", "Asosiy 12 modul"],
  ["brief", "1", "Bugungi kafedra"],
  ["kotib", "2", "Sun'iy intellekt kotibi"],
  ["chat", "3", "Savol-javob va bilimlar bazasi"],
  ["memory", "4", "Kafedra raqamli xotirasi"],
  ["t360", "5", "O'qituvchi 360"],
  ["kpi", "6", "Faoliyat ko'rsatkichlari"],
  ["vault", "7", "Dalillar ombori"],
  ["traces", "8", "Javob izlari"],
  ["warn", "9", "Erta ogohlantirish"],
  ["tasks", "10", "Harakat markazi"],
  ["audit", "11", "Ruxsatlar va tarix"],
  ["eval", "12", "Baholash markazi"],
  ["grp", "Qo'shimcha"],
  ["reports", "◎", "Hisobot va solishtirish"],
  ["health", "◎", "Ma'lumot sifati"],
];
const IC = {
  brief: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kotib: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  memory: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  t360: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  kpi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V6M12 18v-2.5"/>',
  traces: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="18" r="2"/><path d="M7 6h5a3 3 0 0 1 3 3v1M7 18h5a3 3 0 0 0 3-3v-1"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  tasks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9l2 2 3.5-4M8 16h8"/>',
  audit: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  eval: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  reports: '<path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"/>',
  health: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
};
function nav() {
  $("#nav").innerHTML = PAGES.map((p) => p[0] === "grp" ? `<div class="grp">${p[1]}</div>` :
    `<a href="#${p[0]}" data-p="${p[0]}"><span class="num">${IC[p[0]] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[p[0]]}</svg>` : p[1]}</span>${p[2]}</a>`).join("");
}
const navClose = () => $("#app").classList.remove("nav-open");
$("#menuBtn").onclick = () => $("#app").classList.toggle("nav-open");
$("#scrim").onclick = navClose;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") navClose(); });
window.addEventListener("hashchange", () => { navClose(); render(); });
async function render() {
  $("#modal").classList.add("hidden");
  const page = location.hash.slice(1) || "brief";
  const [p, arg] = page.split("/");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.p === p));
  const v = $("#view");
  v.innerHTML = ST.loading;
  try { await (VIEWS[p] || VIEWS.brief)(v, arg); bindDocs(v); }
  catch (e) { if (e.message !== "401") v.innerHTML = e.status === 403 ? ST.denied : ST.error(e.message); }
}

const VIEWS = {};

// ------------------------------------------------------------ 1. Bugungi kafedra
VIEWS.brief = async (v) => {
  const b = await api("/api/brief");
  const t = b.top_issue;
  const tile = (icon, n, l, href) => `<a class="card stat" href="${href}" style="text-decoration:none;color:inherit"><div class="v">${icon} ${n}</div><div class="l">${l}</div></a>`;
  v.innerHTML = `
  <div class="row sp"><div><h1>Bugungi kafedra</h1><p class="muted">${esc(b.date)} · kafedraning joriy holati</p></div>
  <a class="btn ghost" href="#chat">Sun'iy intellektdan so'rash →</a></div>
  <div class="grid g4">
    ${tile("🔴", b.critical, "Muhim masalalar", "#warn")}${tile("🟠", b.deadlines, "Yaqin muddatlar (14 kun)", "#tasks")}
    ${tile("🟡", b.to_approve, "Tasdiqlanishi kerak", "#vault")}${tile("👨‍🏫", b.attention_staff, "E'tibor talab qiluvchi xodimlar", "#warn")}
    ${tile("📊", b.low_kpi, "Past ko'rsatkichlar (35% dan past)", "#kpi")}${tile("📄", b.review_docs, "Ko'rib chiqilishi kerak bo'lgan hujjatlar", "#health")}
    ${tile("📌", b.open_tasks, "Bajarilmagan vazifalar", "#tasks")}${tile("⚖️", b.mismatches, "Hisobot va dalil farqlari", "#reports")}
  </div>
  ${b.alerts.length ? `<div class="warn">${b.alerts.map((a) => `⏰ ${esc(a.alert)} — <b>${esc(a.title)}</b> (${esc(a.responsible)})`).join("<br>")}</div>` : ""}
  ${t ? `<div class="card risk ${t.level}" style="margin-top:16px">
    <div class="row sp"><h2>Eng muhim masala: ${esc(t.title)}</h2>${lvl(t.level)}</div>
    <p class="muted small">${esc(t.note)}</p>
    <div class="row"><button class="btn" id="why">Nega?</button><button class="btn" id="what">Nima qilish kerak?</button>
    ${can("create_task") ? `<button class="btn primary" id="plan">Vazifaga aylantirish</button>` : ""}</div>
    <div id="topx"></div></div>` : ""}
  ${b.secretary.length ? `<div class="card" style="margin-top:16px"><div class="row sp"><h2>Bugun nima qilish tavsiya etiladi?</h2><a href="#kotib">To'liq ro'yxat →</a></div>
    ${b.secretary.map((s) => `<div class="row" style="margin:6px 0"><span class="prio ${s.level === "yuqori" ? "y" : ""}">${s.n}</span><div><b>${esc(s.text)}</b><div class="small muted">${esc(s.why)}</div></div></div>`).join("")}</div>` : ""}
  <div class="card" style="margin-top:16px"><div class="row sp"><h2>Kafedra holati xaritasi</h2><span class="muted small">yo'nalishni bosing — nega shu rangda?</span></div>
    <div class="hm">${b.health_map.map((h, i) => `<div class="t b-${h.status}" data-i="${i}"><span class="dot ${h.status}"></span><b>${esc(h.name)}</b></div>`).join("")}</div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Ma'lumot sog'lomligi: ${b.data_health.score}%</h2>${dhBlock(b.data_health)}</div>
    <div class="card"><h2>Yaqinlashayotgan muddatlar</h2>${b.deadline_list.length ? `<table>${b.deadline_list.map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.responsible)}</td><td>${fd(d.deadline)}</td><td>${d.progress}%</td></tr>`).join("")}</table>` : ST.empty()}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Asosiy tamoyil</h3>
  <p class="muted">KafedraAgent rahbar o'rniga qaror qabul qilmaydi. U rahbarga to'g'ri qarorni tezroq, aniqroq va dalilga tayangan holda qabul qilish imkonini beradi.</p></div>`;
  v.querySelectorAll(".hm .t").forEach((el) => el.onclick = () => {
    const h = b.health_map[el.dataset.i];
    modal(`<h2><span class="dot ${h.status}"></span>${esc(h.name)} — nega?</h2><ul class="why">${h.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p class="small"><b>Rang qoidasi:</b> ${esc(h.rule)}</p><p class="muted small">Manba: ${esc(h.source)}</p>`);
  });
  if (t) {
    $("#why").onclick = () => $("#topx").innerHTML = whyHtml(t);
    $("#what").onclick = () => $("#topx").innerHTML = recList(t.recommendations);
    if ($("#plan")) $("#plan").onclick = () => makePlan(t.id);
  }
};
function whyHtml(r) {
  return `<h3 style="margin-top:12px">Nega?</h3><p class="small">${esc(r.note)}</p><ul class="why">${r.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
  <p class="small muted">Dalillar: ${r.evidence.map(esc).join(", ")}</p><div class="row">${(r.docs || []).map((d) => docChip(d)).join("")}</div>`;
}
function dhBlock(h) {
  const row = (k, suf = "%") => `<tr><td>${esc(h[k].label)}</td><td><b>${h[k].value}${suf}</b></td><td class="small muted">${esc(h[k].formula)}</td></tr>`;
  return `<table>${row("completeness")}${row("evidence_coverage")}${row("freshness")}${row("conflicts", "")}${row("duplicates", "")}</table><p class="small muted">Umumiy ball = ${esc(h.score_formula)}</p>`;
}
function recList(recs) {
  return `<h3 style="margin-top:12px">Nima qilish kerak? <span class="muted small">(tavsiya — qarorni rahbar qabul qiladi)</span></h3>
  <table><tr><th>Harakat</th><th>Ustuvorlik</th><th>Mas'ul</th><th>Muddat</th><th>Nazorat</th></tr>${recs.map((r) => `<tr><td>${esc(r.text)}</td><td>${esc(r.priority || "o'rta")}</td><td>${esc(r.responsible)}</td><td>${fd(r.deadline)}</td><td>${fd(r.control)}</td></tr>`).join("")}</table>`;
}
async function makePlan(riskId) {
  const made = await api("/api/warnings/plan", { risk_id: riskId });
  ok(`${made.length} ta vazifa Harakat markaziga qo'shildi`);
  location.hash = "#tasks";
}

// ------------------------------------------------------------ 2. Kotib
VIEWS.kotib = async (v) => {
  if (!can("view_all")) { v.innerHTML = ST.denied; return; }
  const s = await api("/api/secretary");
  const m = s.meeting;
  v.innerHTML = `<h1>Sun'iy intellekt kotibi</h1><p class="muted">Kunlik ustuvor ishlar. Modul tavsiya beradi, lekin qarorni siz qabul qilasiz.</p>
  <div class="card"><div class="row sp"><h2>Bugun nima qilishim kerak?</h2><button class="btn ghost" id="askk">AI Chatda so'rash</button></div>
  ${s.items.length ? `<table><tr><th>#</th><th>Ish</th><th>Sabab</th><th>Ustuvorlik</th><th>Manba</th></tr>${s.items.map((x) => `<tr><td><span class="prio ${x.level === "yuqori" ? "y" : ""}">${x.n}</span></td><td><a href="${x.link}">${esc(x.text)}</a></td><td class="small">${esc(x.why)}</td><td>${esc(x.level)}</td><td class="small">${esc(x.source)}</td></tr>`).join("")}</table>` : ST.empty("Bugun uchun ustuvor ish yo'q")}</div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><h2>Yig'ilishga tayyorgarlik: kun tartibi</h2><ol>${m.agenda.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>
   <h3>Avvalgi yig'ilish qarorlari ${m.last ? docChip(m.last.id, fd(m.last.date)) : ""}</h3><ul class="why">${m.decisions.map((d) => `<li class="small">${esc(d)}</li>`).join("")}</ul></div>
   <div class="card"><h2>Bajarilmagan topshiriqlar (${m.open_tasks.length})</h2><table>${m.open_tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.responsible)}</td><td>${fd(t.deadline)}</td><td>${t.progress}%</td></tr>`).join("")}</table>
   <h3 style="margin-top:12px">Muddat ogohlantirishlari</h3>${s.alerts.length ? s.alerts.map((a) => `<div class="warn">${esc(a.alert)} — ${esc(a.title)}</div>`).join("") : ST.empty("Yaqin 2 kunda muddati tugaydigan vazifa yo'q")}</div>
  </div>`;
  $("#askk").onclick = () => { location.hash = "#chat"; setTimeout(() => ask("Bugun nima qilishim kerak?"), 300); };
};

// ------------------------------------------------------------ 3. Savol-javob
const QUICK_MUDIR = ["Bugun nima qilishim kerak?", "Bugungi eng muhim muammo nima?", "Nega Aliyev bo'yicha xavf belgisi paydo bo'ldi?", "Nima qilish kerak?",
  "Aliyevga 20-oktabrgacha maqolalar bo'yicha hisobot tayyorlashni topshir.", "Aliyevning faoliyat ko'rsatkichi qancha?",
  "Aliyevning KPI qaysi hujjat bilan tasdiqlangan?", "Yillik hisobot dalillar bilan mos keladimi?", "Ushbu hisobotda qaysi ko'rsatkichlar uchun dalil yetishmayapti?",
  "Kafedrada nechta tasdiqlangan maqola bor?", "O'tgan yili ilmiy reja ortda qolish muammosi qanday hal qilingan?", "Keyingi yig'ilish uchun kun tartibi tayyorla",
  "Rahbariyat uchun haftalik hisobot tayyorla.", "Grant loyihalari hisobotida qanday risk ko'rsatilgan?", "Universitet oshxonasi menyusi qanday?"];
const QUICK_TEACHER = ["Mening faoliyat ko'rsatkichlarim qanday?", "Qaysi bandlarni hali bajarmadim?", "Ilmiy rejamdan qancha ortda qoldim?",
  "Bu oy nimalarni bajarishim kerak?", "Qaysi hujjatlarim tasdiqlanmagan?", "Karimovaning KPI bali qancha?"];
VIEWS.chat = async (v) => {
  const quick = S.me.role === "oqituvchi" ? QUICK_TEACHER : QUICK_MUDIR;
  v.innerHTML = `<div class="chat card"><div class="row sp"><h2>Savol-javob — kafedra bilimlar bazasidan so'rang</h2><span class="muted small">Har javobda: manba · hisoblash asosi · yangilanish sanasi · tekshiruvlar</span></div>
  <div class="quick">${quick.map((q) => `<button class="btn sm">${esc(q)}</button>`).join("")}</div>
  <div class="msgs" id="msgs"></div>
  <form class="ask" id="askf"><input id="q" placeholder="Savolingizni yozing…" autocomplete="off" maxlength="1000"><button class="btn primary">Yuborish</button></form></div>`;
  v.querySelectorAll(".quick button").forEach((b) => b.onclick = () => ask(b.textContent));
  $("#askf").onsubmit = (e) => { e.preventDefault(); const q = $("#q").value.trim(); if (q) ask(q); $("#q").value = ""; };
  drawChat();
};
async function ask(q) {
  S.chat.push({ me: true, text: q }, { wait: true }); drawChat();
  try { const r = await api("/api/ask", { question: q }); S.chat.pop(); S.chat.push(r); }
  catch (e) { S.chat.pop(); S.chat.push({ err: e.message }); }
  drawChat();
}
const STATUS = { ok: '<span class="pill b-green">Dalil bilan</span>', abstain: '<span class="pill b-yellow">Dalil yetarli emas</span>', denied: '<span class="pill b-red">Ruxsat mavjud emas</span>', action: '<span class="pill b-blue">Harakat bajarildi</span>' };
function drawChat() {
  const m = $("#msgs"); if (!m) return;
  m.innerHTML = S.chat.map((c, i) => c.me ? `<div class="msg me">${esc(c.text)}</div>` : c.wait ? `<div class="msg">${ST.loading}</div>` : c.err ? `<div class="msg">${ST.error(c.err)}</div>` : `
    <div class="msg"><div class="row sp"><span>${STATUS[c.status]} <span class="muted small">${esc(c.intent_label)} · ${c.ms} ms</span></span></div>
    <div style="margin-top:6px">${esc(c.answer).replace(/\[([ADHSY]\d+)\]/g, '<button class="chip" data-doc="$1">$1</button>')}</div>
    ${c.warnings && c.warnings.length ? `<div class="warn">⚠ Tekshirish talab qilinadi:<br>${c.warnings.map(esc).join("<br>")}</div>` : ""}
    ${c.sources.length ? `<div class="src"><span class="small muted">Manba:</span> ${c.sources.map((s) => s.kind === "document" ? `<button class="chip" data-doc="${esc(s.doc_id)}">📄 ${esc(s.doc_id)} · ${esc(s.title)}</button>` : s.kind === "file" ? `<button class="chip file" data-ev="${s.evidence_id}">📎 ${esc(s.title)}</button>` : `<span class="chip data">🗄 ${esc(s.title)}</span>`).join("")}</div>` : ""}
    <div class="meta-row">${c.calculation ? `<span><b>Hisoblash asosi:</b> ${esc(c.calculation)}</span>` : ""}${c.updated ? `<span><b>Oxirgi yangilanish:</b> ${esc(c.updated)}</span>` : ""}</div>
    <div class="checks">${(c.checks || []).map((k) => `<span class="${k.ok ? "" : "no"}">${k.ok ? "✓" : "!"} ${esc(k.label)}</span>`).join("")}</div>
    ${c.report ? `<p><a href="#reports">Hisobot loyihasini ochish →</a></p>` : ""}
    ${c.task ? `<p><a href="#tasks">Harakat markazida ko'rish →</a></p>` : ""}
    <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-tr="${i}">Bu javob qanday olindi?</button>
    ${c.recommendations && c.recommendations.length ? `<button class="btn sm" data-rec="${i}">Nima qilish kerak?</button>` : ""}</div>
    <div id="tr${i}"></div></div>`).join("");
  m.scrollTop = m.scrollHeight;
  bindDocs(m);
  m.querySelectorAll("[data-tr]").forEach((b) => b.onclick = () => {
    const box = $("#tr" + b.dataset.tr); box.innerHTML = box.innerHTML ? "" : traceHtml(S.chat[b.dataset.tr].trace);
  });
  m.querySelectorAll("[data-rec]").forEach((b) => b.onclick = () => {
    const c = S.chat[b.dataset.rec]; const box = $("#tr" + b.dataset.rec);
    box.innerHTML = recList(c.recommendations) + (can("create_task") ? `<button class="btn primary sm" id="mk${b.dataset.rec}" style="margin-top:8px">Vazifaga aylantirish</button>` : "");
    const mk = $("#mk" + b.dataset.rec);
    if (mk) mk.onclick = async () => {
      for (const r of c.recommendations) await api("/api/tasks", { title: r.text, assignee: r.assignee, responsible: r.responsible, deadline: r.deadline, control: r.control, priority: r.priority, source: "Savol-javob tavsiyasi", docs: c.sources.filter((s) => s.kind === "document").map((s) => s.doc_id) });
      ok(`${c.recommendations.length} ta vazifa yaratildi`); location.hash = "#tasks";
    };
  });
}
function traceHtml(tr) {
  return `<div class="trace"><b class="small">JAVOB IZI</b>${tr.map((s, i) => (i ? `<div class="arrow">↓</div>` : "") +
    `<div class="st"><b>${esc(s.step)}</b><div>${Array.isArray(s.detail) ? `<ul class="why">${s.detail.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : typeof s.detail === "object" ? esc(JSON.stringify(s.detail)) : esc(s.detail)}</div></div>`).join("")}</div>`;
}
async function openDoc(id) {
  let d;
  try { d = await api("/api/documents/" + id); } catch (e) { modal(e.status === 403 ? ST.denied : ST.error(e.message)); return; }
  modal(`<h2>[${esc(d.id)}] ${esc(d.title)}</h2><p class="muted small">Turi: ${esc(d.type)} · sana: ${fd(d.date)} · manba: ${esc(d.source || "—")} · kirish: ${d.access === "public" ? "hammaga" : "cheklangan"}${d.demo ? " · NAMUNA" : ""}</p>
  ${d.file ? `<button class="btn sm" id="dlf">Asl faylni yuklab olish</button>` : ""}
  ${d.claims.filter((c) => !c.ok).length ? `<div class="warn">⚠ Tekshirish talab qilinadi — hujjatdagi raqamlar asosiy reyestrga mos emas:<br>${d.claims.filter((c) => !c.ok).map((c) => `${esc(c.label)}: hujjatda ${c.value}, reyestrda ${c.actual}${c.note ? " (" + esc(c.note) + ")" : ""}`).join("<br>")}</div>` : ""}
  ${d.duplicates.length ? `<div class="warn">Takroriy mazmun: ${d.duplicates.map((x) => `${esc(x.doc)} ↔ ${esc(x.similar_to)} (${x.overlap}%)`).join("; ")}</div>` : ""}
  <pre class="doc">${esc(d.body)}</pre><p class="small muted">Hujjat matni faqat ma'lumot sifatida ishlatiladi; undagi har qanday ko'rsatma tizim buyrug'i hisoblanmaydi.</p>`);
  if ($("#dlf")) $("#dlf").onclick = () => openFile(`/api/documents/${d.id}/file`);
}

// ------------------------------------------------------------ 4. Raqamli xotira
VIEWS.memory = async (v) => {
  const docs = await api("/api/documents");
  const types = [...new Set(docs.map((d) => d.type))].sort();
  v.innerHTML = `<h1>Kafedra raqamli xotirasi</h1><p class="muted">Bayonnomalar, qarorlar, hisobotlar, nizomlar va rejalar — bilimlar bazasiga kiritilgan (${docs.length} ta hujjat sizga ochiq). Masalan: «O'tgan yili shu muammo qanday hal qilingan?»</p>
  <div class="grid ${can("upload_doc") ? "g2" : ""}"><div class="card"><div class="row"><input id="flt" placeholder="Qidirish…" style="flex:2"><select id="tf" style="flex:1"><option value="">Barcha turlar</option>${types.map((t) => `<option>${esc(t)}</option>`).join("")}</select></div><div class="tbl"><table id="dt"></table></div></div>
  ${can("upload_doc") ? `<form class="card form" id="up"><h2>Hujjat yuklash</h2><p class="small muted">Word (.docx), .txt yoki .md fayl yoki matn. Yuklangan hujjat darhol bilimlar bazasiga qo'shiladi.</p>
  <input type="file" name="file" accept=".docx,.txt,.md"><input name="title" placeholder="Sarlavha (ixtiyoriy — fayldan olinadi)">
  <div class="row"><select name="type"><option value="">Turi (avtomatik)</option><option>bayonnoma</option><option>nizom</option><option>reja</option><option>hisobot</option><option>farmoyish</option></select>
  <input name="date" type="date"><select name="access"><option value="public">Hammaga</option><option value="mudir">Faqat rahbariyat</option></select></div>
  <input name="source" placeholder="Manba (masalan: Kafedra hujjatlari (Word))"><textarea name="body" placeholder="Yoki hujjat matnini shu yerga kiriting"></textarea>
  <button class="btn primary">Saqlash va bilimlar bazasiga qo'shish</button></form>` : ""}</div>`;
  const draw = () => {
    const f = $("#flt").value.toLowerCase(), ty = $("#tf").value;
    const rows = docs.filter((d) => (d.title + d.id + d.source).toLowerCase().includes(f) && (!ty || d.type === ty));
    $("#dt").innerHTML = rows.length ? `<tr><th>ID</th><th>Hujjat</th><th>Turi</th><th>Sana</th><th>Holat</th></tr>` + rows.map((d) =>
      `<tr><td>${esc(d.id)}</td><td><a data-doc="${esc(d.id)}">${esc(d.title)}</a><div class="small muted">${esc(d.source)}</div></td><td>${esc(d.type)}</td><td>${fd(d.date)}</td>
      <td>${d.access !== "public" ? '<span class="pill b-red">maxfiy</span> ' : ""}${d.review ? '<span class="pill b-yellow">tekshirish talab qilinadi</span>' : ""}</td></tr>`).join("") : `<tr><td>${ST.empty()}</td></tr>`;
    bindDocs($("#dt"));
  };
  draw();
  $("#flt").oninput = draw; $("#tf").onchange = draw;
  if ($("#up")) $("#up").onsubmit = async (e) => {
    e.preventDefault();
    const fdata = new FormData(e.target); const f = Object.fromEntries(fdata); const file = fdata.get("file");
    const body = { title: f.title, type: f.type, date: f.date, access: f.access, source: f.source, body: f.body };
    if (file && file.size) {
      body.filename = file.name;
      body.file_b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(file); });
    } else if (!f.body || !f.title) { toast("Fayl tanlang yoki sarlavha va matn kiriting", true); return; }
    const r = await api("/api/documents", body);
    ok(`${r.id}: ${r.chunks} ta bo'lak bilimlar bazasiga qo'shildi` + (r.duplicate_of ? ` (diqqat: ${r.duplicate_of} bilan bir xil)` : ""));
    render();
  };
};

// ------------------------------------------------------------ 5. O'qituvchi 360
VIEWS.t360 = async (v, tid) => {
  const ts = await api("/api/teachers");
  if (!ts.length) { v.innerHTML = ST.empty(); return; }
  tid = tid || S.me.teacher_id || ts[0].id;
  const d = await api("/api/teachers/" + tid);
  const k = d.kpi, p = d.plan, L = d.load;
  v.innerHTML = `<div class="row sp"><h1>O'qituvchi 360 — ${esc(k.teacher.full_name)}</h1>
   ${ts.length > 1 ? `<select id="tsel" style="width:auto">${ts.map((t) => `<option value="${t.id}" ${t.id === tid ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}</div>
  <div class="grid g3">
   <div class="card"><h2>Umumiy ma'lumot</h2><div class="kv"><b>F.I.Sh.</b><span>${esc(k.teacher.full_name)}</span><b>Lavozimi</b><span>${esc(k.teacher.position)}</span><b>Ilmiy daraja</b><span>${esc(k.teacher.degree)}</span>
   <b>O'quv yuklamasi</b><span>${L.load_hours} / ${L.max_load} soat ${L.load_hours > L.max_load ? '<span class="pill b-yellow">me\'yordan yuqori</span>' : ""}</span>
   <b>Ochiq dars</b><span class="small">${d.lessons.map(esc).join("<br>") || "—"}</span><b>Loyihalar</b><span class="small">${d.projects.map(esc).join("<br>") || "—"}</span></div></div>
   <div class="card"><h2>Faoliyat ko'rsatkichi: ${k.percent}%</h2>${pctBar(k.percent)}<p class="small">${esc(k.formula)}</p><p class="small muted">${esc(k.rule)} · oxirgi yangilanish: ${esc(k.updated)}</p>
   <table>${k.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.verified}/${i.max}</td><td>${i.evidence_pending ? `<span class="pill b-yellow">+${i.evidence_pending} kutilmoqda</span>` : ""}${i.evidence_rejected ? `<span class="pill b-red">${i.evidence_rejected} rad etilgan</span>` : ""}</td></tr>`).join("")}</table></div>
   <div class="card"><h2>Ma'lumot kelib chiqishi</h2>${lineage(k.lineage)}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><h2>Ilmiy faoliyat va xavf belgilari</h2>${p ? `<p><b>${p.done}/${p.planned}</b> band bajarilgan (${Math.round(100 * p.done / p.planned)}%)</p>${pctBar(100 * p.done / p.planned)}
   <p class="small">Bosqich muddati: ${fd(p.deadline)} · oxirgi rivojlanish: ${fd(p.last_progress)} · manba: ${docChip(p.doc_ref)}</p>` : ST.empty()}
   ${d.risks.map((r) => `<div class="card risk ${r.level}" style="margin-top:8px"><b>${esc(r.title)}</b><p class="small muted">${esc(r.note)}</p><ul class="why">${r.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`).join("")}</div>
   <div class="card"><h2>${esc(d.devplan.title)}</h2><ul>${d.devplan.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="small muted">${esc(d.devplan.note)}</p><p class="small">Asos: ${d.devplan.basis.map(esc).join("; ")}</p></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Dalillar bog'lanish xaritasi: O'qituvchi → Ko'rsatkich → Dalil → Hujjat → Tasdiqlovchi</h2><div class="tbl">${graphSvg(d.graph)}</div></div>
  <div class="grid g2" style="margin-top:16px">
   <div class="card"><h2>Dalillar</h2><table>${k.evidence.map((e) => `<tr><td>${esc(e.title)}<div class="small muted">${esc(e.subtype)} ${e.doi ? "· DOI " + esc(e.doi) : ""} ${e.note ? "· " + esc(e.note) : ""}</div></td><td>${e.score}</td><td>${stBadge(e.status)}</td><td>${e.file ? `<button class="chip file" data-ev="${e.id}">PDF</button>` : ""}</td></tr>`).join("")}</table></div>
   <div class="card"><h2>Topshiriqlar va muddatlar</h2>${d.tasks.length ? `<table>${d.tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${fd(t.deadline)}</td><td>${t.progress}%</td><td>${stBadge(t.status)}</td></tr>`).join("")}</table>` : ST.empty("Topshiriqlar yo'q")}</div>
  </div>`;
  if ($("#tsel")) $("#tsel").onchange = (e) => location.hash = "#t360/" + e.target.value;
};
function graphSvg(g) {
  const cols = { teacher: 0, kpi: 1, evidence: 2, document: 3, approver: 4 };
  const W = [20, 170, 400, 700, 800], byCol = [[], [], [], [], []];
  g.nodes.forEach((n) => byCol[cols[n.kind]].push(n));
  const rows = Math.max(...byCol.map((c) => c.length)), H = rows * 30 + 20, pos = {};
  byCol.forEach((c, ci) => c.forEach((n, i) => pos[n.id] = { x: W[ci], y: 20 + (i + 0.5) * ((H - 20) / c.length) }));
  const color = { teacher: "#1f5eff", kpi: "#6941c6", evidence: "#067647", document: "#475467", approver: "#b54708" };
  const lines = g.edges.filter((e) => pos[e.from] && pos[e.to]).map((e) => `<line x1="${pos[e.from].x + 120}" y1="${pos[e.from].y}" x2="${pos[e.to].x}" y2="${pos[e.to].y}" stroke="#d0d5dd"/>`).join("");
  const nodes = g.nodes.map((n) => { const p = pos[n.id]; const c = n.status === "kutilmoqda" ? "#b54708" : n.status === "rad etilgan" ? "#d92d20" : color[n.kind];
    return `<g><circle cx="${p.x}" cy="${p.y}" r="5" fill="${c}"/><text x="${p.x + 9}" y="${p.y + 4}" fill="${c}">${esc(n.label.slice(0, n.kind === "evidence" ? 46 : 30))}</text></g>`; }).join("");
  return `<svg width="1000" height="${H + 10}" viewBox="0 0 1000 ${H + 10}">${lines}${nodes}</svg>`;
}

// ------------------------------------------------------------ 6. Ko'rsatkichlar
VIEWS.kpi = async (v) => {
  const ts = await api("/api/teachers");
  v.innerHTML = `<h1>Faoliyat ko'rsatkichlari nazorati</h1><p class="muted">Faoliyat ko'rsatkichi = tasdiqlangan ball / maksimal ball × 100 (nizom D04). Faqat tasdiqlangan dalillar hisobga olinadi. Manba: dalillar reyestri (Excel).</p>
  <div class="card tbl">${ts.length ? `<table><tr><th>O'qituvchi</th><th>Lavozim</th><th>Ko'rsatkich</th><th></th><th>Ball</th><th>Dalillar</th><th>Ilmiy reja</th><th>Kutilmoqda</th></tr>
  ${ts.map((t) => `<tr><td><a href="#t360/${t.id}">${esc(t.name)}</a></td><td>${esc(t.position)}</td><td><b>${t.percent}%</b></td><td style="width:180px">${pctBar(t.percent)}</td><td>${t.verified}/${t.max}</td><td>${t.evidence}</td><td>${t.plan_pct ?? "—"}%</td><td>${t.pending || ""}</td></tr>`).join("")}</table>` : ST.empty()}</div>`;
};

// ------------------------------------------------------------ 7. Dalillar ombori
VIEWS.vault = async (v) => {
  const [ev, h] = await Promise.all([api("/api/evidence"), api("/api/health")]);
  const dups = new Set(h.data_health.duplicates.items.map((d) => d.id));
  v.innerHTML = `<h1>Dalillar ombori</h1><p class="muted">Natija → Manba → Dalil → Sana → Tasdiqlash holati. Jami ${ev.length} ta dalil; PDF fayllarni ochish uchun 📎 tugmasini bosing.</p>
  <div class="grid ${S.me.teacher_id ? "g2" : ""}"><div class="card tbl"><select id="sf" style="width:auto"><option value="">Barcha holatlar</option><option>kutilmoqda</option><option>tasdiqlangan</option><option>rad etilgan</option></select><table id="et"></table></div>
  ${S.me.teacher_id ? `<form class="card form" id="eu"><h2>Dalil yuklash</h2><input name="title" placeholder="Nomi" required>
  <div class="row"><select name="category"><option value="maqola">Ilmiy maqola</option><option value="konferensiya">Konferensiya</option><option value="metodik">O'quv-metodik</option><option value="grant">Grant/loyiha</option><option value="tarbiyaviy">Tarbiyaviy</option></select><input name="score" type="number" min="0" max="20" placeholder="Ball" required></div>
  <input name="doi" placeholder="DOI (ixtiyoriy)"><label class="row"><input type="checkbox" name="has_pdf" style="width:auto"> PDF ilova qilingan</label><button class="btn primary">Tasdiqlashga yuborish</button></form>` : ""}</div>`;
  const draw = (f) => {
    const rows = ev.filter((e) => !f || e.status === f);
    $("#et").innerHTML = rows.length ? `<tr><th>#</th><th>O'qituvchi</th><th>Dalil</th><th>Ball</th><th>Sana</th><th>Holat</th><th>Tasdiqlovchi</th><th></th></tr>` +
      rows.map((e) => `<tr><td>${e.id}</td><td>${esc(e.short_name)}</td><td>${esc(e.title)}${dups.has(e.id) ? ' <span class="pill b-red">takroriy bo\'lishi mumkin</span>' : ""}<div class="small muted">${esc(e.subtype)} ${e.doi ? "· DOI " + esc(e.doi) : ""} ${e.note ? "· " + esc(e.note) : ""}</div></td><td>${e.score}</td><td>${fd(e.created_at)}</td><td>${stBadge(e.status)}</td><td>${esc(e.approved_by || "")}</td>
      <td>${e.file ? `<button class="chip file" data-ev="${e.id}">📎 PDF</button> ` : ""}${can("approve_evidence") && e.status === "kutilmoqda" ? `<button class="btn sm ok" data-ok="${e.id}">Tasdiqlash</button> <button class="btn sm no" data-no="${e.id}">Rad etish</button>` : ""}</td></tr>`).join("") : `<tr><td>${ST.empty()}</td></tr>`;
    bindDocs($("#et"));
    v.querySelectorAll("[data-ok],[data-no]").forEach((b) => b.onclick = async () => {
      const yes = !!b.dataset.ok; const note = yes ? "" : (prompt("Rad etish sababi:") || "");
      await api(`/api/evidence/${b.dataset.ok || b.dataset.no}/review`, { status: yes ? "tasdiqlangan" : "rad etilgan", note });
      ok("Saqlandi va harakatlar tarixiga yozildi"); render();
    });
  };
  draw(""); $("#sf").onchange = (e) => draw(e.target.value);
  if ($("#eu")) $("#eu").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.has_pdf = !!f.has_pdf; await api("/api/evidence", f); ok("Dalil tasdiqlashga yuborildi"); render(); };
};

// ------------------------------------------------------------ 8. Javob izlari
VIEWS.traces = async (v, id) => {
  if (id) {
    const t = await api("/api/traces/" + id);
    v.innerHTML = `<a href="#traces">← ro'yxat</a><h1>Javob izi #${t.id}</h1><p class="muted">${esc(t.ts)} · ${esc(t.username)} · ${esc(t.status)} · ${t.ms} ms</p>
    <div class="card"><p><b>Javob:</b> ${esc(t.answer)}</p>${traceHtml(t.trace)}</div>`;
    return;
  }
  const rows = await api("/api/traces");
  v.innerHTML = `<h1>Javob izlari — tushuntiriladigan sun'iy intellekt</h1><p class="muted">Savol → Qidirilgan ma'lumot → Topilgan hujjat → Ishlatilgan dalil → Hisoblash → Xulosa.</p>
  <div class="card tbl">${rows.length ? `<table><tr><th>#</th><th>Vaqt</th><th>Foydalanuvchi</th><th>Savol</th><th>Holat</th><th>ms</th></tr>
  ${rows.map((r) => `<tr><td><a href="#traces/${r.id}">${r.id}</a></td><td>${esc(r.ts)}</td><td>${esc(r.username)}</td><td>${esc(r.question)}</td><td>${STATUS[r.status] || esc(r.status)}</td><td>${r.ms}</td></tr>`).join("")}</table>` : ST.empty("Hali savol berilmagan — «Savol-javob» bo'limidan foydalaning")}</div>`;
};

// ------------------------------------------------------------ 9. Erta ogohlantirish
VIEWS.warn = async (v) => {
  const rs = await api("/api/warnings");
  v.innerHTML = `<h1>Erta ogohlantirish</h1><p class="muted">Qoidalar: qizil — ilmiy reja &lt; 50% va qolgan muddat ≤ 30 kun yoki muddati o'tgan vazifa; sariq — 30 kundan ortiq rivojlanish yo'q, ko'rsatkich &lt; 35% yoki yuklama me'yordan yuqori. Tizim qat'iy xulosa bermaydi.</p>
  <div class="grid">${rs.map((r, i) => `<div class="card risk ${r.level}"><div class="row sp"><h2>${esc(r.title)}</h2><span>${lvl(r.level)} <span class="pill">${esc(r.area)}</span></span></div>
   <p class="small muted">${esc(r.note)}</p>
   <div class="row"><button class="btn sm" data-w="${i}">Nega?</button><button class="btn sm" data-r="${i}">Nima qilish kerak?</button>${can("create_task") ? `<button class="btn sm primary" data-p="${i}">Vazifaga aylantirish</button>` : ""}</div><div id="w${i}"></div></div>`).join("") || ST.empty("Xavf belgisi aniqlanmadi")}</div>`;
  v.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => { $("#w" + b.dataset.w).innerHTML = whyHtml(rs[b.dataset.w]); bindDocs($("#w" + b.dataset.w)); });
  v.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => $("#w" + b.dataset.r).innerHTML = recList(rs[b.dataset.r].recommendations));
  v.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => makePlan(rs[b.dataset.p].id));
};

// ------------------------------------------------------------ 10. Harakat markazi
VIEWS.tasks = async (v) => {
  const [rows, ts] = await Promise.all([api("/api/tasks"), api("/api/teachers")]);
  const active = rows.filter((r) => !r.archive), arch = rows.filter((r) => r.archive);
  const tbl = (list) => `<table><tr><th>#</th><th>Vazifa</th><th>Mas'ul</th><th>Boshlanish</th><th>Muddat</th><th>Nazorat</th><th>Bajarilish</th><th>Ustuvorlik</th><th>Hujjatlar</th><th>Holat</th></tr>
  ${list.map((t) => `<tr><td>${t.id}</td><td>${esc(t.title)}${t.description ? `<div class="small muted">${esc(t.description)}</div>` : ""}<div class="small muted">Manba: ${esc(t.source)}</div>${t.alert ? `<div class="warn">${esc(t.alert)}</div>` : ""}</td>
  <td>${esc(t.responsible)}</td><td>${fd(t.start_date)}</td><td>${fd(t.deadline)} ${t.overdue ? '<span class="pill b-red">kechikkan</span>' : ""}</td><td>${fd(t.control_date)}</td><td style="width:90px">${pctBar(t.progress)}<span class="small">${t.progress}%</span></td><td>${esc(t.priority)}</td>
  <td>${(t.evidence_refs || "").split(",").filter(Boolean).map((d) => `<button class="chip" data-doc="${esc(d)}">${esc(d)}</button>`).join(" ")}</td>
  <td>${t.archive ? stBadge(t.status) : `<select data-s="${t.id}" style="width:auto">${["yangi", "jarayonda", "bajarildi"].map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>`}</td></tr>`).join("")}</table>`;
  v.innerHTML = `<h1>Harakat markazi va aqlli vazifalar</h1><p class="muted">Muammo → Sabab → Dalil → Tavsiya → Vazifa → Mas'ul → Muddat → Holat → Nazorat. Tabiiy tilda ham buyruq bering: «Aliyevga 20-oktabrgacha maqolalar bo'yicha hisobot tayyorlashni topshir».</p>
  ${can("create_task") ? `<form class="card form" id="tf"><div class="row"><input name="title" placeholder="Vazifa nomi" required style="flex:2"><select name="assignee"><option value="">Kafedra (umumiy)</option>${ts.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select><input type="date" name="deadline" required><select name="priority"><option>yuqori</option><option selected>o'rta</option><option>past</option></select><button class="btn primary" style="flex:0">Qo'shish</button></div><input name="description" placeholder="Tavsif (ixtiyoriy)"></form>` : ""}
  <div class="card tbl" style="margin-top:16px">${active.length ? tbl(active) : ST.empty("Faol vazifalar yo'q")}</div>
  ${arch.length ? `<div class="card tbl" style="margin-top:16px"><h2>Arxiv (o'tgan yillar)</h2>${tbl(arch)}</div>` : ""}`;
  v.querySelectorAll("[data-s]").forEach((s) => s.onchange = async () => { await api(`/api/tasks/${s.dataset.s}/status`, { status: s.value }); ok("Holat yangilandi"); render(); });
  if ($("#tf")) $("#tf").onsubmit = async (e) => { e.preventDefault(); await api("/api/tasks", Object.fromEntries(new FormData(e.target))); ok("Vazifa yaratildi"); render(); };
};

// ------------------------------------------------------------ Hisobot va solishtirish
VIEWS.reports = async (v) => {
  if (!can("view_all")) { v.innerHTML = ST.denied; return; }
  const [rec, reps, lin, h] = await Promise.all([api("/api/reconciliation"), api("/api/reports"), api("/api/lineage/maqola"), api("/api/health")]);
  v.innerHTML = `<h1>Bir bosishda hisobot va ko'rsatkichlarni solishtirish</h1>
  <div class="grid g2"><div class="card"><h2>Yillik hisobot (D06) ↔ tasdiqlangan dalillar</h2><table><tr><th>Ko'rsatkich</th><th>Hisobot</th><th>Tasdiqlangan ma'lumot</th><th>Holat</th></tr>
   ${rec.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.reported}</td><td>${r.evidence}${r.pending ? ` <span class="small muted">(+${r.pending} kutilmoqda)</span>` : ""}</td><td>${r.ok ? '<span class="pill b-green">Mos</span>' : `<span class="pill b-yellow">${esc(r.state)}</span>`}</td></tr>`).join("")}</table>
   <p><b>Natija:</b> ${esc(rec.summary)}</p><p class="small muted">${esc(rec.policy)}</p></div>
   <div class="card"><h2>Ma'lumot kelib chiqishi: maqolalar = ${lin.approved}</h2>${lineage([lin.approved + " ta tasdiqlangan maqola", lin.with_pdf + " tasida PDF", lin.with_doi + " tasida DOI", lin.approved_by_admin + " tasi mas'ul tomonidan tasdiqlangan", "Oxirgi tekshiruv: " + lin.last_check])}
   <p class="small muted">Kutilmoqda: ${lin.pending} · rad etilgan: ${lin.rejected}</p></div></div>
  <div class="card tbl" style="margin-top:16px"><h2>Hisobot hujjatlaridagi raqamlar ↔ asosiy reyestr</h2><table><tr><th>Hujjat</th><th>Ko'rsatkich</th><th>Hujjatda</th><th>Reyestrda</th><th>Holat</th></tr>
   ${h.claims.map((c) => `<tr><td>${docChip(c.doc_id)}</td><td>${esc(c.label)}<div class="small muted">«${esc(c.quote)}»</div></td><td>${c.value}</td><td>${c.actual}</td><td>${c.ok ? '<span class="pill b-green">Mos</span>' : `<span class="pill b-yellow">Tekshirish talab qilinadi</span>${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ""}`}</td></tr>`).join("")}</table></div>
  <div class="card" style="margin-top:16px"><div class="row sp"><h2>Haftalik hisobotlar</h2>${can("approve_report") ? `<button class="btn primary" id="gen">Hisobot loyihasini yaratish</button>` : ""}</div>
  <p class="small muted">Tamoyil: sun'iy intellekt tayyorlaydi → inson tekshiradi → inson tasdiqlaydi. Rasmiy hisobot inson tasdig'isiz yuborilmaydi.</p>
  ${reps.map((r) => `<div class="card" style="margin-top:10px"><div class="row sp"><b>#${r.id} ${esc(r.title)}</b><span>${stBadge(r.status)} ${r.status === "draft" && can("approve_report") ? `<button class="btn sm ok" data-a="${r.id}">Tasdiqlash</button>` : ""}</span></div>
   ${r.status === "draft" ? `<p class="draft">Loyiha — inson tasdig'i talab etiladi</p>` : `<p class="small muted">Tasdiqladi: ${esc(r.approved_by)} · ${esc(r.approved_at)}</p>`}
   <div class="md">${md(r.body)}</div></div>`).join("") || ST.empty("Hali hisobot loyihasi yo'q")}</div>`;
  if ($("#gen")) $("#gen").onclick = async () => { await api("/api/reports", {}); ok("Hisobot loyihasi yaratildi"); render(); };
  v.querySelectorAll("[data-a]").forEach((b) => b.onclick = async () => { await api(`/api/reports/${b.dataset.a}/approve`, {}); ok("Hisobot tasdiqlandi"); render(); });
};
function md(t) {
  return esc(t).split("\n").map((l) => l.startsWith("# ") ? `<h1>${l.slice(2)}</h1>` : l.startsWith("## ") ? `<h2>${l.slice(3)}</h2>` : l.startsWith("- ") ? `<div>• ${l.slice(2)}</div>` : l ? `<p>${l}</p>` : "").join("").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>");
}

// ------------------------------------------------------------ 11. Ruxsatlar va harakatlar tarixi
VIEWS.audit = async (v) => {
  const roles = `<div class="card"><h2>Rollar va huquqlar</h2><table><tr><th>Rol</th><th>Huquqlar</th></tr>
  <tr><td>Kafedra mudiri</td><td>barcha kafedra ma'lumotlari, dalil tasdiqlash/rad etish, vazifa yaratish, hisobot tasdiqlash, maxfiy hujjatlar, harakatlar tarixi</td></tr>
  <tr><td>Dekan</td><td>kafedra ma'lumotlarini ko'rish va harakatlar tarixi (o'zgartirish huquqisiz)</td></tr>
  <tr><td>Tizim administratori</td><td>ma'lumotlarni ko'rish (shaxsiy maxfiy hujjatlarsiz), hujjat yuklash, harakatlar tarixi, baholash markazi</td></tr>
  <tr><td>O'qituvchi</td><td>faqat o'z ko'rsatkichlari, dalillari va vazifalari; umumiy hujjatlar; boshqa xodimlarning maxfiy ma'lumotlari yopiq</td></tr></table>
  <p class="small muted">Respublika/universitet administratori, rektor, prorektor va talaba rollari keyingi bosqichda (ko'p tashkilotli tuzilma) qo'shiladi. Huquqlar har bir so'rovda server tomonida tekshiriladi; ruxsat berilmagan ma'lumot sun'iy intellektga uzatilmaydi.</p></div>`;
  if (!can("view_audit")) { v.innerHTML = `<h1>Ruxsatlar</h1><div class="card"><p>Sizning rolingiz: <b>${esc(S.me.role_label)}</b>.</p></div><div style="margin-top:16px">${roles}</div>`; return; }
  const rows = await api("/api/audit");
  v.innerHTML = `<h1>Ruxsatlar va harakatlar tarixi</h1>${roles}
  <div class="card tbl" style="margin-top:16px"><h2>Kim, qachon, nima qildi</h2>${rows.length ? `<table><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Bo'lim</th><th>Harakat</th><th>Tafsilot</th><th>Eski qiymat</th><th>Yangi qiymat</th></tr>
  ${rows.map((r) => `<tr><td>${esc(r.ts.replace("T", " "))}</td><td>${esc(r.username)}</td><td>${esc(r.section || "")}</td><td>${r.action === "permission_denied" ? '<span class="pill b-red">Ruxsat rad etildi</span>' : esc(r.action_label)}</td><td>${esc(r.details)}</td><td>${esc(r.old_value || "")}</td><td>${esc(r.new_value || "")}</td></tr>`).join("")}</table>` : ST.empty()}</div>`;
};

// ------------------------------------------------------------ 12. Baholash markazi
VIEWS.eval = async (v) => {
  const [e, tt] = await Promise.all([api("/api/eval"), api("/api/time-trials")]);
  if (!e.configs) { v.innerHTML = `<div class="card">${ST.empty("Baholash natijasi yo'q")} ${can("run_eval") ? `<button class="btn" id="run">Baholashni ishga tushirish</button>` : ""}</div>`; if ($("#run")) $("#run").onclick = runEval; return; }
  const c = e.configs[e.configs.length - 1], m = c.metrics;
  const M = (l, val) => `<div class="card metric"><div class="v">${esc(val ?? "—")}</div><div class="muted small">${l}</div></div>`;
  v.innerHTML = `<div class="row sp"><div><h1>Sun'iy intellekt baholash markazi</h1><p class="muted">${esc(e.dataset)} · ${e.questions} ta nazorat savoli · sinov sanasi: ${esc(e.tested_at)} · model: ${esc(e.llm)}</p></div>
  ${can("run_eval") ? `<button class="btn primary" id="run">Baholashni qayta ishga tushirish</button>` : ""}</div>
  <p class="small muted">Barcha raqamlar haqiqiy sinov natijasi (eval/baholash_toplami_v2.json). Sun'iy «ishonchlilik foizi» ishlatilmaydi. Diqqat: sinov to'plami ishlab chiquvchilar tomonidan namuna ma'lumotlar asosida tuzilgan — mustaqil baho uchun kafedra mutaxassislari yangi savollar tuzishi kerak.</p>
  <h2>Asosiy konfiguratsiya (${esc(c.name)}): ${esc(c.label)}</h2>
  <div class="grid g4">${M("Javoblar aniqligi", m.answer_accuracy + "%")}${M("Kerakli hujjat topildi (top-5)", m.retrieval_recall_at_5 + "%")}${M("Manba to'g'ri ko'rsatildi", m.citation_correctness + "%")}${M("Javob manbaga asoslangan", m.groundedness_rag + "%")}
  ${M("Ruxsat sinovlari", m.permission_compliance)}${M("Vazifa ajratish aniqligi", m.task_extraction_accuracy)}${M("Dalil yo'q savollarda to'g'ri rad etish", m.abstention_accuracy)}${M("O'rtacha javob vaqti", m.avg_response_ms + " ms")}</div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h2>Natijalar</h2><table>
   <tr><td>Jami sinov savollari</td><td>${m.total}</td></tr><tr><td>To'g'ri javoblar</td><td>${m.correct}</td></tr><tr><td>Noto'g'ri javoblar</td><td>${m.incorrect}</td></tr>
   <tr><td>Manba topilmagan holatlar</td><td>${m.retrieval_misses}</td></tr><tr><td>Noto'g'ri manba ishlatilgan holatlar</td><td>${m.citation_errors}</td></tr><tr><td>Ruxsat buzilishlari</td><td>${m.permission_violations}</td></tr>
   <tr><td>Javob bor bo'lsa ham rad etilgan</td><td>${m.false_abstain}</td></tr><tr><td>95% so'rovlar javob vaqti</td><td>${m.p95_response_ms} ms gacha</td></tr></table></div>
  <div class="card"><h2>Savol turlari bo'yicha aniqlik</h2><table>${Object.entries(m.accuracy_by_type).map(([k, val]) => `<tr><td>${esc(TYPE_LABELS[k] || k)}</td><td style="width:50%">${pctBar(val)}</td><td>${val}%</td></tr>`).join("")}</table></div></div>
  <div class="card tbl" style="margin-top:16px"><h2>Oddiy yondashuv bilan solishtirish</h2><table><tr><th>Konfiguratsiya</th><th>Aniqlik</th><th>Hujjat topildi</th><th>Manba to'g'ri</th><th>Ruxsat</th><th>Vazifa</th><th>Rad etish</th></tr>
  ${e.configs.map((x) => `<tr><td><b>${esc(x.name)}</b> ${esc(x.label)}</td><td>${x.metrics.answer_accuracy}%</td><td>${x.metrics.retrieval_recall_at_5}%</td><td>${x.metrics.citation_correctness}%</td><td>${x.metrics.permission_compliance}</td><td>${x.metrics.task_extraction_accuracy}</td><td>${x.metrics.abstention_accuracy}</td></tr>`).join("")}</table></div>
  <div class="card tbl" style="margin-top:16px"><h2>Xatolar tahlili (${c.failures.length})</h2>${c.failures.length ? `<table><tr><th>ID</th><th>Savol</th><th>Kutilgan</th><th>Natija</th><th>Javob</th></tr>
  ${c.failures.map((f) => `<tr><td>${esc(f.id)}</td><td>${esc(f.question)}</td><td>${esc(f.expected_status)}</td><td>${esc(f.status)}${f.keywords_ok ? "" : " · kalit ma'lumot yo'q"}</td><td class="small">${esc(f.answer)}</td></tr>`).join("")}</table>` : ST.empty("Xato topilmadi")}</div>
  <div class="card" style="margin-top:16px"><h2>Amaliy samaradorlik: vaqt o'lchovi</h2><p class="muted small">Faqat haqiqatda o'lchangan vaqtlar kiritiladi. An'anaviy usul (hujjat qidirish → Excel → tekshirish → hisobot) va KafedraAgent (savol → dalil → tahlil → hisobot).</p>
  <form class="form" id="ttf"><div class="row"><select name="task"><option>Hujjat topish</option><option>Hisobot tayyorlash</option><option>Vazifa yaratish</option><option>Ko'rsatkichlarni tekshirish</option><option>Muammoli holatni aniqlash</option></select><input name="traditional_sec" type="number" min="1" placeholder="An'anaviy usul (soniya)" required><input name="agent_sec" type="number" min="1" placeholder="KafedraAgent (soniya)" required><button class="btn" style="flex:0">Qo'shish</button></div></form>
  ${tt.rows.length ? `<table>${tt.rows.map((r) => `<tr><td>${esc(r.task)}</td><td>${r.traditional_sec} s</td><td>${r.agent_sec} s</td><td class="small muted">${esc(r.tester)}</td></tr>`).join("")}</table>
  <p><b>Jami: ${tt.traditional_total} s → ${tt.agent_total} s · ${tt.saving_pct}% kam vaqt</b> (${tt.rows.length} ta o'lchov)</p>` : ST.empty("Hali o'lchov kiritilmagan")}</div>`;
  if ($("#run")) $("#run").onclick = runEval;
  $("#ttf").onsubmit = async (ev) => { ev.preventDefault(); await api("/api/time-trials", Object.fromEntries(new FormData(ev.target))); ok(); render(); };
};
const TYPE_LABELS = { fact: "Aniq ma'lumotni topish", document: "Hujjatdan ma'lumot topish", analytical: "Tahliliy savollar", evidence: "Dalilni aniqlash", action: "Vazifa yaratish", permission: "Ruxsat va xavfsizlik", no_answer: "Javobi yo'q savollar", personal: "O'qituvchi yordamchisi" };
async function runEval() { toast("Baholash bajarilmoqda…"); await api("/api/eval/run", {}); ok("Baholash yakunlandi"); render(); }

// ------------------------------------------------------------ Ma'lumot sifati
VIEWS.health = async (v) => {
  const h = await api("/api/health");
  const dh = h.data_health;
  v.innerHTML = `<h1>Ma'lumot sifati nazoratchisi</h1><p class="muted">Tizim noto'g'ri ma'lumotni avtomatik o'zgartirmaydi — barcha topilmalar «Tekshirish talab qilinadi» holatida.</p>
  <div class="grid g2"><div class="card"><h2>Ma'lumot sog'lomligi: ${dh.score}%</h2>${dhBlock(dh)}</div>
  <div class="card"><h2>Ma'lumot manbalari</h2><table><tr><th>Manba</th><th>Turi</th><th>Oxirgi yangilanish</th><th></th></tr>${h.sources.map((s) => `<tr><td>${esc(s.name)}<div class="small muted">${esc(s.note)}</div></td><td>${esc(s.kind)}</td><td>${esc(fd(s.last_sync))} ${esc(s.last_sync.slice(11, 16))}</td><td>${dh.freshness.stale.includes(s.name) ? '<span class="pill b-yellow">ma\'lumot eskirgan</span>' : '<span class="pill b-green">yangi</span>'}</td></tr>`).join("")}</table>
  <p class="small muted">* HEMIS: integratsiya faqat ruxsat etilgan API yoki ma'lumotlarga kirish huquqi asosida. Hozir ruxsat etilgan eksport fayl ishlatiladi.</p></div></div>
  ${h.issues.length ? `<div class="card tbl" style="margin-top:16px"><h2>Aniqlangan nomuvofiqliklar (${h.issues.length})</h2><table><tr><th>Turi</th><th>Obyekt</th><th>Tafsilot</th><th>Holat</th></tr>
  ${h.issues.map((i) => `<tr><td>${esc(i.kind)}</td><td>${esc(i.object)}</td><td class="small">${esc(i.detail)}</td><td><span class="pill b-yellow">${esc(i.status)}</span></td></tr>`).join("")}</table></div>` : ""}`;
};

// ------------------------------------------------------------ kirish
async function boot() {
  if (!S.token) return showLogin();
  try { S.me = await api("/api/me"); } catch { return; }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who").innerHTML = `<b>${esc(S.me.full_name)}</b><br>${esc(S.me.role_label)}`;
  $("#today").textContent = "Sana: " + fd(S.me.today);
  $("#llm").textContent = "Model: " + S.me.llm;
  nav(); render();
}
function showLogin() { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); }
function logout() { S.token = ""; S.chat = []; localStorage.removeItem("ka_token"); showLogin(); }
$("#logout").onclick = logout;
document.querySelectorAll(".demo-users a").forEach((a) => a.onclick = () => { $("#loginForm").username.value = a.dataset.u; $("#loginForm").password.value = a.dataset.p; });
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault(); $("#loginErr").textContent = "";
  const f = Object.fromEntries(new FormData(e.target));
  const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
  const j = await r.json();
  if (!r.ok) { $("#loginErr").textContent = j.error; return; }
  S.token = j.token; localStorage.setItem("ka_token", S.token); S.chat = []; boot();
};
boot();
