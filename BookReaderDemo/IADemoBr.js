/* global BookReader, BookReaderJSIAinit */
import { extraVolOptions, custvolumesManifest } from './ia-multiple-volumes-manifest.js';

/**
 * This is how Internet Archive loads bookreader
 */
const urlParams = new URLSearchParams(window.location.search);
function getFromUrl(name, def) {
  if (urlParams.has(name)) {
    return urlParams.get(name);
  } else {
    return def;
  }
}

const isDetailsPage = window.location.pathname.startsWith('/details/');
const ocaid = isDetailsPage ? window.location.pathname.split('/')[2] : urlParams.get('ocaid');
const openFullImmersionTheater = urlParams.get('view') === 'theater';
const ui = urlParams.get('ui');
const searchTerm = urlParams.get('q');

if (isDetailsPage) {
  /** @type {NodeListOf<HTMLAnchorElement>} */
  const links = document.querySelectorAll(`a[href^="/BookReaderDemo/demo-internetarchive.html"]`);
  links.forEach(anchor => {
    const url = new URL(anchor.href);
    const anchorOcaid = url.searchParams.get('ocaid');
    url.searchParams.delete('ocaid');
    const paramsString = url.searchParams.toString();
    anchor.href = `/details/${anchorOcaid}` + (paramsString ? '?' + paramsString : '');
  });
}

const iaBookReader = document.querySelector('ia-bookreader');

const downloadListWithLCP = [
  [
    "lcpPDF",
    "link to lcp pdf"
  ],
  [
    "lcpEPUB",
    "link to lcp epub"
  ]
];

if (openFullImmersionTheater) {
  $(document.body).addClass('BRfullscreenActive');
  iaBookReader.fullscreen = openFullImmersionTheater;
}

const modal = document.querySelector('modal-manager');
iaBookReader.modal = modal;

// Override options coming from IA
BookReader.optionOverrides.imagesBaseURL = '/BookReader/images/';

const initializeBookReader = (brManifest) => {
  console.log('initializeBookReader', brManifest);

  const options = {
    el: '#BookReader',
    /* Url plugin - IA uses History mode for URL */
    ...(isDetailsPage ? {
      urlHistoryBasePath: `/details/${ocaid}/`,
      urlMode: 'history',
      resumeCookiePath: `/details/${ocaid}/`,
      // Only reflect these params onto the URL
      urlTrackedParams: ['page', 'search', 'mode'],
    } : {}),
    enableBookTitleLink: false,
    bookUri: `https://archive.org/details/${ocaid}`,
    bookUrlText: null,
    startFullscreen: openFullImmersionTheater,
    // leaving this option commented out bc we change given user agent on archive.org
    // onePage: { autofit: <?=json_encode($this->ios ? 'width' : 'auto')?> },
    showToolbar: getFromUrl('options.showToolbar', 'false') === 'true',
    /* Multiple volumes */
    // To show multiple volumes:
    enableMultipleBooks: false, // turn this on
    multipleBooksList: [], // populate this  // TODO: get sample blob and tie into demo
    /* End multiple volumes */
    enableBookmarks: true, // turn this on
    enableFSLogoShortcut: true,
    plugins: {
      search: {
        initialSearchTerm: searchTerm ? searchTerm : '',
      },
    },
  };

  // we want to show item as embedded when ?ui=embed is in URI
  if (ui === 'embed') {
    options.mode = 1;
    options.ui = 'embed';
  }

  // we expect this at the global level
  BookReaderJSIAinit(brManifest.data, options);

  const isRestricted = brManifest.data.isRestricted;
  window.dispatchEvent(new CustomEvent('contextmenu', { detail: { isRestricted } }));
};

window.initializeBookReader = initializeBookReader;

const showLCP = document.querySelector('#show-lcp');
showLCP.addEventListener('click', async () => {
  const iaBr = document.querySelector('ia-bookreader');
  iaBr.downloadableTypes = downloadListWithLCP;
  iaBr.updateMenuContents();
  await iaBr.updateComplete;
});

const multiVolume = document.querySelector('#multi-volume');
multiVolume.addEventListener('click', () => {
  // remove everything
  $('#BookReader').empty();
  delete window.br;
  // and re-mount with a new book
  BookReaderJSIAinit(custvolumesManifest, extraVolOptions);
});


const fetchBookManifestAndInitializeBookreader = async (iaMetadata) => {
  document.querySelector('input[name="itemMD"]').checked = true;
  iaBookReader.item = iaMetadata;

  const jsiaParams = {
    format: 'jsonp',
    itemPath: iaMetadata.dir,
    id: iaMetadata.metadata.identifier,
    server: iaMetadata.server,
  };

  const jp2File = iaMetadata.files.find(f => f.name.endsWith('_jp2.zip'))
  if (jp2File) {
    jsiaParams.subPrefix = jp2File.name.replace('_jp2.zip', '');
  }

  const iaManifestUrl = `https://${iaMetadata.server}/BookReader/BookReaderJSIA.php?${
    new URLSearchParams(jsiaParams)
  }`;

  const manifest = await fetch(iaManifestUrl).then(response => response.json());
  document.querySelector('input[name="bookManifest"]').checked = true;

  initializeBookReader(manifest);
};

