/* Page wiring: a demo registry, the install builder, and the small pieces of
 * apparatus that make the page feel like an instrument — theme, reticle, scroll
 * progress, index spy, reveals, copy buttons.
 *
 * Demos declare themselves with Demos.register(name, setup) and are only started
 * once they scroll into view — six simultaneous animation loops on a page nobody
 * is looking at is just heat.
 */
window.Demos = (function () {
  'use strict';
  var registry = {};
  var live = [];

  function register(name, setup) { registry[name] = setup; }

  function mountAll() {
    var nodes = document.querySelectorAll('[data-demo]');
    nodes.forEach(function (node) {
      var name = node.getAttribute('data-demo');
      var setup = registry[name];
      // Mounting twice would run two rAF loops and two instances over one node.
      if (!setup || node.__mounted) return;
      node.__mounted = true;
      var inst = null;
      var running = false;
      var rafId = null;
      var last = 0;
      var startedOnce = false;

      function loop(now) {
        if (!running) return;
        var t = now / 1000;
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
        last = now;
        if (inst && inst.frame) inst.frame(dt, t);
        rafId = requestAnimationFrame(loop);
      }

      function activate() {
        if (!inst) {
          try { inst = setup(node) || {}; }
          catch (err) { console.error('demo "' + name + '" failed:', err); inst = {}; return; }
        }
        if (!startedOnce && inst.start) { startedOnce = true; inst.start(); }
        if (inst.frame && !running) { running = true; last = 0; rafId = requestAnimationFrame(loop); }
      }
      function deactivate() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.isIntersecting ? activate() : deactivate(); });
      }, { rootMargin: '120px 0px', threshold: 0.01 });
      io.observe(node);
      live.push({ node: node, activate: activate, deactivate: deactivate });
    });
  }

  return { register: register, mountAll: mountAll };
})();


/* ------------------------------------------------------- install builder ---
 * The destination table lives in exactly one place on this page, and it is this
 * object. Everything the page says about where a skill goes is rendered from
 * here, so the prose and the command can never drift apart.
 */
window.InstallPaths = (function () {
  'use strict';

  var REPO = 'GiladMeirson/useful-skills';

  // Where each skill's folder lives *in this repository*. skill-report is the
  // odd one out: it is dogfooded here, so it already sits under .claude/skills.
  var SOURCE = {
    'canvas-atelier':      'skills/canvas-atelier',
    'physics-2d':          'skills/physics-2d',
    'caveman':             'skills/caveman',
    'matrix-agents-skill': 'skills/matrix-agents-skill',
    'skill-report':        '.claude/skills/skill-report'
  };

  // agent -> scope -> destination prefix. `~` is spelled differently per shell.
  var DEST = {
    claude:  { project: '.claude/skills/',  global: '{home}/.claude/skills/' },
    copilot: { project: '.github/skills/',  global: '{home}/.copilot/skills/' }
  };

  function destination(agent, scope, shell, skill) {
    var home = shell === 'pwsh' ? '$HOME' : '~';
    return DEST[agent][scope].replace('{home}', home) + skill;
  }

  function command(agent, scope, shell, skill) {
    return 'npx degit ' + REPO + '/' + SOURCE[skill] + ' ' + destination(agent, scope, shell, skill);
  }

  return { REPO: REPO, SOURCE: SOURCE, destination: destination, command: command };
})();


