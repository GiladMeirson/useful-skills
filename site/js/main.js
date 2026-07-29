/* Page wiring: a demo registry, scroll spy, reveals, and copy buttons.
 *
 * Demos declare themselves with Demos.register(name, setup) and are only
 * started once they scroll into view — five simultaneous animation loops on a
 * page nobody is looking at is just heat.
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

(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    Demos.mountAll();

    // ---- copy buttons ----
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy');
        var target = document.querySelector(sel);
        if (!target) return;
        var text = (target.innerText || target.textContent || '').trim();
        var done = function (ok) {
          var original = btn.textContent;
          btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
          btn.classList.toggle('done', ok);
          setTimeout(function () { btn.textContent = original; btn.classList.remove('done'); }, 1700);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
        } else fallback();

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
      });
    });

    // ---- masthead shadow ----
    var head = document.querySelector('.masthead');
    var onScroll = function () {
      if (head) head.classList.toggle('stuck', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- reveals ----
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll('.reveal').forEach(function (el) { revealIO.observe(el); });

    // ---- rail scroll spy ----
    var links = Array.prototype.slice.call(document.querySelectorAll('.rail a[href^="#"]'));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); })
                       .filter(Boolean);
    if (targets.length) {
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
  });
})();
