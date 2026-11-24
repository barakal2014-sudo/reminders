// נוצר אוטומטית מתוך server/Code.gs (אותה לוגיקה בשרת, במחשב ובאייפון). לא לערוך ידנית.
var DAY_START = 7, DAY_END = 23;          // שעות פעילות
var CAL_MINUTES = 30;                     // משך אירוע ביומן
var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
var DAY_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
var COLS = ['id', 'text', 'due', 'anchor', 'status', 'repeat', 'created', 'updated', 'closedAt', 'prev', 'tg', 'notified'];
var NUMS = ['due', 'anchor', 'created', 'updated', 'closedAt', 'tg', 'notified'];

// ---------------------------------------------------------------- זמן
function at(d, h, m) { var x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; }
function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function pad(n) { return (n < 10 ? '0' : '') + n; }

function clampQuiet(ms) {
  var d = new Date(ms), h = d.getHours();
  if (h >= DAY_END) return at(addDays(d, 1), DAY_START).getTime();
  if (h < DAY_START) return at(d, DAY_START).getTime();
  return ms;
}

// מועדים מהירים (דחייה / יומן / החזרה)
function quick(key, now) {
  var n = new Date(now), t;
  switch (key) {
    case 'now': return now;
    case 'm1': return clampQuiet(now + 60000);
    case 'm5': return clampQuiet(now + 5 * 60000);
    case 'm10': return clampQuiet(now + 10 * 60000);
    case 'm30': return clampQuiet(now + 30 * 60000);
    case 'h1': return clampQuiet(now + 60 * 60000);
    case 'h3': return clampQuiet(now + 180 * 60000);
    case 'eve': t = at(n, 20); return (t.getTime() <= now ? addDays(t, 1) : t).getTime();
    case 'tom': return at(addDays(n, 1), DAY_START).getTime();
    case 'wk': return clampQuiet(addDays(n, 7).getTime());
    case 'c1': return Math.ceil((now + 60 * 60000) / 900000) * 900000;   // בעוד שעה, מעוגל לרבע שעה
    case 't16': t = at(n, 16); return (t.getTime() <= now ? addDays(t, 1) : t).getTime();
    case 'tom9': return at(addDays(n, 1), 9).getTime();
    case 'tom14': return at(addDays(n, 1), 14).getTime();
    case 'sun9': return at(addDays(n, ((7 - n.getDay()) % 7) || 7), 9).getTime();
  }
  return now;
}
var SNOOZE_KEYS = [['m1', 'דקה'], ['m5', '‏5 דקות'], ['m10', '‏10 דקות'], ['m30', '‏30 דקות'], ['h1', 'שעה'], ['h3', '‏3 שעות'], ['eve', 'הערב 20:00'], ['tom', 'מחר 7:00'], ['wk', 'בעוד שבוע']];
var CAL_KEYS = [['c1', 'בעוד שעה'], ['t16', '‏16:00'], ['tom9', 'מחר 9:00'], ['tom14', 'מחר 14:00'], ['sun9', "יום א' 9:00"]];

function nextOcc(anchor, repeat, after) {
  var d = new Date(anchor), h = d.getHours(), mi = d.getMinutes(), i, c;
  var iv = String(repeat).match(/^n(w|m)?:(\d+)(?::(\d+))?$/);
  if (iv) {                                       // כל N ימים / שבועות / חודשים
    var k = Math.max(1, Number(iv[2]));
    if (iv[1] === 'm') {
      var dm = iv[3] ? Number(iv[3]) : d.getDate(), yy = d.getFullYear(), mm = d.getMonth();
      for (i = 0; i < 600; i++) {
        mm += k;
        c = new Date(yy, mm, Math.min(dm, new Date(yy, mm + 1, 0).getDate()), h, mi);
        if (c.getTime() > after) return c.getTime();
      }
    }
    var step = k * (iv[1] === 'w' ? 7 : 1);
    for (i = 0; i < 5000; i++) { d = addDays(d, step); d.setHours(h, mi, 0, 0); if (d.getTime() > after) return d.getTime(); }
    return anchor + step * 864e5;
  }
  if (repeat.charAt(0) === 'm') {
    var dom = Number(repeat.slice(2)), y = d.getFullYear(), mo = d.getMonth();
    for (i = 0; i < 600; i++) {
      mo++;
      var last = new Date(y, mo + 1, 0).getDate();
      c = new Date(y, mo, Math.min(dom, last), h, mi);
      if (c.getTime() > after) return c.getTime();
    }
  }
  var set = repeat.charAt(0) === 'w' ? repeat.slice(2).split(',').map(Number) : null;
  for (i = 0; i < 5000; i++) {
    d = addDays(d, 1); d.setHours(h, mi, 0, 0);
    if (d.getTime() > after && (!set || set.indexOf(d.getDay()) >= 0)) return d.getTime();
  }
  return anchor + 864e5;
}

