import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MEALS = [{ key: "am", name: "Breakfast" }, { key: "pm", name: "Dinner" }];
const DINNER_FROM_HOUR = 15; // before 3pm the "current" meal is breakfast
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
const NAME_KEY = "ardy.name";

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

const state = {
  thisMonday: mondayOf(new Date()),
  monday: mondayOf(new Date()),
  meals: {},        // "mon-am" -> { name, by, at: Date }
  loaded: false,
  uid: null,
  name: readName(),
  unsub: null,
};

function readName() { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } }
function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } }

const weekKey = () => ymd(state.monday);
const isThisWeek = () => weekKey() === ymd(state.thisMonday);

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Rendering ----------
function currentSlot() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Mon
  if (dow > 4) return null;
  return { day: dow, meal: now.getHours() < DINNER_FROM_HOUR ? 0 : 1 };
}

function whoLabel(rec) {
  const who = rec.by === state.uid ? "You" : (rec.name || "Someone");
  return `${who} · ${fmtTime(rec.at)}`;
}

function render() {
  const slot = isThisWeek() ? currentSlot() : null;
  const todayIdx = isThisWeek() ? (new Date().getDay() + 6) % 7 : -1;
  const now = new Date();
  const fri = addDays(state.monday, 4);

  $("range").textContent = isThisWeek() ? "This week" : `${fmtShort(state.monday)} – ${fmtShort(fri)}`;
  $("toToday").hidden = isThisWeek();
  $("next").disabled = state.monday >= state.thisMonday;

  const days = $("days");
  days.textContent = "";
  DAYS.forEach((dname, di) => {
    const date = addDays(state.monday, di);
    const row = document.createElement("div");
    row.className = "day" + (di === todayIdx ? " is-today" : "");

    const lab = document.createElement("div");
    lab.className = "dlabel";
    const b = document.createElement("b");
    b.textContent = dname;
    const s = document.createElement("span");
    s.textContent = fmtShort(date);
    lab.append(b, s);
    row.appendChild(lab);

    MEALS.forEach((m, mi) => {
      const id = `${dname.toLowerCase()}-${m.key}`;
      const rec = state.meals[id];
      const isFuture = date > now && di !== todayIdx;
      const isDue = !rec && slot && (di < slot.day || (di === slot.day && mi <= slot.meal));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "meal" + (rec ? " fed" : "") + (isDue ? " due" : "") + (!rec && isFuture ? " future" : "");
      btn.disabled = !state.loaded || !state.uid;
      btn.setAttribute("aria-pressed", rec ? "true" : "false");
      btn.setAttribute("aria-label", `${dname} ${m.name}: ${rec ? "fed" : "not fed"}`);
      btn.innerHTML = `<div class="top"><span class="name"></span><span class="check">${CHECK}</span></div><div class="who"></div>`;
      btn.querySelector(".name").textContent = m.name;
      btn.querySelector(".who").textContent = rec ? whoLabel(rec) : (isDue ? "Not fed yet" : (isFuture ? "" : "Not fed"));
      btn.addEventListener("click", () => toggle(id, `${dname} ${m.name.toLowerCase()}`));
      row.appendChild(btn);
    });
    days.appendChild(row);
  });

  const total = DAYS.length * MEALS.length;
  const fedCount = Object.keys(state.meals).length;
  $("count").textContent = `${fedCount} / ${total}`;
  $("bar").style.width = `${(fedCount / total) * 100}%`;

  const title = $("statusTitle"), sub = $("statusSub"), eb = $("statusEyebrow");
  if (!state.loaded) return;
  if (!isThisWeek()) {
    eb.textContent = "Past week";
    title.textContent = `Ardy got ${fedCount} of ${total} meals`;
    sub.textContent = `${fmtShort(state.monday)} – ${fmtShort(fri)}`;
  } else if (!slot) {
    eb.textContent = "Weekend";
    title.textContent = "No tracking on the weekend";
    sub.textContent = `This week Ardy got ${fedCount} of ${total} meals.`;
  } else {
    const id = `${DAYS[slot.day].toLowerCase()}-${MEALS[slot.meal].key}`;
    const rec = state.meals[id];
    const meal = MEALS[slot.meal].name.toLowerCase();
    eb.textContent = `${DAYS[slot.day]} ${meal}`;
    title.innerHTML = rec ? "Ardy has been <em>fed</em>" : "Ardy has <strong>not been fed</strong> yet";
    sub.textContent = rec
      ? `${rec.by === state.uid ? "You" : (rec.name || "Someone")} fed him at ${fmtTime(rec.at)}.`
      : `Tap ${DAYS[slot.day]} ${meal} below once he's eaten.`;
  }
}

