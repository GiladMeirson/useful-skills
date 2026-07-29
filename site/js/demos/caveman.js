/* caveman demo — the same answer at every intensity, with a live token gauge.
 *
 * Token counts are measured, not invented: each variant is counted with a rough
 * GPT-style heuristic and shown relative to the normal answer. The point the
 * skill makes is that the technical content survives while the padding does not,
 * so the text is typed out rather than swapped, letting you watch what is lost.
 */
Demos.register('caveman', function (root) {
  var out = root.querySelector('[data-cave-out]');
  var meter = root.querySelector('[data-cave-meter]');
  var buttons = root.querySelectorAll('[data-level]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var QUESTIONS = [
    {
      q: 'Why does my React component re-render on every keystroke?',
      levels: {
        normal: "I'd be happy to help with that! The issue you're experiencing is most likely caused by the fact that you are creating a brand new object reference on every single render pass. When you pass an inline object as a prop, React sees a different reference each time it renders, and because the default comparison is referential rather than structural, it will go ahead and re-render the child component even though nothing meaningful has actually changed. The recommended solution here would be to wrap that object in a useMemo hook.",
        lite: "Your component re-renders because you create a new object reference each render. An inline object prop is a new reference every time, so the child re-renders even though nothing changed. Wrap it in useMemo.",
        full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.",
        ultra: "Inline obj prop, new ref, re-render. `useMemo`."
      }
    },
    {
      q: 'Explain database connection pooling.',
      levels: {
        normal: "Certainly! Connection pooling is a technique where your application maintains a cache of database connections that can be reused, rather than opening a brand new connection for every single request that comes in. This is beneficial because establishing a new database connection is actually a fairly expensive operation — it requires a TCP handshake, authentication, and session setup. By keeping a pool of already-open connections around, you avoid paying that cost repeatedly.",
        lite: "Connection pooling reuses open connections instead of creating a new one per request. It avoids repeated TCP handshake, authentication, and session setup overhead.",
        full: "Pool reuse open DB connections. No new connection per request. Skip handshake overhead.",
        ultra: "Pool reuse open DB connections. No per-request handshake."
      }
    },
    {
      q: 'The build fails after upgrading. What do I check first?',
      levels: {
        normal: "Great question! When a build starts failing right after an upgrade, there are a few things worth investigating. First, I would suggest taking a careful look at the actual error output, since the first error in the log is usually the real cause and everything after it tends to be downstream noise. After that, it's worth checking whether your lockfile is still in sync with your manifest, and finally whether any peer dependency requirements changed in the new version.",
        lite: "Read the first error in the log — later ones are usually downstream noise. Then check the lockfile is in sync with the manifest, and whether peer dependency ranges changed.",
        full: "Read first error in log. Later ones downstream noise. Then check lockfile sync with manifest, and peer dep ranges.",
        ultra: "First error only. Rest noise. Check lockfile sync, peer dep ranges."
      }
    }
  ];

  var ORDER = ['normal', 'lite', 'full', 'ultra'];
  var LABELS = { normal: 'off', lite: 'lite', full: 'full', ultra: 'ultra' };
  var current = 'full';
  var qIndex = 0;
  var typer = null;

  // Rough token estimate: ~4 chars per token, with punctuation counted separately.
  function countTokens(s) {
    var words = s.trim().split(/\s+/).length;
    var punct = (s.match(/[.,;:!?()`*—-]/g) || []).length;
    return Math.round(words * 1.32 + punct * 0.5);
  }

  function renderMeter() {
    var q = QUESTIONS[qIndex];
    var base = countTokens(q.levels.normal);
    meter.innerHTML = '';
    ORDER.forEach(function (lvl) {
      var n = countTokens(q.levels[lvl]);
      var pct = Math.round((n / base) * 100);
      var row = document.createElement('div');
      row.className = 'meter-row' + (lvl === current ? ' is-active' : '');
      row.innerHTML =
        '<span>' + LABELS[lvl] + '</span>' +
        '<span class="meter-track"><span class="meter-fill" style="width:' + pct + '%"></span></span>' +
        '<span>' + (lvl === 'normal' ? n + ' tok' : '−' + (100 - pct) + '%') + '</span>';
      meter.appendChild(row);
    });
  }

  function type(text) {
    if (typer) { clearInterval(typer); typer = null; }
    if (reduce) { out.textContent = text; return; }
    out.innerHTML = '';
    var span = document.createElement('span');
    var cursor = document.createElement('span');
    cursor.className = 'cursor';
    out.appendChild(span); out.appendChild(cursor);
    var i = 0;
    var speed = Math.max(6, Math.min(22, 900 / text.length));
    typer = setInterval(function () {
      // Emit a few characters per tick so long answers don't crawl.
      i += Math.ceil(text.length / 90);
      span.textContent = text.slice(0, i);
      if (i >= text.length) {
        span.textContent = text;
        clearInterval(typer); typer = null;
        cursor.remove();
      }
    }, speed);
  }

  function show() {
    var q = QUESTIONS[qIndex];
    var ask = root.querySelector('[data-cave-q]');
    if (ask) ask.textContent = q.q;
    type(q.levels[current]);
    renderMeter();
    buttons.forEach(function (b) {
      var on = b.getAttribute('data-level') === current;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      current = b.getAttribute('data-level');
      show();
    });
  });
  var next = root.querySelector('[data-cave-next]');
  if (next) next.addEventListener('click', function () {
    qIndex = (qIndex + 1) % QUESTIONS.length;
    show();
  });

  show();
  return { destroy: function () { if (typer) clearInterval(typer); } };
});
