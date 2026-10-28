import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, writeBatch, onSnapshot, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { FAMILY } from "./family.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = [{ key: "am", name: "Breakfast" }, { key: "pm", name: "Dinner" }];
const DINNER_FROM_HOUR = 15; // before 3pm the "current" meal is breakfast
const NAME_KEY = "ardy.name";
const RING_LEN = 113.1;      // 2πr for r = 18

const HERO = {
  hungry: { src: "images/ardy-hungry.jpg", alt: "Ardy looking up at the camera, hoping for food" },
  fed: { src: "images/ardy-fed.jpg", alt: "Ardy lying on the rug, content" },
  rest: { src: "images/ardy-resting.jpg", alt: "Ardy resting his head on the rug" },
};

const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
const PERSON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="8.5" r="4"/><path d="M4 20c1.2-4 4.4-6 8-6s6.8 2 8 6Z"/></svg>';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = (d) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtShort = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtTime = (date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const haptic = () => { try { navigator.vibrate?.(12); } catch { /* unsupported */ } };

const state = {
  thisMonday: mondayOf(new Date()),
  monday: mondayOf(new Date()),
  meals: {},        // "mon-am" -> { name, by, at: Date }
  loaded: false,
  uid: null,
  name: readName(),
  unsub: null,
  justFed: null,    // meal id to animate on next render
};

function readName() { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } }
function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } }

const weekKey = () => ymd(state.monday);
const isThisWeek = () => weekKey() === ymd(state.thisMonday);

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- People ----------
const AVATAR_COLORS = ["#2f6fdc", "#af52de", "#ff7a45", "#30b158", "#e5484d", "#0aa2c0"];
function familyMember(name) {
  const n = (name || "").trim().toLowerCase();
  return FAMILY.find((p) => p.name.toLowerCase() === n) || null;
}
function colorFor(name) {
  let h = 0;
  for (const c of name || "?") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
/** Fill an element (span.avatar) with a person's photo or initial. */
function paintAvatar(el, name) {
  el.textContent = "";
  const p = familyMember(name);
  el.style.setProperty("--avatar-bg", colorFor(name));
  if (p && p.photo) {
    const img = document.createElement("img");
    img.src = p.photo; img.alt = ""; img.decoding = "async";
    el.appendChild(img);
  } else if (p && p.icon) {
    el.textContent = p.icon;
  } else if (name) {
    el.textContent = name.trim().charAt(0).toUpperCase();
  } else {
    el.innerHTML = PERSON;
  }
}
const displayName = (rec) => (rec.by === state.uid ? "You" : (rec.name || "Someone"));

// ---------- Rendering ----------
function currentSlot() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Mon
  return { day: dow, meal: now.getHours() < DINNER_FROM_HOUR ? 0 : 1 };
}
const mealId = (di, mi) => `${DAYS[di].toLowerCase()}-${MEALS[mi].key}`;

let heroSrc = HERO.hungry.src;
function setHeroImage(kind) {
  const { src, alt } = HERO[kind];
  if (src === heroSrc) return;
  heroSrc = src;
  const img = $("heroImg");
  img.classList.add("swap");
  setTimeout(() => {
    img.onload = () => img.classList.remove("swap");
    img.src = src; img.alt = alt;
  }, 250);
}