(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- theme --- */
  function initTheme() {
    var btn = document.querySelector('[data-theme-toggle]');
    var label = document.querySelector('[data-theme-label]');
    var root = document.documentElement;

    var stored = null;
    try { stored = localStorage.getItem('us-theme'); } catch (e) { /* private mode */ }

    function systemTheme() {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    function apply(theme) {
      root.setAttribute('data-theme', theme);
      if (label) label.textContent = theme;
      if (btn) btn.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
    }

    apply(stored || systemTheme());

    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem('us-theme', next); } catch (e) { /* ignore */ }
    });
  }

  /* ------------------------------------------------------------ reticle --- *
   * A lagging crosshair, not a cursor replacement — the native pointer stays
   * visible, so nothing about clicking or selecting text changes. Fine pointers
   * only; a touch device gets nothing.
   */
  function initReticle() {
    var el = document.querySelector('[data-reticle]');
    if (!el || reduceMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    var tx = 0, ty = 0, x = 0, y = 0, seen = false, rafId = null;
    var HOT = 'a, button, [data-demo], .chip, .seg button, canvas';

    function frame() {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      rafId = requestAnimationFrame(frame);
    }

    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) {
        seen = true;
        x = tx; y = ty;
        document.body.classList.add('has-reticle');
        rafId = requestAnimationFrame(frame);
      }
      var hot = e.target && e.target.closest && e.target.closest(HOT);
      document.body.classList.toggle('reticle-hot', !!hot);
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      document.body.classList.remove('has-reticle');
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      seen = false;
    });
  }

  /* ----------------------------------------------------------- progress --- */
  function initProgress() {
    var bar = document.querySelector('[data-progress]');
    var head = document.querySelector('.masthead');
    if (!bar && !head) return;

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      var pct = Math.min(1, Math.max(0, window.scrollY / max));
      if (bar) bar.style.width = (pct * 100).toFixed(2) + '%';
      if (head) head.classList.toggle('stuck', window.scrollY > 20);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------- copy ----- */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.querySelector(btn.getAttribute('data-copy'));
        if (!target) return;
        var text = (target.innerText || target.textContent || '').trim();
        var original = btn.textContent;
        var done = function (ok) {
          btn.textContent = ok ? 'Copied' : 'Ctrl+C';
          btn.classList.toggle('done', ok);
          setTimeout(function () { btn.textContent = original; btn.classList.remove('done'); }, 1700);
        };

        function fallback() {
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(ok);
          } catch (e) { done(false); }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
        } else fallback();
      });
    });
  }

  /* ----------------------------------------------------------- reveals --- */
  function initReveals() {
    // A .stagger group cascades its own children rather than arriving as one
    // block. The index is written once here; the delay itself is CSS.
    document.querySelectorAll('.stagger').forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty('--i', i);
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  /* --------------------------------------------------------- spotlight --- *
   * Panel edges catch light where the pointer is, the way a bezel does. The
   * handler is per-panel and rAF-coalesced, so a fast drag across a demo writes
   * two custom properties per frame and nothing else.
   */
  function initSpotlight() {
    if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.panel, .builder').forEach(function (panel) {
      var queued = false, px = 0, py = 0;
      function write() {
        queued = false;
        panel.style.setProperty('--mx', px.toFixed(1) + '%');
        panel.style.setProperty('--my', py.toFixed(1) + '%');
      }
      panel.addEventListener('pointermove', function (e) {
        var r = panel.getBoundingClientRect();
        px = ((e.clientX - r.left) / r.width) * 100;
        py = ((e.clientY - r.top) / r.height) * 100;
        if (queued) return;
        queued = true;
        requestAnimationFrame(write);
      }, { passive: true });
    });
  }

  /* --------------------------------------------------------- index spy --- */
  function initSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.index-rail a[href^="#"]'));
    if (!links.length) return;
    var targets = links
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);
    if (!targets.length) return;

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ----------------------------------------------------------- builder --- */
  function initBuilder() {
    var root = document.querySelector('[data-builder]');
    if (!root) return;

    var out = root.querySelector('[data-cmd]');
    var destOut = root.querySelector('[data-dest]');
    var noteOut = root.querySelector('[data-bnote]');
    var state = { agent: 'claude', scope: 'project', skill: 'canvas-atelier', shell: 'posix' };

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function note() {
      var bits = [];

      if (state.scope === 'global') {
        bits.push('<strong>Global</strong> means your user folder — on Windows that expands to ' +
          '<code>C:\\Users\\&lt;you&gt;\\' + (state.agent === 'claude' ? '.claude' : '.copilot') +
          '\\skills\\</code>. Every project on the machine sees it.');
      } else {
        bits.push('<strong>Project</strong> scope — commit the folder and your teammates get it too.');
      }

      if (state.agent === 'copilot') {
        bits.push('Copilot also reads <code>.claude/skills/</code>, so a repo that already has Claude Code skills needs no second copy.');
      }

      if (state.skill === 'skill-report') {
        bits.push(state.agent === 'claude'
          ? 'Copying the folder is not enough: register the Stop hook in <code>.claude/settings.json</code> as well.'
          : 'Copilot has no post-turn hook, so the footer is best-effort — paste the standing instruction from <code>references/github-copilot.md</code> into <code>.github/copilot-instructions.md</code>.');
      }
      if (state.skill === 'matrix-agents-skill' && state.agent === 'copilot') {
        bits.push('It detects the Copilot layout at runtime; without hooks, the <code>/forge</code> trigger word is what guarantees the end-of-session check.');
      }

      return bits.join(' ');
    }

    function render() {
      var dest = window.InstallPaths.destination(state.agent, state.scope, state.shell, state.skill);
      var src = window.InstallPaths.SOURCE[state.skill];

      if (out) {
        out.innerHTML =
          '<span class="tok-cmd">npx degit</span> ' +
          esc(window.InstallPaths.REPO) + '/<span class="tok-path">' + esc(src) + '</span> ' +
          esc(dest);
      }
      if (destOut) destOut.textContent = dest;
      if (noteOut) noteOut.innerHTML = note();
    }

    root.querySelectorAll('.seg').forEach(function (seg) {
      var group = seg.getAttribute('data-group');
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-val]');
        if (!btn || !seg.contains(btn)) return;
        state[group] = btn.getAttribute('data-val');
        seg.querySelectorAll('button[data-val]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        render();
      });
    });

    render();
  }

  ready(function () {
    initTheme();
    Demos.mountAll();
    initCopy();
    initProgress();
    initReveals();
    initSpy();
    initBuilder();
    initReticle();
    initSpotlight();
  });
})();
