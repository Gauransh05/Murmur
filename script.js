const $ = s => document.querySelector(s);
const KEY = 'murmur-v1';
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const NUM = {one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, to:2, too:2};

let tasks = [], filter = 'all', lastRemoved = null;
try {
  const r = JSON.parse(localStorage.getItem(KEY));
  if (!Array.isArray(r)) throw 0;
  tasks = r;
} catch (e) {
  tasks = [{id:1, text:'Buy oat milk', done:false}, {id:2, text:'Call the dentist', done:false}, {id:3, text:'Book train tickets', done:true}];
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (e) {} };

/* ---------- Task helpers ---------- */
function add(text) { tasks.push({id:Math.max(0, ...tasks.map(t => t.id)) + 1, text, done:false}); }
function remove(t) { lastRemoved = {t, i:tasks.indexOf(t)}; tasks = tasks.filter(x => x !== t); }
// Find a task by its list number ("2", "two") or by words from its text
function find(s) {
  s = s.trim().replace(/^(?:task|number|item|no\.?|#)\s*/, '');
  if (!s) return;
  const n = /^\d+$/.test(s) ? +s : NUM[s];
  return n ? tasks[n - 1] : tasks.find(t => t.text.toLowerCase().includes(s));
}
const missing = s => `I couldn’t find “${s.trim()}”.`;

/* ---------- Command parser (voice transcript in, message out) ---------- */
function run(raw) {
  const q = raw.trim().replace(/[.!?]+$/, '');
  const l = q.toLowerCase().replace(/’/g, "'");
  let m, t;
  if (m = l.match(/^(?:add task|add|create|new task|remind me to|remember to)\s+(.+)$/)) {
    const text = cap(q.slice(q.length - m[1].length));
    add(text);
    return `Added “${text}”.`;
  }
  if (/^(?:clear|delete|remove)\s+(?:all\s+)?(?:completed|done|finished)(?:\s+tasks)?$/.test(l)) {
    const n = tasks.filter(x => x.done).length;
    tasks = tasks.filter(x => !x.done);
    return n ? `Cleared ${n} finished task${n > 1 ? 's' : ''}.` : 'No finished tasks to clear.';
  }
  if (l === 'undo') {
    if (!lastRemoved) return 'Nothing to undo.';
    tasks.splice(Math.min(lastRemoved.i, tasks.length), 0, lastRemoved.t);
    t = lastRemoved.t; lastRemoved = null;
    return `Brought back “${t.text}”.`;
  }
  if (m = l.match(/^(?:undo|uncheck|reopen)\s+(.+)$/)) {
    if (!(t = find(m[1]))) return missing(m[1]);
    t.done = false;
    return `Reopened “${t.text}”.`;
  }
  if (m = l.match(/^(?:done|complete|completed|finish|finished|check|tick)\s+(?:off\s+)?(.+)$/)) {
    if (!(t = find(m[1]))) return missing(m[1]);
    t.done = true;
    return `Marked “${t.text}” as done.`;
  }
  if (m = l.match(/^(?:delete|remove|cancel)\s+(.+)$/)) {
    if (!(t = find(m[1]))) return missing(m[1]);
    remove(t);
    return `Deleted “${t.text}”. Say “undo” to bring it back.`;
  }
  if (m = l.match(/^show\s+(?:me\s+)?(all|everything|active|remaining|open|completed|done|finished)/)) {
    filter = /^(?:all|everything)$/.test(m[1]) ? 'all' : /^(?:active|remaining|open)$/.test(m[1]) ? 'active' : 'done';
    return `Showing ${filter === 'all' ? 'all tasks' : filter === 'active' ? 'active tasks' : 'finished tasks'}.`;
  }
  if (/^(?:read|list)\b|^what(?:'s| is) (?:left|next|on my list)/.test(l)) {
    const left = tasks.filter(x => !x.done);
    const out = left.length
      ? `You have ${left.length} task${left.length > 1 ? 's' : ''} left: ` + left.map(x => x.text).join(', ') + '.'
      : 'You have nothing left to do.';
    speak(out);
    return out;
  }
  return `Sorry, I didn’t catch a command in “${q}”. Try “add buy milk”.`;
}

function speak(text) {
  try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch (e) {}
}

/* ---------- Render ---------- */
function render() {
  const count = {all:tasks.length, active:tasks.filter(t => !t.done).length, done:tasks.filter(t => t.done).length};
  document.querySelectorAll('[data-f]').forEach(b => {
    b.textContent = `${cap(b.dataset.f)} ${count[b.dataset.f]}`;
    b.setAttribute('aria-pressed', b.dataset.f === filter);
  });
  const rows = tasks.map((t, i) => ({t, i})).filter(({t}) => filter === 'all' || (filter === 'done') === t.done);
  $('#list').innerHTML = rows.map(({t, i}) => `<li class="${t.done ? 'done' : ''}">
    <span class="num">${i + 1}</span>
    <button class="chk" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${esc(t.text)}, ${t.done ? 'done' : 'not done'}"></button>
    <span class="txt">${esc(t.text)}</span>
    <button class="del" data-id="${t.id}" aria-label="Delete ${esc(t.text)}">×</button></li>`).join('');
  const e = $('#empty');
  e.hidden = rows.length > 0;
  e.textContent = tasks.length ? 'Nothing in this view.' : 'No tasks yet. Tap the mic and say “add buy milk”.';
}
function apply(message) { save(); render(); if (message) $('#msg').textContent = message; }

/* ---------- Voice input (Web Speech API) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#mic');
let rec = null, listening = false;

const ERRORS = {
  'not-allowed': 'Microphone access is blocked here. Allow it in your browser settings, or open the downloaded copy of the app.',
  'service-not-allowed': 'Microphone access is blocked here. Allow it in your browser settings, or open the downloaded copy of the app.',
  'no-speech': 'I didn’t hear anything. Tap the mic and try again.',
  'audio-capture': 'No microphone was found.',
  'network': 'The speech service can’t be reached. Check your connection.'
};

function toggleMic() {
  if (!SR) { $('#msg').textContent = 'Voice commands need Chrome, Edge or Safari. You can still type tasks.'; return; }
  if (listening) { rec.stop(); return; }
  rec = new SR();
  rec.lang = /^en/i.test(navigator.language) ? navigator.language : 'en-US';   // commands are in English
  rec.interimResults = true;
  let handled = false;
  rec.onstart = () => {
    listening = true; mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true');
    $('#heard').textContent = ''; $('#msg').textContent = 'Listening…';
  };
  rec.onresult = e => {
    const text = [...e.results].map(r => r[0].transcript).join(' ').trim();
    $('#heard').textContent = `“${text}”`;
    if (e.results[e.results.length - 1].isFinal && !handled) { handled = true; apply(run(text)); }
  };
  rec.onerror = e => { $('#msg').textContent = ERRORS[e.error] || `Voice error: ${e.error}.`; };
  rec.onend = () => { listening = false; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); };
  try { rec.start(); } catch (e) {}
}

/* ---------- Events ---------- */
mic.onclick = toggleMic;
$('#form').onsubmit = e => {
  e.preventDefault();
  const text = $('#in').value.trim();
  if (!text) return;
  add(cap(text)); $('#in').value = '';
  apply(`Added “${cap(text)}”.`);
};
$('#list').onclick = e => {
  const b = e.target.closest('[data-id]');
  const t = b && tasks.find(x => x.id === +b.dataset.id);
  if (!t) return;
  if (b.classList.contains('del')) { remove(t); apply(`Deleted “${t.text}”. Say “undo” to bring it back.`); }
  else { t.done = !t.done; apply(); }
};
document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });

$('#msg').textContent = SR ? 'Tap the mic and say “add buy milk”.' : 'Voice isn’t supported in this browser, but you can still type tasks.';
render();