function renderHero(fedCount, total) {
  const hero = $("hero"), kicker = $("heroKicker"), title = $("heroTitle");
  const cta = $("cta"), fedBy = $("fedBy");
  if (!state.loaded) return;

  const slot = isThisWeek() ? currentSlot() : null;
  if (!slot) {
    hero.dataset.state = "rest";
    setHeroImage("rest");
    cta.hidden = true; fedBy.hidden = true;
    kicker.textContent = `${fmtShort(state.monday)} – ${fmtShort(addDays(state.monday, 6))}`;
    title.textContent = `Ardy had ${fedCount} of ${total} meals`;
    return;
  }

  const id = mealId(slot.day, slot.meal);
  const rec = state.meals[id];
  const meal = MEALS[slot.meal].name.toLowerCase();
  kicker.textContent = `${DAY_LONG[slot.day]} · ${MEALS[slot.meal].name}`;

  if (rec) {
    hero.dataset.state = "fed";
    const allToday = state.meals[mealId(slot.day, 0)] && state.meals[mealId(slot.day, 1)];
    setHeroImage(allToday ? "rest" : "fed");
    title.textContent = allToday ? "Ardy's all fed for today" : `Ardy's had ${meal}`;
    cta.hidden = true; fedBy.hidden = false;
    paintAvatar($("fedByAvatar"), rec.name);
    $("fedByText").textContent = `${displayName(rec)} · ${fmtTime(rec.at)}`;
    $("fedByUndo").onclick = () => toggle(id);
  } else {
    hero.dataset.state = "hungry";
    setHeroImage("hungry");
    title.textContent = slot.meal === 1 && !state.meals[mealId(slot.day, 0)]
      ? "Ardy missed breakfast. Dinner's next"
      : `Ardy's waiting for ${meal}`;
    fedBy.hidden = true; cta.hidden = false;
    cta.disabled = !state.uid;
    $("ctaLabel").textContent = `I fed Ardy ${meal}`;
    cta.onclick = () => toggle(id);
  }
}

function render() {
  const slot = isThisWeek() ? currentSlot() : null;
  const todayIdx = isThisWeek() ? (new Date().getDay() + 6) % 7 : -1;
  const now = new Date();

  $("today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  $("weekLabel").textContent = isThisWeek()
    ? "This week"
    : `${fmtShort(state.monday)} – ${fmtShort(addDays(state.monday, 6))}`;
  $("toToday").hidden = isThisWeek();
  $("next").disabled = state.monday >= state.thisMonday;

  const days = $("days");
  days.textContent = "";
  DAYS.forEach((dname, di) => {
    const date = addDays(state.monday, di);
    const row = document.createElement("div");
    row.className = "row" + (di === todayIdx ? " today" : "");
    row.setAttribute("role", "row");

    const lab = document.createElement("div");
    lab.setAttribute("role", "rowheader");
    const n = document.createElement("div");
    n.className = "dayname"; n.textContent = DAY_LONG[di];
    const d = document.createElement("div");
    d.className = "daydate"; d.textContent = fmtShort(date);
    lab.append(n, d);
    row.appendChild(lab);

    MEALS.forEach((m, mi) => {
      const id = mealId(di, mi);
      const rec = state.meals[id];
      const isFuture = date > now && di !== todayIdx;
      const isDue = !rec && slot && (di < slot.day || (di === slot.day && mi <= slot.meal));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "cell");
      btn.className = "dot-btn" + (rec ? " fed" : "") + (isDue ? " due" : "") + (!rec && isFuture ? " future" : "")
        + (state.justFed === id ? " pop" : "");
      btn.disabled = !state.loaded || !state.uid;
      btn.setAttribute("aria-pressed", rec ? "true" : "false");
      btn.setAttribute("aria-label", `${DAY_LONG[di]} ${m.name}: ${rec ? `fed by ${displayName(rec)} at ${fmtTime(rec.at)}` : "not fed"}`);
      btn.title = rec ? `${displayName(rec)} · ${fmtTime(rec.at)}` : `${m.name}: not fed`;

      const av = document.createElement("span");
      av.className = "avatar";
      if (rec) paintAvatar(av, rec.name);
      const tick = document.createElement("span");
      tick.className = "tick"; tick.innerHTML = TICK;
      btn.append(av, tick);
      btn.addEventListener("click", () => toggle(id));
      row.appendChild(btn);
    });
    days.appendChild(row);
  });
  state.justFed = null;

  const total = DAYS.length * MEALS.length;
  const fedCount = Object.keys(state.meals).length;
  $("weekSummary").textContent = `${fedCount} of ${total} meals`;
  $("ringFill").style.strokeDashoffset = String(RING_LEN * (1 - fedCount / total));

  renderHero(fedCount, total);
}

