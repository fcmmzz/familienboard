/* =====================================================================================
   FAMILIENBOARD – Daten-Skript (Google Apps Script)
   Teilt Notizzettel und Essensplan zwischen iPad-Board und Handy (handy.html).
   Die Daten liegen in den Skript-Eigenschaften eures Google-Kontos, nicht im Repo.
   Die Termine kommen weiter aus eurem eigenen Kalender-Skript (Kalender-Link im Zahnrad).
   Dieses Skript hat KEINEN Zugriff auf Kalender, Mails oder Dateien.

   EINRICHTEN (am besten am Rechner, einmalig):
   1. script.google.com → „Neues Projekt“ → Name „Familienboard Daten“.
   2. Den Inhalt dieser Datei komplett hineinkopieren und speichern.
   3. Oben die Funktion „einrichten“ wählen → „Ausführen“ → Zugriff erlauben
      („Google hat diese App nicht überprüft“ → „Erweitert“ → „Zu Familienboard Daten wechseln“).
      Im Ausführungsprotokoll steht danach euer SCHLÜSSEL.
   4. „Bereitstellen“ → „Neue Bereitstellung“ → Typ „Web-App“
      Ausführen als: „Ich“ · Zugriff: „Jeder“ → „Bereitstellen“ → Web-App-URL kopieren.
   5. Daten-Link = Web-App-URL + ?k=SCHLÜSSEL
      (z. B. https://script.google.com/macros/s/AKfy…/exec?k=3f9a…)
   6. iPad: Board → Zahnrad → „Daten-Link“ einfügen → Speichern. Das Feld „Kalender-Link“
      bleibt, wie es ist (euer Kalender-Skript).
      Im Zahnrad steht dann auch der fertige Handy-Link.
   Skript später geändert? „Bereitstellen“ → „Bereitstellungen verwalten“ → Stift → Version „Neu“.
   Zeitzone: Projekteinstellungen (Zahnrad links) → „Europe/Berlin“.

   Wer den Daten-Link kennt, kann den Notizzettel lesen und ändern – also nicht weitergeben.
   Neuer Schlüssel (alter Link wird ungültig): Funktion „neuerSchluessel“ ausführen.
   ===================================================================================== */

var P = PropertiesService.getScriptProperties();
var TEIL = 4000;   // Zeichen pro Eigenschaft (Google erlaubt ca. 9 KB je Wert)

function einrichten() {
  var k = P.getProperty('KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); P.setProperty('KEY', k); }
  Logger.log('SCHLÜSSEL: ' + k);
  Logger.log('Daten-Link = Web-App-URL + ?k=' + k);
}
function neuerSchluessel() { P.deleteProperty('KEY'); einrichten(); }

function laden_() {
  var n = +(P.getProperty('STATE_N') || 0), s = '';
  for (var i = 0; i < n; i++) s += P.getProperty('STATE_' + i) || '';
  try { var st = JSON.parse(s); if (st && st.notes && st.dinners) return st; } catch (e) {}
  return { notes: [], dinners: {}, rev: 0 };
}
function speichern_(st) {
  var s = JSON.stringify(st), o = {}, n = Math.ceil(s.length / TEIL), alt = +(P.getProperty('STATE_N') || 0);
  for (var i = 0; i < n; i++) o['STATE_' + i] = s.substr(i * TEIL, TEIL);
  o.STATE_N = String(n);
  P.setProperties(o);
  for (var j = n; j < alt; j++) P.deleteProperty('STATE_' + j);
}
function heute_() { return Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd'); }
function minusTage_(key, t) { var d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - t); return d.toISOString().slice(0, 10); }

// Gleiche Logik wie im Board und in handy.html
function applyOp(st, o) {
  var t = String(o.text || '').trim().slice(0, 200);
  if (o.op === 'add') { if (t && !st.notes.some(function (x) { return x.id === o.id; })) st.notes.unshift({ id: String(o.id).slice(0, 40), text: t, done: false }); }
  else if (o.op === 'toggle') st.notes.forEach(function (x) { if (x.id === o.id) { x.done = !!o.done; x.doneAt = o.done ? Date.now() : 0; } });
  else if (o.op === 'del') st.notes = st.notes.filter(function (x) { return x.id !== o.id; });
  else if (o.op === 'clear') st.notes = st.notes.filter(function (x) { return !x.done; });
  else if (o.op === 'dinner' && /^\d{4}-\d\d-\d\d$/.test(o.key)) { if (t) st.dinners[o.key] = t; else delete st.dinners[o.key]; }
}
function aufraeumen_(st) {   // Erledigtes nach 12 Stunden, Essen nach 14 Tagen, höchstens 150 Notizen
  var grenze = Date.now() - 12 * 3600e3, alt = minusTage_(heute_(), 14);
  st.notes = st.notes.filter(function (x) { return !x.done || x.doneAt > grenze; }).slice(0, 150);
  Object.keys(st.dinners).forEach(function (k) { if (k < alt) delete st.dinners[k]; });
}

function antwort_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function erlaubt_(e) { var k = P.getProperty('KEY'); return !!k && !!e && !!e.parameter && e.parameter.k === k; }
function stand_(st) { return { ok: true, rev: st.rev, notes: st.notes, dinners: st.dinners }; }

function doGet(e) {
  if (!erlaubt_(e)) return antwort_({ ok: false, error: 'Schlüssel falsch' });
  if (e.parameter.format === 'json') return antwort_({ ok: false, error: 'Das ist der Daten-Link – Termine kommen über den Kalender-Link.' });
  var st = laden_(); aufraeumen_(st);
  return antwort_(stand_(st));
}

function doPost(e) {
  if (!erlaubt_(e)) return antwort_({ ok: false, error: 'Schlüssel falsch' });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var body = {};
    try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (x) {}
    var st = laden_();
    (body.ops || []).slice(0, 300).forEach(function (o) { if (o && typeof o === 'object') applyOp(st, o); });
    aufraeumen_(st); st.rev = (st.rev || 0) + 1; speichern_(st);
    return antwort_(stand_(st));
  } finally { lock.releaseLock(); }
}
