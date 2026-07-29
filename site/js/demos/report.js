/* skill-report demo — one turn replayed, with the footer assembling itself.
 *
 * Tool calls light up as they happen and are tallied into the three buckets the
 * hook actually reads from the transcript. Routine tools (Read, Bash, Grep) are
 * shown deliberately greyed and uncounted, because that exclusion is the whole
 * design: the footer surfaces delegated capability, not every file touched.
 */
Demos.register('report', function (root) {
  var term = root.querySelector('[data-term]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TURNS = [
    {
      prompt: 'Chart last quarter\'s signups and check how the API prices it now.',
      steps: [
        { tool: 'Read', counted: false, note: 'data/signups.csv' },
        { tool: 'Skill', counted: true, bucket: 'skills', value: 'dataviz' },
        { tool: 'WebSearch', counted: true, bucket: 'web', value: 'WebSearch' },
        { tool: 'Write', counted: false, note: 'chart.html' }
      ]
    },
    {
      prompt: 'Find every place we still call the old billing endpoint.',
      steps: [
        { tool: 'Grep', counted: false, note: '"/v1/billing"' },
        { tool: 'Agent', counted: true, bucket: 'subagents', value: 'Explore' },
        { tool: 'Read', counted: false, note: '6 files' }
      ]
    },
    {
      prompt: 'What does this regex do?',
      steps: []
    }
  ];

  var idx = 0, timer = null;

  function line(html, cls) {
    var el = document.createElement('div');
    el.className = 'term-line ' + (cls || '');
    el.innerHTML = html;
    term.appendChild(el);
    return el;
  }

  function render(turn) {
    term.innerHTML = '';
    line('<span class="gutter">&gt;</span><span class="term-user">' + turn.prompt + '</span>');

    var buckets = { skills: [], subagents: [], web: [] };
    var i = 0;

    function footer() {
      var fmt = function (a) { return a.length ? a.join(', ') : 'none'; };
      var el = document.createElement('div');
      el.className = 'term-foot';
      el.innerHTML = '<span class="k">---</span><br><strong>Skill report:</strong> ' +
        '<span class="k">Skills:</span> ' + fmt(buckets.skills) +
        ' <span class="k">|</span> <span class="k">Subagents:</span> ' + fmt(buckets.subagents) +
        ' <span class="k">|</span> <span class="k">Web:</span> ' + fmt(buckets.web);
      term.appendChild(el);
    }

    function step() {
      if (i >= turn.steps.length) {
        if (!turn.steps.length) {
          line('<span class="gutter">·</span><span style="color:#64738f">answered directly, no tools called</span>');
        }
        footer();
        clearInterval(timer); timer = null;
        return;
      }
      var s = turn.steps[i++];
      var label = s.counted
        ? '<span class="badge">' + s.tool + '</span> <span style="color:var(--text)">' + s.value + '</span>'
        : '<span style="color:#3d4a66">' + s.tool + '</span> <span style="color:#3d4a66">' + (s.note || '') + '</span>';
      line('<span class="gutter">·</span><span class="term-tool' +
        (s.counted ? ' counted' : '') + '">' + label + '</span>');
      if (s.counted) buckets[s.bucket].push(s.value);
    }

    if (timer) clearInterval(timer);
    if (reduce) { while (i < turn.steps.length) step(); step(); return; }
    timer = setInterval(step, 780);
  }

  function play() {
    render(TURNS[idx]);
    idx = (idx + 1) % TURNS.length;
  }

  var btn = root.querySelector('[data-next-turn]');
  if (btn) btn.addEventListener('click', play);

  return {
    start: play,
    destroy: function () { if (timer) clearInterval(timer); }
  };
});
