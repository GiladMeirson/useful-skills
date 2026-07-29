/* matrix-agents-skill demo — a session playing out in fast-forward.
 *
 * Tasks stream past on the left; each one that matches a pattern adds a pip to
 * that pattern's tally on the right. When a tally crosses its threshold the row
 * trips and the one-line mid-session alert fires; at the end of the run the
 * proposal appears. This is the skill's actual pattern table, thresholds and
 * restraint rules, not a decorative animation.
 */
Demos.register('matrix', function (root) {
  var feed = root.querySelector('[data-feed]');
  var tally = root.querySelector('[data-tally]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Subset of the skill's 11-pattern table, with its real thresholds.
  var PATTERNS = [
    { id: 1, name: 'Repetition · same fix category', threshold: 4, family: 'Repetition' },
    { id: 4, name: 'Pain · regression chain', threshold: 2, family: 'Pain' },
    { id: 7, name: 'Exploration · 5+ files read', threshold: 1, family: 'Exploration' },
    { id: 9, name: 'Decision · convention set', threshold: 1, family: 'Decision' }
  ];

  var SCRIPT = [
    { t: '00:04', task: 'Fix card padding on mobile', p: 1 },
    { t: '00:11', task: 'Trace booking flow before edit', p: 7 },
    { t: '00:19', task: 'Align button radius to tokens', p: 1 },
    { t: '00:26', task: 'Rename util function', p: null },
    { t: '00:33', task: 'Fix RTL spacing on filter bar', p: 1 },
    { t: '00:41', task: 'Sort fix broke pagination', p: 4 },
    { t: '00:48', task: 'Agree: services use Clean Arch', p: 9 },
    { t: '00:55', task: 'Pagination fix broke the filter', p: 4 },
    { t: '01:03', task: 'Fix modal header spacing', p: 1 },
    { t: '01:10', task: 'Update changelog', p: null }
  ];

  var state = {};
  PATTERNS.forEach(function (p) { state[p.id] = 0; });
  var i = 0, alerted = false, timer = null;

  function renderTally() {
    tally.innerHTML = '<div class="label" style="margin-bottom:10px">session tally</div>';
    PATTERNS.forEach(function (p) {
      var n = state[p.id];
      var tripped = n >= p.threshold;
      var row = document.createElement('div');
      row.className = 'tally-row' + (tripped ? ' tripped' : '');
      var pips = '';
      for (var k = 0; k < p.threshold; k++) {
        pips += '<span class="pip' + (k < n ? ' on' : '') + '"></span>';
      }
      row.innerHTML = '<span>#' + p.id + ' ' + p.family + '</span><span class="pips">' + pips + '</span>';
      row.title = p.name + ' — threshold ' + p.threshold;
      tally.appendChild(row);
    });
  }

  function proposal() {
    var box = document.createElement('div');
    box.className = 'proposal';
    box.innerHTML = '<strong>End of session.</strong> "I noticed fixing the sort broke pagination, ' +
      'then fixing pagination broke the filter. That suggests knowledge worth preserving as a skill. ' +
      'Create one?"<br><span style="color:var(--faint)">Pain outranks Repetition — only the strongest candidate is proposed.</span>';
    tally.appendChild(box);
  }

  function pushLine(entry) {
    var line = document.createElement('div');
    line.className = 'feed-line' + (entry.p ? '' : ' none');
    var pat = entry.p ? '#' + entry.p : '—';
    line.innerHTML = '<span class="t">' + entry.t + '</span>' +
      '<span>' + entry.task + '</span>' +
      '<span class="p">' + pat + '</span>';
    feed.appendChild(line);
    while (feed.children.length > 9) feed.removeChild(feed.firstChild);
  }

  function tick() {
    if (i >= SCRIPT.length) {
      if (!reduce) {
        var done = document.createElement('div');
        done.className = 'feed-line';
        done.innerHTML = '<span class="t">—</span><span style="color:var(--brass)">session wraps up</span><span class="p">/forge</span>';
        feed.appendChild(done);
        while (feed.children.length > 9) feed.removeChild(feed.firstChild);
      }
      proposal();
      clearInterval(timer); timer = null;
      return;
    }
    var entry = SCRIPT[i++];
    pushLine(entry);
    if (entry.p) {
      state[entry.p]++;
      var pat = PATTERNS.filter(function (p) { return p.id === entry.p; })[0];
      renderTally();
      if (!alerted && pat && state[entry.p] === pat.threshold) {
        alerted = true;
        var alertLine = document.createElement('div');
        alertLine.className = 'feed-line';
        alertLine.innerHTML = '<span class="t">!</span>' +
          '<span style="color:var(--brass)">Skill-worthy pattern detected (' + pat.family.toLowerCase() +
          '). Will propose at session end.</span><span class="p">alert</span>';
        feed.appendChild(alertLine);
        while (feed.children.length > 9) feed.removeChild(feed.firstChild);
      }
    }
  }

  function start() {
    feed.innerHTML = '';
    PATTERNS.forEach(function (p) { state[p.id] = 0; });
    i = 0; alerted = false;
    renderTally();
    if (timer) clearInterval(timer);
    if (reduce) {
      while (i < SCRIPT.length) tick();
      return;
    }
    timer = setInterval(tick, 950);
  }

  var replay = root.querySelector('[data-replay]');
  if (replay) replay.addEventListener('click', start);

  renderTally();

  return {
    start: start,
    destroy: function () { if (timer) clearInterval(timer); }
  };
});