function renderMe() {
  const btn = $("meBtn");
  btn.hidden = !state.name;
  btn.textContent = (state.name || "?").trim().charAt(0).toUpperCase();
  btn.title = state.name ? `You're ${state.name}. Tap to change.` : "";
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
  if (rec) await setDoc(mealRef(week, id), rec);
  else await deleteDoc(mealRef(week, id));
}

const busy = new Set();
async function toggle(id, label) {
  if (!state.uid || busy.has(id)) return;
  if (!state.name) { askName(); return; }
  busy.add(id);
  const week = weekKey();
  const prev = state.meals[id] || null;
  const next = prev ? null : { name: state.name, by: state.uid, at: serverTimestamp() };
  try {
    // Firestore applies the write locally first, so the snapshot listener updates the UI instantly.
    await writeMeal(week, id, next);
    toast(next ? `Marked ${label} as fed` : `Cleared ${label}`, async () => {
      const restore = prev ? { name: prev.name, by: prev.by, at: Timestamp.fromDate(prev.at) } : null;
      try { await writeMeal(week, id, restore); } catch { toast("Couldn't undo. Tap the meal again."); }
    });
  } catch (e) {
    console.error(e);
    toast("Couldn't save. Check your connection and try again.");
  } finally {
    busy.delete(id);
  }
}

// ---------- Reads ----------
function setSync(live, text) {
  $("sync").classList.toggle("live", live);
  $("sync").querySelector("span").textContent = text || (live ? "Live" : "Offline");
}

function subscribe() {
  if (state.unsub) state.unsub();
  state.meals = {};
  state.loaded = false;
  render();
  if (!state.uid) return;
  const week = weekKey();
  state.unsub = onSnapshot(collection(db, "weeks", week, "meals"), (snap) => {
    if (week !== weekKey()) return;
    const meals = {};
    snap.forEach((d) => {
      const v = d.data({ serverTimestamps: "estimate" });
      if (v && v.at) meals[d.id] = { name: v.name || "", by: v.by || "", at: v.at.toDate() };
    });
    state.meals = meals;
    state.loaded = true;
    setSync(!snap.metadata.fromCache, snap.metadata.fromCache ? "Offline" : "Live");
    render();
  }, (err) => {
    console.error(err);
    setSync(false, "Offline");
    $("note").textContent = "Couldn't load meals. Check the Firebase setup in firebase-config.js.";
  });
}

// ---------- Name ----------
function askName() {
  $("nameInput").value = state.name;
  $("nameDialog").showModal();
  $("nameInput").focus();
}
$("nameForm").addEventListener("submit", (e) => {
  const n = $("nameInput").value.trim().slice(0, 40);
  if (!n) { e.preventDefault(); return; }
  state.name = n;
  saveName(n);
  renderMe();
});
$("meBtn").addEventListener("click", askName);

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
if (!state.name) askName();

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const first = !state.uid;
  state.uid = user.uid;
  if (first) subscribe();
});
signInAnonymously(auth).catch((e) => {
  console.error(e);
  setSync(false, "Not connected");
  $("note").textContent = "Couldn't connect. Enable Anonymous sign-in in Firebase and check firebase-config.js.";
});