function fmt(ms, now) {
  var d = new Date(ms), n = new Date(now || Date.now());
  var t = pad(d.getHours()) + ':' + pad(d.getMinutes());
  var diff = Math.round((at(d, 0).getTime() - at(n, 0).getTime()) / 864e5);
  if (diff === 0) return 'היום ' + t;
  if (diff === 1) return 'מחר ' + t;
  return 'יום ' + DAY_SHORT[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + ' ' + t;
}
function fmtRepeat(r) {
  if (!r) return '';
  if (r === 'd') return 'כל יום';
  var iv = r.match(/^n(w|m)?:(\d+)(?::\d+)?$/);
  if (iv) {
    var k = Number(iv[2]), u = iv[1] || '';
    if (k === 2) return 'כל ' + { '': 'יומיים', w: 'שבועיים', m: 'חודשיים' }[u];
    return 'כל ' + k + ' ' + { '': 'ימים', w: 'שבועות', m: 'חודשים' }[u];
  }
  if (r.charAt(0) === 'w') return 'כל יום ' + r.slice(2).split(',').map(function (x) { return DAYS[Number(x)]; }).join(', ');
  return 'כל ' + r.slice(2) + ' לחודש';
}

// ---------------------------------------------------------------- פענוח טקסט חופשי
function parse(raw, now) {
  now = now || Date.now();
  var s = ' ' + String(raw).replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim().replace(/[\s.,!?;:]+$/, '') + ' ';   // הכתבה מוסיפה נקודה בסוף
  s = s.replace(/ (?:בכל|מדי) /g, ' כל ').replace(/ ב ?-? ?(\d)/g, ' ב-$1');
  var cut = function (re) { var m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
  var DAYRE = '(?:שלישי|שישי|ראשון|רביעי|חמישי|שבת|שני)';
  var repeat = '', date = null, wd = null, hour = null, minute = 0, rel = null, relMonths = 0, m;
  var n = new Date(now);

  cut(/^ (?:תזכורת|תזכיר לי|תזכירי לי|להזכיר לי|הזכר לי)\s?[:\-]? /);

  // --- חזרתיות
  var iv = null;
  if ((m = cut(/ כל (\d{1,3}) (ימים|יום|שבועות|שבוע|חודשים|חודש) /))) iv = [Number(m[1]), m[2].charAt(0)];
  else if ((m = cut(/ כל (יומיים|שבועיים|חודשיים) /))) iv = [2, m[1].charAt(0)];
  if (iv && iv[0] >= 1) {
    var u = iv[1] === 'י' ? '' : iv[1] === 'ש' ? 'w' : 'm';
    repeat = iv[0] === 1 ? (u === '' ? 'd' : u + ':?') : 'n' + u + ':' + iv[0];
  }
  else if ((m = cut(/ כל (?:ה-?)?(\d{1,2}) (?:ל|ב)חודש /)) || (m = cut(/ ב-?(\d{1,2}) לכל חודש /))) repeat = 'm:' + Number(m[1]);
  else if (cut(/ כל חודש /)) repeat = 'm:?';
  else if (cut(/ כל שבוע /)) repeat = 'w:?';
  else if ((m = cut(new RegExp(' כל (?:יום |ימי )?(' + DAYRE + '(?:(?:, ?| ו| )' + DAYRE + ')*) ')))) {
    var ds = m[1].match(new RegExp(DAYRE, 'g')).map(function (x) { return DAYS.indexOf(x); });
    ds = ds.filter(function (x, i) { return ds.indexOf(x) === i; }).sort();
    repeat = 'w:' + ds.join(',');
  }
  else if (cut(/ כל יום /)) repeat = 'd';
  else if (cut(/ כל בוקר /)) { repeat = 'd'; hour = 7; }
  else if (cut(/ כל ערב /)) { repeat = 'd'; hour = 20; }

  // --- זמן יחסי
  if ((m = cut(/ ב?עוד (\d+) (דקות|דקה|דק'?|שעות|שעה|ימים|יום|שבועות|שבוע) /))) {
    var u = m[2], k = Number(m[1]);
    rel = k * (u.indexOf('דק') === 0 ? 60000 : u.indexOf('שע') === 0 ? 3600000 : u.indexOf('שבוע') === 0 ? 7 * 864e5 : 864e5);
  } else if ((m = cut(/ ב?עוד (חצי שעה|רבע שעה|שעתיים|שעה|יומיים|שבועיים|שבוע|חודש|דקה) /))) {
    rel = { 'חצי שעה': 30 * 60000, 'רבע שעה': 15 * 60000, 'שעתיים': 2 * 3600000, 'שעה': 3600000, 'יומיים': 2 * 864e5, 'שבועיים': 14 * 864e5, 'שבוע': 7 * 864e5, 'דקה': 60000, 'חודש': 0 }[m[1]];
    if (m[1] === 'חודש') relMonths = 1;
  }

  // --- שעה מפורשת
  if ((m = cut(/ (?:בשעה |ב-?|עד )?(\d{1,2}):(\d{2}) /)) && Number(m[1]) < 24 && Number(m[2]) < 60) { hour = Number(m[1]); minute = Number(m[2]); }
  else if ((m = cut(/ בשעה (\d{1,2})(?:\.(\d{2}))? /)) && Number(m[1]) < 24) { hour = Number(m[1]); minute = Number(m[2] || 0); }

  // --- תאריך
  if (cut(/ היום /)) date = at(n, 0);
  else if (cut(/ מחרתיים /)) date = at(addDays(n, 2), 0);
  else if (cut(/ מחר /)) date = at(addDays(n, 1), 0);
  else if ((m = s.match(/ (?:ב-?)?(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))? /)) && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    s = s.replace(m[0], ' ');
    var y = m[3] ? Number(m[3]) : n.getFullYear();
    if (y < 100) y += 2000;
    date = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && date.getTime() < at(n, 0).getTime()) date = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
  }
  else if ((m = cut(new RegExp(' (?:ביום |יום |ב)(' + DAYRE + ') ')))) wd = DAYS.indexOf(m[1]);
  else if ((m = cut(/ ב?יום ([אבגדהו])'? /))) wd = 'אבגדהו'.indexOf(m[1]);

  // --- שעה קצרה ("ב-9") וחלקי יום
  var bare = false;
  if (hour === null && (m = s.match(/ ב-?(\d{1,2}) /)) && Number(m[1]) < 24) { s = s.replace(m[0], ' '); hour = Number(m[1]); bare = true; }
  var part = null;
  if (cut(/ (?:אחר הצהריים|אחרי הצהריים|אחה"צ|אחה״צ|אחהצ) /)) part = 'pm';
  else if (cut(/ בבוקר /)) part = 'am';
  else if (cut(/ בצהריים /)) part = 'noon';
  else if (cut(/ בערב /)) part = 'eve';
  else if (cut(/ בלילה /)) part = 'night';
  if (part) {
    if (hour === null) hour = { am: 7, noon: 12, pm: 16, eve: 20, night: 22 }[part];
    else if (hour < 12 && (part === 'pm' || part === 'eve' || (part === 'night' && hour >= 6) || (part === 'noon' && hour <= 4))) hour += 12;
  } else if (bare && hour >= 1 && hour < DAY_START) hour += 12;   // "ב-4" = 16:00

  // --- חישוב המועד
  var due, found = true;
  if (rel !== null) {
    if (relMonths) { var x = new Date(now); x.setMonth(x.getMonth() + 1); due = x.getTime(); }
    else due = now + rel;
  } else if (!date && wd === null && hour === null && !repeat) {
    found = false; due = clampQuiet(now + 3600000);
  } else {
    var hh = hour === null ? DAY_START : hour, d;
    if (date) {
      d = at(date, hh, minute);
      if (d.getTime() <= now && hour === null) d = new Date(clampQuiet(now + 3600000));   // "היום" בלי שעה
    } else if (wd !== null) {
      d = at(addDays(n, (wd - n.getDay() + 7) % 7), hh, minute);
      if (d.getTime() <= now) d = addDays(d, 7);
    } else if (repeat.charAt(0) === 'w' && repeat !== 'w:?') {
      var set = repeat.slice(2).split(',').map(Number);
      for (var i = 0; i < 8; i++) { d = addDays(at(n, hh, minute), i); if (d.getTime() > now && set.indexOf(d.getDay()) >= 0) break; }
    } else if (repeat.charAt(0) === 'm' && repeat !== 'm:?') {
      var dom = Number(repeat.slice(2));
      for (var j = 0; j < 3; j++) {
        var last = new Date(n.getFullYear(), n.getMonth() + j + 1, 0).getDate();
        d = new Date(n.getFullYear(), n.getMonth() + j, Math.min(dom, last), hh, minute);
        if (d.getTime() > now) break;
      }
    } else {
      d = at(n, hh, minute);
      if (d.getTime() <= now) d = addDays(d, 1);
    }
    due = d.getTime();
  }
  if (repeat === 'w:?') repeat = 'w:' + new Date(due).getDay();
  if (repeat === 'm:?') repeat = 'm:' + new Date(due).getDate();
  if (/^nm:\d+$/.test(repeat)) repeat += ':' + new Date(due).getDate();

  var text = s.replace(/\s+/g, ' ').trim().replace(/^[\-,:.]+\s*/, '').replace(/\s*[\-,:]+$/, '');
  return { text: text || 'תזכורת', due: due, repeat: repeat, found: found };
}

// ---------------------------------------------------------------- לוגיקת פעולות (זהה לזו שבאפליקציית המחשב)
function applyAction(db, a) {
  var ts = a.ts || Date.now(), it;
  if (a.a === 'add') {
    if (db[a.id]) return null;
    it = { id: a.id, text: a.text, due: a.due, anchor: a.due, status: 'open', repeat: a.repeat || '', created: ts, updated: ts, closedAt: 0, prev: '', tg: 0, notified: 0, _d: true };
    db[a.id] = it; return it;
  }
  it = db[a.id];
  if (!it) return null;
  if (a.a === 'undo') {
    if (!it.prev) return null;
    var p = JSON.parse(it.prev);
    if (p.hist && db[p.hist]) { db[p.hist].status = 'deleted'; db[p.hist].updated = ts; db[p.hist]._d = true; }
    it.due = p.due; it.anchor = p.anchor; it.status = p.status; it.closedAt = p.closedAt;
    it.prev = ''; it.updated = ts; it._d = true; return it;
  }
  if (a.a === 'edit') { it.text = a.text; it.updated = ts; it._d = true; return it; }
  if (a.a === 'mail' || a.a === 'cal') {           // מייל / יומן: התזכורת נשארת פתוחה. רק "בוצע" מעביר להיסטוריה
    if (it.status !== 'open') return null;
    it.updated = ts; it._d = true; return it;
  }
  var prev = { due: it.due, anchor: it.anchor, status: it.status, closedAt: it.closedAt };
  if (a.a === 'done') {
    if (it.status !== 'open') return null;
    if (it.repeat) {
      var hid = it.id + '-' + ts.toString(36), h = {};
      for (var k in it) if (k.charAt(0) !== '_') h[k] = it[k];
      h.id = hid; h.repeat = ''; h.status = a.a; h.closedAt = ts; h.updated = ts; h.prev = ''; h.tg = 0; h._d = true;
      db[hid] = h; prev.hist = hid;
      it.anchor = nextOcc(it.anchor, it.repeat, Math.max(ts, it.anchor)); it.due = it.anchor;
    } else { it.status = a.a; it.closedAt = ts; }
  } else if (a.a === 'snooze') {
    if (it.status !== 'open') return null;
    it.due = a.due;
  } else if (a.a === 'restore') {
    it.status = 'open'; it.due = a.due; it.anchor = a.due; it.closedAt = 0;
  } else if (a.a === 'del') {
    it.status = 'deleted'; it.closedAt = ts;
  } else if (a.a === 'purge') {                    // מחיקה מההיסטוריה
    if (it.status === 'open') return null;
    it.status = 'purged';
  } else return null;
  it.prev = JSON.stringify(prev); it.updated = ts; it._d = true;
  return it;
}