/**
 * With no ?ocaid= (and not a /details/ page), show a landing list of the books
 * that have local clickable-annotation files in BookReaderDemo/annotations/.
 * The list is read from the dev server's directory listing, so it stays current
 * as you add/remove <ocaid>.json files — no rebuild or restart needed.
 */
/**
 * Parse an annotation filename into its IA identifier and project timestamp.
 * Convention: "<ocaid>.<timestamp>.json", where <timestamp> matches the
 * ~/data/<timestamp>/ project dir (typically 12 digits, YYYYMMDDHHMM). A plain
 * "<ocaid>.json" (no timestamp) is also accepted. Returns {ocaid, stamp, file}.
 */
function parseAnnotationFile(file) {
  const stem = file.replace(/\.json$/, '');
  const m = stem.match(/^(.+)\.(\d{8,14})$/); // trailing all-digit run = timestamp
  return m ? { ocaid: m[1], stamp: m[2], file } : { ocaid: stem, stamp: null, file };
}

/** Format a 12-digit project stamp as "YYYY-MM-DD HH:MM"; pass others through. */
function formatStamp(stamp) {
  if (!stamp) return '';
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : stamp;
}

async function renderAnnotationLanding() {
  const wrapper = document.querySelector('#IABookReaderWrapper');
  const annDir = '/BookReaderDemo/annotations/';
  let entries = [];
  try {
    const html = await fetch(annDir).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // annotation files only (exclude the .meta.json sidecars)
    const files = Array.from(doc.querySelectorAll('a[href$=".json"]'))
      .map(a => a.getAttribute('href').split('/').pop())
      .filter(n => n && !n.endsWith('.meta.json'));
    entries = await Promise.all(files.map(async file => {
      const { ocaid, stamp } = parseAnnotationFile(file);
      let meta = {};
      try {
        const r = await fetch(annDir + file.replace(/\.json$/, '.meta.json'));
        if (r.ok) meta = await r.json();
      } catch (e) { /* no sidecar -> graceful blanks */ }
      const e2 = { ocaid, stamp, file, ...meta };
      // % of links whose placement is verified (links_ok / links)
      e2.links_pct = (e2.links && e2.links > 0) ? Math.round((e2.links_ok || 0) / e2.links * 100) : null;
      return e2;
    }));
  } catch (e) {
    console.error('Could not read annotations directory', e);
  }

  const cols = [
    { key: 'ocaid',    label: 'IA identifier', type: 'str' },
    { key: 'stamp',    label: 'Run',           type: 'str' },
    { key: 'model',    label: 'Model',         type: 'str' },
    { key: 'types',    label: 'Types',         type: 'str' },
    { key: 'prompt',   label: 'Prompt',        type: 'str' },
    { key: 'slices',   label: 'Slices',        type: 'num' },
    { key: 'cites',    label: 'Cites',         type: 'num' },
    { key: 'quotes',   label: 'Quotes',        type: 'num' },
    { key: 'matches',  label: 'Matches',       type: 'num' },
    { key: 'links',    label: 'Links #',       type: 'num' },
    { key: 'links_pct',label: 'Links ✓%',      type: 'num' },
    { key: 'cost_usd', label: 'Cost',          type: 'num' },
    { key: 'seconds',  label: 'Time',          type: 'num' },
  ];
  const fmt = {
    stamp: v => v ? formatStamp(v) : '—',
    grounding: v => v ? '✓' : '—',
    types: v => Array.isArray(v) ? v.join('<br>') : (v || '—'),  // stack multi-type runs vertically
    prompt: v => v ? String(v).trim().split(/\s+/).join('<br>') : '—',  // stack multi-prompt runs vertically
    cost_usd: v => (v == null) ? '—' : '$' + Number(v).toFixed(2),
    seconds: v => (v == null) ? '—' : (v < 90 ? v + 's' : Math.floor(v / 60) + 'm ' + (v % 60) + 's'),
    links_pct: v => (v == null) ? '—' : v + '%',
  };
  const cell = (e, c) => fmt[c.key] ? fmt[c.key](e[c.key]) : (e[c.key] == null ? '—' : e[c.key]);
  const sortVal = (e, c) => c.type === 'num'
    ? (e[c.key] == null ? -Infinity : Number(e[c.key]))
    : String(fmt[c.key] ? fmt[c.key](e[c.key]) : (e[c.key] ?? '')).toLowerCase();

  let sortKey = 'stamp', sortDir = 1; // default: Run ascending

  function render() {
    const sc = cols.find(c => c.key === sortKey);
    entries.sort((a, b) => { const va = sortVal(a, sc), vb = sortVal(b, sc); return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir; });
    const thead = '<th style="padding:6px 12px 6px 0;"><input type="checkbox" id="annAll" title="select all"></th>'
      + cols.map(c =>
        `<th data-key="${c.key}" style="padding:6px 16px 6px 0;cursor:pointer;white-space:nowrap;${c.type === 'num' ? 'text-align:right;' : 'text-align:left;'}">`
        + `${c.label}${sortKey === c.key ? (sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('');
    const body = entries.length ? entries.map(e => {
      const href = `/BookReaderDemo/demo-internetarchive.html?ocaid=${encodeURIComponent(e.ocaid)}&annotations=${encodeURIComponent(annDir + e.file)}`;
      return '<tr style="border-bottom:1px solid #2a2a2a;">'
        + `<td style="padding:5px 12px 5px 0;"><input type="checkbox" class="annCheck" data-file="${e.file}"></td>`
        + `<td style="padding:5px 16px 5px 0;"><a href="${href}" style="color:#6cf;">${e.ocaid}</a></td>`
        + `<td style="padding:5px 16px 5px 0;white-space:nowrap;">${fmt.stamp(e.stamp)}${e.stamp ? ` <span style="color:#666;">${e.stamp}</span>` : ''}</td>`
        + cols.slice(2).map(c => `<td style="padding:5px 16px 5px 0;white-space:nowrap;${c.type === 'num' ? 'text-align:right;' : ''}">${cell(e, c)}</td>`).join('')
        + '</tr>';
    }).join('') : `<tr><td colspan="${cols.length + 1}"><em>No annotation files found. Drop &lt;ocaid&gt;.&lt;timestamp&gt;.json (+ optional .meta.json) into BookReaderDemo/annotations/.</em></td></tr>`;
    wrapper.querySelector('#annTable').innerHTML = `<thead><tr style="color:#9ab;border-bottom:1px solid #555;">${thead}</tr></thead><tbody>${body}</tbody>`;
  }

  wrapper.innerHTML = `<div style="position:fixed;inset:0;z-index:9999;overflow:auto;background:#0b0b0b;padding:24px 32px;color:#eee;font:14px/1.5 'Helvetica Neue',Arial,sans-serif;">
     <h2 style="color:#fff;margin-bottom:4px;">Clickable-annotation test runs</h2>
     <p style="color:#aaa;margin-bottom:10px;max-width:64em;">Each row is one annotools run
       (<code>&lt;ocaid&gt;.&lt;timestamp&gt;.json</code> in <code>BookReaderDemo/annotations/</code> with a
       <code>.meta.json</code> sidecar; timestamp cross-references <code>~/data/&lt;timestamp&gt;/</code>).
       Click a column header to sort; click an IA identifier to open that run in the reader.
       Cost is a token-only estimate (excludes grounding fees); times marked from file mtimes are approximate.</p>
     <p style="margin-bottom:14px;"><button id="annDelete" style="background:#622;color:#fdd;border:1px solid #944;border-radius:4px;padding:5px 12px;cursor:pointer;">Delete selected</button>
       <span style="color:#888;margin-left:8px;">removes the .json + .meta.json from the landing folder only (your ~/data run is untouched)</span></p>
     <table id="annTable" style="border-collapse:collapse;font-size:14px;color:#ddd;"></table>
   </div>`;
  wrapper.querySelector('#annTable').addEventListener('click', ev => {
    if (ev.target.id === 'annAll') {
      wrapper.querySelectorAll('input.annCheck').forEach(c => { c.checked = ev.target.checked; });
      return;
    }
    const th = ev.target.closest('th[data-key]');
    if (!th) return;
    const k = th.getAttribute('data-key');
    if (sortKey === k) { sortDir = -sortDir; }
    else { sortKey = k; sortDir = (cols.find(c => c.key === k).type === 'num') ? -1 : 1; }
    render();
  });
  wrapper.querySelector('#annDelete').addEventListener('click', async () => {
    const checked = Array.from(wrapper.querySelectorAll('input.annCheck:checked'));
    if (!checked.length) { alert('No runs selected.'); return; }
    if (!confirm(`Delete ${checked.length} run(s) from the landing folder?\n\nThis removes the .json and .meta.json here only; the source run in ~/data is untouched.`)) return;
    for (const c of checked) {
      try {
        await fetch('/__delete-annotation?file=' + encodeURIComponent(c.getAttribute('data-file')), { method: 'POST' });
      } catch (e) { console.error('delete failed for', c.getAttribute('data-file'), e); }
    }
    renderAnnotationLanding(); // refresh from the now-updated directory
  });
  render();
}

// Temp; Circumvent bug in BookReaderJSIA code
window.Sentry = null;
window.logError = function(e) {
  console.error(e);
};
if (ocaid) {
  fetch(`https://archive.org/metadata/${ocaid}`)
    .then(response => response.json())
    .then(iaMetadata => fetchBookManifestAndInitializeBookreader(iaMetadata));
} else {
  renderAnnotationLanding();
}