function renderMe() {
  const btn = $("meBtn");
  btn.textContent = "";
  const av = document.createElement("span");
  av.className = "avatar";
  paintAvatar(av, state.name);
  btn.appendChild(av);
  btn.setAttribute("aria-label", state.name ? `You're ${state.name}. Switch person` : "Choose who you are");
}

// ---------- Toast ----------
let toastTimer = null, undoFn = null;
function toast(msg, undo) {
  $("toastMsg").textContent = msg;
  $("undo").hidden = !undo;
  undoFn = undo || null;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4500);
}
$("undo").addEventListener("click", () => {
  const f = undoFn;
  undoFn = null;
  $("toast").classList.remove("show");
  if (f) f();
});

// ---------- Writes ----------
const mealRef = (week, id) => doc(db, "weeks", week, "meals", id);

async function writeMeal(week, id, rec) {
  const batch = writeBatch(db);
  if (rec) batch.set(mealRef(week, id), rec);
  else batch.delete(mealRef(week, id));
  batch.set(doc(collection(db, "accessLogs")), {
    uid: state.uid,
    eventType: "meal_update",
    action: rec ? "marked_done" : "cleared",
    week,
    meal: id,
    name: state.name,
    occurredAt: serverTimestamp(),
  });
  await batch.commit();
}

async function getPublicIp() {
  const response = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
  if (!response.ok) throw new Error(`IP lookup failed with status ${response.status}`);
  const result = await response.json();
  if (typeof result.ip !== "string" || !result.ip.trim() || result.ip.length > 45) {
    throw new Error("IP lookup returned an invalid address");
  }
  return result.ip.trim();
}

async function recordAccess(user) {
  let ipAddress;
  try {
    ipAddress = await getPublicIp();
  } catch (e) {
    console.warn("Couldn't look up visitor IP; recording access without it", e);
  }

  const accessLog = {
    uid: user.uid,
    accessedAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 512),
    language: (navigator.language || "").slice(0, 100),
    timeZone: (Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 100),
  };
  if (ipAddress) accessLog.ipAddress = ipAddress;
  await addDoc(collection(db, "accessLogs"), accessLog);
}

function labelFor(id) {
  const [d, m] = id.split("-");
  return `${DAY_LONG[DAYS.findIndex((x) => x.toLowerCase() === d)]} ${m === "am" ? "breakfast" : "dinner"}`;
}

const busy = new Set();
let pendingToggle = null;
async function toggle(id) {
  if (!state.uid || busy.has(id)) return;
  if (!state.name) { pendingToggle = id; openWho(); return; }
  busy.add(id);
  haptic();
  const week = weekKey();
  const prev = state.meals[id] || null;
  const next = prev ? null : { name: state.name, by: state.uid, at: serverTimestamp() };
  if (next) state.justFed = id;
  try {
    // Firestore applies the write locally first, so the snapshot listener updates the UI instantly.
    await writeMeal(week, id, next);
    toast(next ? `${labelFor(id)} done` : `${labelFor(id)} cleared`, async () => {
      const restore = prev ? { name: prev.name, by: prev.by, at: Timestamp.fromDate(prev.at) } : null;
      try { await writeMeal(week, id, restore); } catch { toast("Couldn't undo. Tap the meal again."); }
    });
  } catch (e) {
    console.error(e);
    toast("Couldn't save. Check your connection.");
  } finally {
    busy.delete(id);
  }
}

// ---------- Reads ----------
function setSync(live, text) {
  $("syncDot").classList.toggle("live", live);
  $("syncText").textContent = text;
}

function subscribe() {
  if (state.unsub) state.unsub();
  state.meals = {};
  state.loaded = false;
  render();
  if (!state.uid) return;
  const week = weekKey();
  state.unsub = onSnapshot(collection(db, "weeks", week, "meals"), { includeMetadataChanges: true }, (snap) => {
    if (week !== weekKey()) return;
    const meals = {};
    snap.forEach((d) => {
      const v = d.data({ serverTimestamps: "estimate" });
      if (v && v.at) meals[d.id] = { name: v.name || "", by: v.by || "", at: v.at.toDate() };
    });
    state.meals = meals;
    state.loaded = true;
    const live = !snap.metadata.fromCache;
    setSync(live, live ? "Synced with the family" : "Offline · changes will sync");
    render();
  }, (err) => {
    console.error(err);
    setSync(false, "Couldn't load meals. Check the Firebase setup.");
  });
}

