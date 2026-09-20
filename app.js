// RFP 2026 attendee site. Plain JavaScript, no build step.
import { drawInvite, loadFonts } from './invite-draw.js';
const C = window.RFP_CONFIG;

const DISHES = [
  { id: 'Side', label: 'A side', hint: 'Mac and cheese, slaw, beans, cornbread...' },
  { id: 'Dessert', label: 'A dessert', hint: 'Cookies, bars, pie...' },
  { id: 'Appetizer', label: 'An app', hint: 'Dips, veggie tray, deviled eggs...' },
  { id: 'Drinks', label: 'Drinks', hint: 'Wine, mixers, something fun...' },
  { id: 'Other', label: 'Something else', hint: 'Surprise us!' },
];
const dishLabel = (id) => (DISHES.find((d) => d.id === id) || {}).label || id;
const dishPlural = { Side: 'Sides', Dessert: 'Desserts', Appetizer: 'Apps', Drinks: 'Drinks', Other: 'Other' };

// ---------- tiny helpers ----------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = !!v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}
const root = document.getElementById('rsvp');

// ---------- calendar ----------
const stamp = (iso) => iso.replace(/[-:]/g, '') + (iso.length === 16 ? '00' : '');
let EVENT = C.event; // replaced by the published invite's event details once they load
function icsText() {
  const e = EVENT;
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RFP 2026//EN', 'BEGIN:VEVENT', 'UID:rfp-2026@preston-village',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), 'DTSTART:' + stamp(e.start), 'DTEND:' + stamp(e.end),
    'SUMMARY:' + esc(e.title), 'LOCATION:' + esc(e.place), 'DESCRIPTION:' + esc(e.details), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
document.getElementById('icsBtn').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([icsText()], { type: 'text/calendar' }));
  const a = el('a', { href: url, download: 'rfp-2026.ics' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
});
function applyInvite(doc) {
  const section = document.getElementById('invite');
  if (!doc || !doc.invite) { section.hidden = true; return; }
  EVENT = { ...C.event, ...doc.event };
  const inv = doc.invite;
  const canvas = document.getElementById('inviteCanvas');
  const plain = [inv.preLine, inv.script + ' ' + inv.title, inv.dateLine + ' ' + inv.timeLine, inv.location, inv.note]
    .join('. ').replace(/\s*\n\s*/g, ' ');
  canvas.setAttribute('aria-label', 'Invitation. ' + plain);
  document.getElementById('factsWhen').textContent = (doc.facts && doc.facts.when) || '';
  document.getElementById('factsWhere').textContent = (doc.facts && doc.facts.where) || EVENT.place || '';
  document.getElementById('gcalLink').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(EVENT.title) + '&dates=' + stamp(EVENT.start) + '/' + stamp(EVENT.end)
    + '&location=' + encodeURIComponent(EVENT.place) + '&details=' + encodeURIComponent(EVENT.details);
  section.hidden = false;
  loadFonts().then(() => drawInvite(canvas, inv));
}

// ---------- talking to the RSVP sheet ----------
const params = new URLSearchParams(location.search);
let token = (params.get('g') || '').trim();
try {
  if (token) localStorage.setItem('rfp26-token', token);
  else token = localStorage.getItem('rfp26-token') || '';
} catch { /* storage can be blocked; the link still works */ }

async function call(body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    // Plain-text POST body avoids a CORS preflight, which Apps Script cannot answer.
    const res = body
      ? await fetch(C.api, { method: 'POST', body: JSON.stringify({ ...body, g: token }), signal: ctl.signal })
      : await fetch(`${C.api}?g=${encodeURIComponent(token)}`, { signal: ctl.signal });
    return await res.json();
  } finally { clearTimeout(timer); }
}

// ---------- state + rendering ----------
const S = { phase: 'loading', data: null, mode: 'choose', draft: null, sending: false, error: '' };

function setData(d) {
  S.data = d; S.phase = 'ready'; S.error = '';
  S.mode = d.rsvp ? 'done' : 'choose';
  applyInvite(d.invite);
}

async function load() {
  if (!token) { S.phase = 'nolink'; return render(); }
  S.phase = 'loading'; render();
  try {
    const d = await call();
    if (d.ok) setData(d);
    else S.phase = d.error === 'unknown_token' ? 'unknown' : 'error';
  } catch { S.phase = 'error'; }
  render();
}

async function submit() {
  const d = S.draft;
  S.sending = true; S.error = ''; render();
  try {
    const r = await call({ action: 'rsvp', response: d.response, people: d.people, dishType: d.dishType, dish: d.dish, note: d.note });
    if (!r.ok) throw new Error(r.error);
    setData(r);
    window.scrollTo({ top: root.offsetTop - 12, behavior: 'smooth' });
  } catch (e) {
    S.error = e && e.message === 'preview_only'
      ? 'This is just a preview, so nothing was saved. Each guest gets their own link to RSVP.'
      : 'Hmm, that did not go through. Please check your connection and try again. Your answers are still here.';
  }
  S.sending = false; render();
}

function startYes() {
  const r = S.data.rsvp;
  S.draft = {
    response: 'yes',
    people: r && r.response === 'yes' ? r.people : S.data.guest.max,
    dishType: r && r.response === 'yes' ? r.dishType : '',
    dish: r && r.response === 'yes' ? r.dish : '',
    note: r ? r.note : '',
  };
  S.mode = 'form'; S.error = ''; render();
}
function startNo() {
  const r = S.data.rsvp;
  S.draft = { response: 'no', people: 0, dishType: '', dish: '', note: r ? r.note : '' };
  S.mode = 'form'; S.error = ''; render();
}

function render() {
  const v = view();
  if (S.phase === 'ready' && S.data && S.data.preview) {
    root.replaceChildren(el('p', { class: 'fine', role: 'note' }, 'Preview: this is how guests see the invite. RSVPs are turned off on this link.'), v);
  } else root.replaceChildren(v);
}

function view() {
  if (S.phase === 'loading') return el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Loading your RSVP...'));
  if (S.phase === 'nolink') {
    return el('div', { class: 'card' },
      el('h2', {}, 'Ready to RSVP?'),
      el('p', {}, 'Use the personal link we texted you. It knows who you are, so there is nothing to type in.'),
      el('p', { class: 'muted' }, 'Can\'t find it? Text Chris or Lauren and we will send it again.'));
  }
  if (S.phase === 'unknown') {
    return el('div', { class: 'card' },
      el('h2', {}, 'Hmm, that link looks off'),
      el('p', {}, 'We could not match it to an invitation. It may have been cut off when it was copied.'),
      el('p', { class: 'muted' }, 'Text Chris or Lauren and we will send you a fresh one.'));
  }
  if (S.phase === 'error') {
    return el('div', { class: 'card' },
      el('h2', {}, 'We could not load your RSVP'),
      el('p', {}, 'Please check your connection and try again.'),
      el('button', { class: 'btn', type: 'button', onclick: load }, 'Try again'));
  }
  const g = S.data.guest;
  if (S.mode === 'choose') return chooseView(g);
  if (S.mode === 'form') return formView(g);
  return doneView(g);
}

function chooseView(g) {
  return el('div', { class: 'card' },
    el('h2', {}, `Hi ${g.greeting}!`),
    el('p', { class: 'lead' }, 'Will you be joining us for the roast?'),
    el('div', { class: 'choices' },
      el('button', { class: 'btn big yes', type: 'button', onclick: startYes }, 'Yes, count us in!'),
      el('button', { class: 'btn big no', type: 'button', onclick: startNo }, 'Sorry, we can\'t make it')));
}