// ---------- Who's feeding ----------
function openWho() {
  const wrap = $("people");
  wrap.textContent = "";
  const tile = (label, coverHtml, cls, onPick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "person" + (cls ? " " + cls : "");
    const c = document.createElement("div");
    c.className = "cover";
    if (typeof coverHtml === "string") c.innerHTML = coverHtml; else c.appendChild(coverHtml);
    const nm = document.createElement("div");
    nm.className = "pname"; nm.textContent = label;
    b.append(c, nm);
    b.addEventListener("click", onPick);
    return b;
  };
  for (const p of FAMILY) {
    let cover;
    if (p.cover || p.photo) {
      cover = document.createElement("img");
      cover.src = p.cover || p.photo; cover.alt = ""; cover.decoding = "async";
    } else {
      cover = document.createElement("span");
      cover.className = "profile-icon";
      cover.textContent = p.icon || p.name.charAt(0).toUpperCase();
    }
    const t = tile(p.name, cover, familyMember(state.name) === p ? "selected" : "", () => pickName(p.name));
    t.querySelector(".cover").style.setProperty("--avatar-bg", colorFor(p.name));
    if (p.cover || p.photo) {
      const icon = document.createElement("span");
      icon.className = "profile-icon badge";
      icon.textContent = p.icon || p.name.charAt(0).toUpperCase();
      t.querySelector(".cover").appendChild(icon);
    }
    wrap.appendChild(t);
  }
  wrap.appendChild(tile("Someone else", "+", "someone", () => {
    $("otherRow").hidden = false;
    $("otherName").value = familyMember(state.name) ? "" : state.name;
    $("otherName").focus();
  }));
  $("otherRow").hidden = true;
  $("whoDialog").showModal();
}

function pickName(n) {
  state.name = n.trim().slice(0, 40);
  saveName(state.name);
  renderMe();
  render();
  $("whoDialog").close();
  if (pendingToggle) { const id = pendingToggle; pendingToggle = null; toggle(id); }
}

$("whoForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = $("otherName").value.trim();
  if (n) pickName(n);
});
$("whoDialog").addEventListener("close", () => { pendingToggle = null; });
// Tap on the dimmed backdrop closes the sheet.
$("whoDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$("meBtn").addEventListener("click", openWho);

// ---------- Navigation ----------
$("prev").addEventListener("click", () => { state.monday = addDays(state.monday, -7); subscribe(); });
$("next").addEventListener("click", () => {
  if (state.monday < state.thisMonday) { state.monday = addDays(state.monday, 7); subscribe(); }
});
$("toToday").addEventListener("click", () => { state.monday = state.thisMonday; subscribe(); });

// Keep "due" highlighting fresh and roll over to the new week while the page stays open.
function tick() {
  const m = mondayOf(new Date());
  if (ymd(m) !== ymd(state.thisMonday)) {
    const wasCurrent = isThisWeek();
    state.thisMonday = m;
    if (wasCurrent) { state.monday = m; subscribe(); return; }
  }
  render();
}
setInterval(tick, 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

// ---------- Boot ----------
render();
renderMe();
if (!state.name) openWho();

let accessLogRecorded = false;
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const first = !state.uid;
  state.uid = user.uid;
  if (first) subscribe();
  if (!accessLogRecorded) {
    accessLogRecorded = true;
    recordAccess(user).catch((e) => console.error("Couldn't record app access", e));
  }
});
signInAnonymously(auth).catch((e) => {
  console.error(e);
  setSync(false, "Couldn't connect. Is Anonymous sign-in enabled in Firebase?");
});