function formView(g) {
  const d = S.draft;
  const yes = d.response === 'yes';
  const note = el('textarea', { id: 'note', rows: 3, maxlength: 600, placeholder: yes ? 'Allergies, questions, a fun fact about your dish...' : 'Anything you\'d like to tell us?' }, d.note);
  note.value = d.note;
  note.addEventListener('input', () => { d.note = note.value; });

  const parts = [];
  if (yes) {
    // how many
    if (g.max > 1) {
      const num = el('output', { class: 'num', 'aria-live': 'polite' }, String(d.people));
      const step = (delta) => { d.people = Math.min(g.max, Math.max(1, d.people + delta)); num.textContent = String(d.people); minus.disabled = d.people <= 1; plus.disabled = d.people >= g.max; };
      const minus = el('button', { class: 'step', type: 'button', 'aria-label': 'One fewer person', onclick: () => step(-1) }, '−');
      const plus = el('button', { class: 'step', type: 'button', 'aria-label': 'One more person', onclick: () => step(1) }, '+');
      minus.disabled = d.people <= 1; plus.disabled = d.people >= g.max;
      parts.push(el('div', { class: 'field' },
        el('div', { class: 'label' }, 'How many of you are coming?'),
        el('div', { class: 'stepper' }, minus, num, plus, el('span', { class: 'muted' }, `up to ${g.max}`)),
        el('p', { class: 'fine' }, 'Need to add someone? Mention it in your note and we will sort it out.')));
    }
    // dish
    const dishInput = el('input', { id: 'dish', type: 'text', maxlength: 120, autocomplete: 'off', placeholder: (DISHES.find((x) => x.id === d.dishType) || {}).hint || 'What are you thinking of making?' });
    dishInput.value = d.dish;
    dishInput.addEventListener('input', () => { d.dish = dishInput.value; });
    const chips = DISHES.map((x) => {
      const input = el('input', { type: 'radio', name: 'dishType', value: x.id, checked: d.dishType === x.id });
      input.addEventListener('change', () => { d.dishType = x.id; dishInput.placeholder = x.hint; typeErr.hidden = true; });
      return el('label', { class: 'chip' }, input, el('span', {}, x.label));
    });
    const typeErr = el('p', { class: 'error', hidden: true, id: 'typeErr' }, 'Pick what you\'re bringing so we can keep the potluck balanced.');
    parts.push(el('fieldset', { class: 'field' },
      el('legend', { class: 'label' }, 'What are you bringing?'),
      el('div', { class: 'chips' }, chips), typeErr,
      el('label', { class: 'sub-label', for: 'dish' }, 'Tell us more (optional)'), dishInput,
      el('p', { class: 'fine' }, 'Potluck rules: bring enough to feed about two people. Past roasts had piles of desserts, so sides are extra loved.')));
  }
  parts.push(el('div', { class: 'field' },
    el('label', { class: 'label', for: 'note' }, yes ? 'A note for Chris & Lauren (optional)' : 'Leave us a note (optional)'),
    note, el('p', { class: 'fine' }, 'Only Chris and Lauren can see your note.')));

  const form = el('form', { class: 'card', novalidate: true },
    el('h2', {}, yes ? 'Woo! Just a few details' : 'We\'ll miss you!'),
    ...parts,
    S.error && el('p', { class: 'error', role: 'alert' }, S.error),
    el('div', { class: 'actions' },
      el('button', { class: 'btn big ' + (yes ? 'yes' : 'no'), type: 'submit', disabled: S.sending }, S.sending ? 'Sending...' : 'Send RSVP'),
      el('button', { class: 'btn link', type: 'button', onclick: () => { S.mode = S.data.rsvp ? 'done' : 'choose'; S.error = ''; render(); } }, 'Back')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (S.sending) return;
    if (yes && !d.dishType) { form.querySelector('#typeErr').hidden = false; form.querySelector('.chips input').focus(); return; }
    d.dish = d.dish.trim(); d.note = d.note.trim();
    submit();
  });
  return form;
}

function doneView(g) {
  const r = S.data.rsvp;
  if (r.response === 'no') {
    return el('div', { class: 'card sorry' },
      el('h2', {}, 'We are so very sorry we will miss you!'),
      el('p', { class: 'lead' }, 'Thank you for letting us know. We hope to see you soon.'),
      el('p', { class: 'muted' }, 'Plans change? You can update your RSVP any time.'),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { S.mode = 'choose'; render(); } }, 'Change my RSVP'));
  }
  const dishLine = r.dishType ? `${dishLabel(r.dishType)}${r.dish ? ': ' + r.dish : ''}` : '';
  const summary = el('div', { class: 'card yes-card' },
    el('h2', {}, `You're on the list, ${g.greeting}!`),
    el('p', { class: 'lead' }, 'We can\'t wait to see you. Bring your appetite.'),
    el('dl', { class: 'summary' },
      el('div', {}, el('dt', {}, 'Coming'), el('dd', {}, `${r.people} ${r.people === 1 ? 'person' : 'people'}`)),
      dishLine && el('div', {}, el('dt', {}, 'Bringing'), el('dd', {}, dishLine))),
    el('button', { class: 'btn ghost small', type: 'button', onclick: startYes }, 'Change my RSVP'));
  return el('div', {}, summary, whoIsComing());
}

function whoIsComing() {
  const list = S.data.accepted || [];
  const people = list.reduce((t, a) => t + a.people, 0);
  const tally = {};
  for (const a of list) if (a.dishType) tally[a.dishType] = (tally[a.dishType] || 0) + 1;
  return el('div', { class: 'card' },
    el('h2', {}, 'Who else is coming'),
    el('p', { class: 'lead' }, `${list.length} ${list.length === 1 ? 'household' : 'households'} · ${people} ${people === 1 ? 'person' : 'people'} so far`),
    Object.keys(tally).length > 0 && el('div', { class: 'tally' }, DISHES.filter((x) => tally[x.id]).map((x) => el('span', { class: 'tally-chip' }, `${dishPlural[x.id]} `, el('strong', {}, String(tally[x.id]))))),
    el('ul', { class: 'guests' }, list.map((a) => el('li', {},
      el('div', { class: 'g-name' }, a.household, el('span', { class: 'g-count' }, a.people > 1 ? ` (${a.people})` : '')),
      a.dishType && el('div', { class: 'g-dish' }, el('span', { class: 'g-type' }, dishLabel(a.dishType)), a.dish && el('span', { class: 'g-what' }, a.dish))))),
    el('p', { class: 'fine' }, 'This list is only shown to guests who have said yes.'));
}

load();
