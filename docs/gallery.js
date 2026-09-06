/* Makes gallery.html's Feedback and Edit buttons do what their originals do in Claude Design,
 * and adds the one part of that app's editing model that a local mirror can actually reproduce:
 * clicking an element inside a card preview to scope the feedback to it.
 *
 * WHAT THE REAL APP DOES (read out of its own ProjectPage chunk, which docs/gen_gallery.py
 * vendors alongside the CSS — the buttons live in its `eJ` review-card component):
 *
 *   Edit      onOpenFile: () => openFile(card.editPath ?? card.path)   — opens the card's
 *             source in the app's own editor pane. Locally, "the editor" is the VS Code window
 *             this repo is already open in; docs/serve.py reaches it with the Remote-WSL `code`
 *             CLI. (Why via the server rather than a `vscode://file/...` href on the button:
 *             see open_file() there — the browser is Windows-side and would resolve the path
 *             against the wrong filesystem.)
 *
 *   Feedback  onClick: () => open ? close() : open()  — toggles a collapse holding a textarea,
 *             Cancel and Submit. Submit calls onSendFeedback(name, path, text, files), which is
 *             one line at the top of the page component:
 *                 `Regenerate "${name}"${text ? `: ${text}` : `.`}` + a ds-feedback attachment
 *             posted to the project's Claude session. Locally that is a headless `claude -p` in
 *             this repo — see build_prompt() in docs/serve.py, which reproduces both that
 *             sentence and the File/Element/Feedback attachment body verbatim.
 *             The button then reads "Feedback sent" in accent blue for 5s. Ours keeps using it
 *             as the run's status readout, because unlike the real app's chat message our
 *             submission is a process that finishes (or fails) and we have nowhere else to say so.
 *
 *   The picker  The app injects an agent script into the preview and runs a "comment mode":
 *             hovering outlines an element, clicking selects it, and the selection travels back
 *             as {selector, descriptor, rect} which becomes an attachment reading
 *                 File: <path> / Element: <descriptor> / Feedback: <text>
 *             Its descriptor is an ancestor breadcrumb ("→ leaf", then indented "↑ parent" lines,
 *             up to 5 deep); describeElement()/descriptorOf() below rebuild that shape. We need
 *             no injected script and no postMessage protocol, because our previews are same-origin
 *             iframes (both sides served by docs/serve.py) — the parent can just reach into
 *             contentDocument and add listeners. That is also the one hard requirement here:
 *             opened as file://, every preview is a foreign origin and picking silently degrades
 *             (see enterPickMode).
 *
 * WHAT IT DELIBERATELY DOES NOT REPRODUCE: the app's other in-preview editing modes — direct
 * text editing (it tags DOM nodes with data-om-text and traps input), the drawing/annotation
 * tools (rect/oval/arrow/line/freehand over the preview), stock-photo image-slot picking and
 * reframing, and drag-drop repositioning. All of those depend on its build-time JSX source
 * instrumentation: it stamps every element with data-om-id="jsx:<file>:<line>:<col>" so an edit
 * can be written back to the exact source expression. Our cards are hand-written HTML with an
 * in-page Babel transform and carry no such map, so an edit made in the preview has no defined
 * place to land. Feedback-with-an-element-attached is the honest local equivalent: it hands
 * Claude the same selector and breadcrumb and lets it find the source itself.
 *
 * No part of this runs, or is needed, for the page to render correctly — the panel is fully
 * styled and readable with JS off, which is how it was built and how the pixel-fidelity checks
 * in docs/gen_gallery.py still measure it.
 */
(function () {
  'use strict';

  var POLL_MS = 2500;
  var SENT_LINGER_MS = 5000; // the real app's own window.setTimeout(..., 5e3) on "Feedback sent"
  var MAX_ANCESTORS = 5;     // the real descriptor walks at most 5 levels up before stopping

  /* ------------------------------------------------------------------ tiny helpers */

  function toast(msg) {
    var el = document.getElementById('om-ds-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'om-ds-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.setAttribute('data-show', '1');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.removeAttribute('data-show'); }, 6000);
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  /* --------------------------------------------------- element description (the app's shape) */

  /* One line of the breadcrumb. The real app's own leaf/ancestor formatter is minified past
     useful reading, but its output shape is visible in what it feeds the model: a tag with its
     distinguishing attributes and, for the leaf, its text. Classes are capped at 3 because these
     cards are Tailwind-ish and a full class list is pages of noise that tells Claude nothing. */
  function describeElement(el, isLeaf) {
    var out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    var cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    if (cls.length) out += '.' + cls.slice(0, 3).join('.') + (cls.length > 3 ? '…' : '');
    var role = el.getAttribute('role');
    if (role) out += ' [role=' + role + ']';
    var label = el.getAttribute('aria-label');
    if (label) out += ' [aria-label="' + label + '"]';
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    // Ancestors get their text only when it is short enough to be identifying rather than a dump
    // of the whole subtree; the leaf always gets its own, truncated.
    if (text && (isLeaf || text.length <= 40)) {
      out += ' "' + (text.length > 60 ? text.slice(0, 60) + '…' : text) + '"';
    }
    return out;
  }

  function descriptorOf(el) {
    var lines = ['→ ' + describeElement(el, true)];
    var p = el.parentElement, i = 0;
    var body = el.ownerDocument.body;
    while (p && p !== body && i < MAX_ANCESTORS) {
      lines.push(new Array(i + 2).join('  ') + '↑ ' + describeElement(p, false));
      p = p.parentElement;
      i++;
    }
    return lines.join('\n');
  }

  /* A selector that still resolves after the file is edited, as far as that is possible without
     the app's data-om-id source stamps: prefer a unique id anywhere up the chain, else a
     :nth-of-type path. Sent along with the descriptor so Claude has both a machine-checkable
     handle and a human one — the descriptor is what actually survives a rewrite. */
  function selectorOf(el) {
    var doc = el.ownerDocument;
    if (el === doc.body) return 'body';
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== doc.documentElement) {
      if (node.id && doc.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      var part = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  /* ------------------------------------------------------------------------ the picker */

  /* One reusable outline per preview document, styled the way the app styles its own (its helper
     builds exactly this: position:fixed, pointer-events:none, a 2px accent border, radius 4, and
     a z-index above everything). Kept on the document element rather than body so a card's own
     layout can't reflow around it, and so a card that restyles body doesn't restyle this. */
  function overlayFor(doc) {
    if (!doc._omDsOverlay || !doc._omDsOverlay.isConnected) {
      var d = doc.createElement('div');
      d.style.cssText = 'position:fixed;pointer-events:none;border:2px solid rgba(59,130,246,0.9)' +
        ';border-radius:4px;z-index:2147483647;transition:all 60ms ease-out';
      doc.documentElement.appendChild(d);
      doc._omDsOverlay = d;
    }
    return doc._omDsOverlay;
  }

  function place(box, el) {
    var r = el.getBoundingClientRect();
    box.style.display = '';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
  }

  function enterPickMode(card, onPick, onEscape) {
    var iframe = card.querySelector('.om-ds-preview-mount iframe');
    if (!iframe) return;
    var doc;
    try {
      doc = iframe.contentDocument;
    } catch (e) {
      doc = null; // cross-origin: only reachable if this page was opened as a file:// URL
    }
    if (!doc || !doc.body) {
      // Two ordinary reasons, worth telling apart: a lazy iframe that simply hasn't loaded yet
      // (it will, and reopening the box then works), versus file:// where it never will.
      if (location.protocol === 'file:') {
        setHint(card, 'Element picking needs the page served over HTTP — open ' +
                      'http://127.0.0.1:8888/gallery.html (docs/serve.py).');
      }
      return;
    }
    if (doc._omDsPick) return;

    var hover = overlayFor(doc);
    hover.style.display = 'none';

    var state = {
      move: function (e) {
        var el = e.target;
        if (!el || el.nodeType !== 1) return;
        place(hover, el);
      },
      leave: function () { hover.style.display = 'none'; },
      // Capture phase + stopImmediatePropagation: a click in pick mode must select the element,
      // never activate the mockup's own button underneath it. The app's own handler does exactly
      // this (preventDefault + stopImmediatePropagation on a capturing pointer handler).
      click: function (e) {
        var el = e.target;
        if (!el || el.nodeType !== 1) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (onPick) {
          // The edit panel's picker (see openEditPanel): unlike feedback-attach, picking again
          // just retargets the panel at the newly clicked element — it does not exit pick mode,
          // because "click something else to edit it instead" is the whole interaction model.
          onPick(el);
          return;
        }
        attachElement(card, {
          selector: selectorOf(el),
          descriptor: descriptorOf(el),
          label: describeElement(el, true)
        });
      },
      // Escape means the same thing on both sides of the iframe boundary: dismiss the composer.
      // Disarming the picker alone left no way back — the box stayed open over a preview that no
      // longer responded to hover, and the only re-arm path (the chip's Clear button) is hidden
      // while nothing is attached, so the user had to close and reopen the box to pick anything.
      key: function (e) { if (e.key === 'Escape') (onEscape || function () { closeBox(card); })(); }
    };
    doc.addEventListener('mousemove', state.move, true);
    doc.addEventListener('mouseleave', state.leave, true);
    doc.addEventListener('click', state.click, true);
    doc.addEventListener('keydown', state.key, true);
    doc.documentElement.style.cursor = 'crosshair';
    doc._omDsPick = state;
    card.setAttribute('data-picking', '1');
  }

  function exitPickMode(card) {
    card.removeAttribute('data-picking');
    var iframe = card.querySelector('.om-ds-preview-mount iframe');
    var doc = null;
    try { doc = iframe && iframe.contentDocument; } catch (e) { /* cross-origin */ }
    if (!doc || !doc._omDsPick) return;
    var s = doc._omDsPick;
    doc.removeEventListener('mousemove', s.move, true);
    doc.removeEventListener('mouseleave', s.leave, true);
    doc.removeEventListener('click', s.click, true);
    doc.removeEventListener('keydown', s.key, true);
    doc.documentElement.style.cursor = '';
    if (doc._omDsOverlay) doc._omDsOverlay.style.display = 'none';
    doc._omDsPick = null;
  }

  function setHint(card, text) {
    var hint = card.querySelector('.om-ds-pick-hint');
    if (hint) hint.innerHTML = text;
  }

  function attachElement(card, sel) {
    card._element = sel;
    card.setAttribute('data-has-element', '1');
    var chip = card.querySelector('.om-ds-element-chip code');
    if (chip) {
      chip.textContent = sel.label;
      chip.title = sel.descriptor;
    }
    exitPickMode(card);
    setHint(card, 'Element attached. <b>Clear</b> it to pick another.');
    syncSubmit(card);
    var ta = card.querySelector('.om-ds-feedback-box textarea');
    if (ta) ta.focus();
  }

  function clearElement(card) {
    card._element = null;
    card.removeAttribute('data-has-element');
    syncSubmit(card);
    if (isOpen(card)) {
      enterPickMode(card);
      setHint(card, 'Click an element in the preview below to attach it, or just describe the change.');
    }
  }

  /* ------------------------------------------------------------------- the feedback box */

  function isOpen(card) {
    var c = card.querySelector('.om-collapse');
    return !!(c && c.getAttribute('data-open') === '1');
  }

  function syncSubmit(card) {
    var ta = card.querySelector('.om-ds-feedback-box textarea');
    var submit = card.querySelector('.om-ds-submit');
    if (!ta || !submit) return;
    // Matches the real app's own gate: Submit is disabled until there is something to send.
    submit.disabled = !ta.value.trim() && !card._element;
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function openBox(card) {
    var c = card.querySelector('.om-collapse');
    if (!c) return;
    // Mutual exclusion with the edit panel: both arm the same one-picker-per-doc machinery
    // (see enterPickMode), so only one may be armed on this card's preview at a time.
    if (typeof closeEditPanel === 'function' && activeEditCard === card) closeEditPanel(true);
    c.setAttribute('data-open', '1');
    // The inline delays are the closed-state ones baked into the markup; opening uses the real
    // app's open-state values for this collapse (it passes fadeDelayMs={0} here specifically).
    c.style.setProperty('--fade-delay', '0ms');
    c.style.setProperty('--vis-delay', '0ms');
    var ta = card.querySelector('.om-ds-feedback-box textarea');
    if (ta) {
      ta.disabled = false;
      autosize(ta);
      ta.focus();
    }
    setHint(card, 'Click an element in the preview below to attach it, or just describe the change.');
    enterPickMode(card);
    syncSubmit(card);
  }

  function closeBox(card) {
    var c = card.querySelector('.om-collapse');
    if (!c) return;
    c.removeAttribute('data-open');
    c.style.setProperty('--fade-delay', '0ms');
    c.style.setProperty('--vis-delay', '250ms');
    var ta = card.querySelector('.om-ds-feedback-box textarea');
    if (ta) ta.disabled = true;   // back to the real closed-state DOM: no focus target in a 0fr box
    exitPickMode(card);
    var btn = card.querySelector('.om-ds-feedback-btn');
    if (btn) btn.focus();
  }

  function submitFeedback(card) {
    var ta = card.querySelector('.om-ds-feedback-box textarea');
    var text = ta ? ta.value.trim() : '';
    if (!text && !card._element) return;
    var btn = card.querySelector('.om-ds-feedback-btn');
    postJSON('/_api/feedback', {
      path: card.getAttribute('data-card-path'),
      name: card.getAttribute('data-card-name'),
      text: text,
      element: card._element ? card._element.descriptor : null,
      selector: card._element ? card._element.selector : null
    }).then(function (res) {
      if (ta) { ta.value = ''; autosize(ta); }
      clearElement(card);
      closeBox(card);
      card._entryId = res.entry.id;
      setState(btn, res.entry.status === 'held' ? 'sent' : res.entry.status);
      startPolling();
    }).catch(function (err) {
      toast('Feedback failed: ' + err.message + ' — is docs/serve.py running?');
    });
  }

  /* --------------------------------------------------------------------- run status readout */

  var LABEL = {
    queued: 'Queued…',
    running: 'Regenerating…',
    done: 'Regenerated',
    failed: 'Run failed',
    sent: 'Feedback sent',   // SONORA_FEEDBACK_CLAUDE=0: recorded, not run
    held: 'Feedback sent'
  };

  function setState(btn, state) {
    if (!btn) return;
    var label = btn.querySelector('span');
    clearTimeout(btn._revert);
    if (!state) {
      btn.removeAttribute('data-state');
      if (label) label.textContent = 'Feedback';
      return;
    }
    btn.setAttribute('data-state', state);
    if (label) label.textContent = LABEL[state] || 'Feedback';
    // Terminal states linger and then revert, the same way the real app's "Feedback sent" does.
    if (state === 'done' || state === 'failed' || state === 'sent' || state === 'held') {
      btn._revert = setTimeout(function () { setState(btn, null); }, SENT_LINGER_MS);
    }
  }

  var pollTimer = null;
  var pollFailures = 0;
  // Roughly 12s of blips tolerated before giving up. Restarting docs/serve.py mid-run is routine
  // here (it happens on every folder-open), and a run's terminal transition is only ever announced
  // once: miss it and the button reads "Regenerating…" forever and the preview keeps showing the
  // pre-edit render, so a single dropped request must not be what ends the watch.
  var MAX_POLL_FAILURES = 5;

  function startPolling() {
    if (pollTimer) return;
    pollFailures = 0;
    pollTimer = setInterval(poll, POLL_MS);
    poll();
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function poll() {
    fetch('/_api/feedback', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (data) {
        var byId = {};
        (data.entries || []).forEach(function (e) { byId[e.id] = e; });
        var live = 0;
        document.querySelectorAll('.om-review-card').forEach(function (card) {
          if (!card._entryId) return;
          var e = byId[card._entryId];
          if (!e) return;
          var btn = card.querySelector('.om-ds-feedback-btn');
          if (card._lastStatus !== e.status) {
            card._lastStatus = e.status;
            setState(btn, e.status);
            // A finished run has edited the card file on disk; reload the preview so the page
            // shows the result rather than the pre-edit render.
            if (e.status === 'done') reloadPreview(card);
            if (e.status === 'failed') {
              toast('Regenerating "' + e.name + '" failed — see ' + (e.log || '.feedback/') + '.');
            }
          }
          if (e.status === 'queued' || e.status === 'running') live++;
        });
        pollFailures = 0;
        if (!live) stopPolling();
      }).catch(function () {
        if (++pollFailures < MAX_POLL_FAILURES) return;  // the next tick retries
        stopPolling();
        toast('Lost track of the running feedback job — is docs/serve.py still running? ' +
              'Reload once it is back to pick the status up again.');
      });
  }

  function reloadPreview(card) {
    var iframe = card.querySelector('.om-ds-preview-mount iframe');
    if (!iframe) return;
    exitPickMode(card);
    // Cache-bust rather than reassign the same src: the card file just changed on disk, and the
    // 200-from-cache the browser would otherwise serve is exactly the stale render we're replacing.
    var base = iframe.getAttribute('src').split('?')[0];
    iframe.setAttribute('src', base + '?v=' + Date.now());
  }

  /* ============================================================================================
   * THE VISUAL PROPERTY EDITOR
   *
   * The whole point of this project (see CLAUDE.md): Claude Design's own Edit view can't write
   * back to a card's inline Babel script because its preview harness only ever sees a synthetic
   * "/Inline Babel script" filename — no file on disk to splice an edit into. We serve the card
   * file ourselves, so the same jsx:/Inline Babel script:<offset>:<line>:<col> stamp (added by
   * ?srcmap=1 — see docs/serve.py: srcmap_inject) DOES resolve to a real file:line:col, and
   * docs/edit_writeback.mjs can splice the edit in directly.
   *
   * Six properties (border-radius, background, gap, display, width, font-weight), matching
   * .probe/pro-panel-spec.md's real Pro-panel markup and behaviour as closely as a from-scratch
   * DOM (built here, not captured) reasonably can: the width Hug/Fixed/Fill tri-state, the
   * per-property unset affordance (only where the real panel has one), and the token-authored
   * indicator (spec #1: the raw `style` attribute is the authored text, `var(--x)` intact;
   * getComputedStyle is what resolves it — read straight off the live DOM node, no server call
   * needed just to populate the panel).
   *
   * ADDRESSABILITY POLICY — the part the adversarial re-check (see CLAUDE.md) forced a real
   * decision on: an om-id is only trusted when it sits on the EXACT clicked element, never a
   * bubbled ancestor's. Measured own-id rates range from 84% (hand-written cards) down to 0.8%
   * (ui_kits/mobile) precisely because most of a card's surface is drawn by _ds_bundle.js
   * components that never forward the id to their rendered DOM node — bubbling to "the nearest
   * ancestor that has one" would silently report a different element's edit as this one's, which
   * is exactly the `<template id="__doc">`/dangerouslySetInnerHTML collapse defect #2 flagged.
   * Requiring an OWN id sidesteps both failure modes with one rule: no id on the clicked element
   * -> straight to the agentic fallback (the existing Feedback pipeline, given a precise
   * description of the requested change plus the element's selector/breadcrumb) rather than a
   * guess. See applySave() below.
   */

  var PROPS = [
    { key: 'display', css: 'display', label: 'Display', section: 'Layout', type: 'select', unset: true,
      options: ['inline-flex', 'block', 'flex', 'grid', 'inline-block', 'inline', 'none'] },
    { key: 'gap', css: 'gap', label: 'Gap', section: 'Layout', type: 'number', unset: true },
    { key: 'width', css: 'width', label: 'Width', section: 'Sizing', type: 'width', unset: false },
    { key: 'background', css: 'background', label: 'Background', section: 'Appearance', type: 'color', unset: false },
    { key: 'border-radius', css: 'border-radius', label: 'Radius', section: 'Appearance', type: 'number', unset: true },
    { key: 'font-weight', css: 'font-weight', label: 'Weight', section: 'Typography', type: 'weight', unset: true }
  ];

  // Display order/names for the font-weight scale (pro-panel-spec.md #6) — the cards themselves
  // always author the bare number (grepped, confirmed), so this is purely a display convenience;
  // the number is what's ever read from or written to a card file.
  var WEIGHT_NAMES = ['Thin', 'Extra light', 'Light', 'Regular', 'Medium', 'Semibold', 'Bold', 'Extra bold', 'Black'];
  var WEIGHT_VALUES = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  function nearestWeightName(n) {
    n = Number(n) || 400;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < WEIGHT_VALUES.length; i++) {
      var d = Math.abs(WEIGHT_VALUES[i] - n);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return WEIGHT_NAMES[best];
  }
  function weightNameToValue(name) {
    var i = WEIGHT_NAMES.indexOf(name);
    return i === -1 ? 400 : WEIGHT_VALUES[i];
  }

  // A session-scoped id, not a per-edit one: docs/serve.py's /_api/edit/token uses it purely to
  // notice "the same token pushed the same way on several elements in this session" (the writeback
  // policy's own repetition signal) — see build_token_prompt. One id for the whole tab's lifetime
  // is exactly the granularity that signal needs.
  var EDIT_SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* An om-id is only ever trusted on the EXACT element clicked (see the policy note above) — no
     ancestor walk. Format: jsx:/Inline Babel script:<charOffset>:<line>:<col>. */
  function ownOmId(el) {
    var raw = el.getAttribute('data-om-id');
    if (!raw) return null;
    var m = /^jsx:\/Inline Babel script:(\d+):(\d+):(\d+)$/.exec(raw);
    return m ? { charOffset: Number(m[1]), line: Number(m[2]), col: Number(m[3]) } : null;
  }

  /* The live, authored (not computed) value of one property on the selected element, plus
     whatever a token-authored value resolves to right now — read straight off the DOM per
     pro-panel-spec.md #1, no server round trip needed just to populate the panel. */
  function readLive(el, prop) {
    var raw = (el.style.getPropertyValue(prop.css) || '').trim();
    var m = /^var\((--[\w-]+)\)/.exec(raw);
    var computed = '';
    try { computed = (getComputedStyle(el).getPropertyValue(prop.css) || '').trim(); } catch (e) { /* detached */ }
    return { raw: raw, isToken: !!m, token: m ? m[1] : null, computed: computed };
  }

  function widthStateOf(raw) {
    if (!raw) return { mode: 'natural', px: null };
    if (raw === '100%') return { mode: 'fill', px: null };
    var n = parseFloat(raw);
    return { mode: 'fixed', px: isNaN(n) ? null : Math.round(n) };
  }

  /* ---------------------------------------------------------------------------- panel chrome */

  var panelEl = null;
  var panelState = null; // { card, el, doc, rows:{}, orig:{}, current:{}, history:[], redo:[] }

  function ensurePanel() {
    if (panelEl) return panelEl;
    var p = document.createElement('aside');
    p.id = 'om-edit-panel';
    p.innerHTML =
      '<div class="om-ep-head">' +
        '<div class="om-ep-title">Edit<span class="om-ep-subtitle"></span></div>' +
        '<button type="button" class="om-ep-close" title="Close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="om-ep-hint">Click an element in the preview below to edit its style.</div>' +
      '<div class="om-ep-body" style="display:none"></div>' +
      '<div class="om-ep-foot" style="display:none">' +
        '<div class="om-ep-status"></div>' +
        '<div class="om-ep-foot-buttons">' +
          '<button type="button" class="om-ep-undo" title="Undo">Undo</button>' +
          '<button type="button" class="om-ep-redo" title="Redo">Redo</button>' +
          '<button type="button" class="om-ep-discard" title="Discard changes">Discard</button>' +
          '<button type="button" class="om-ep-save">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(p);
    p.querySelector('.om-ep-close').addEventListener('click', function () { closeEditPanel(true); });
    p.querySelector('.om-ep-undo').addEventListener('click', doUndo);
    p.querySelector('.om-ep-redo').addEventListener('click', doRedo);
    p.querySelector('.om-ep-discard').addEventListener('click', function () { discardAll(); });
    p.querySelector('.om-ep-save').addEventListener('click', function () { applySave(); });
    panelEl = p;
    return p;
  }

  function setStatus(text, tone) {
    var s = panelEl && panelEl.querySelector('.om-ep-status');
    if (!s) return;
    s.textContent = text || '';
    if (tone) s.setAttribute('data-tone', tone); else s.removeAttribute('data-tone');
  }

  function buildRowDom(prop) {
    var row = document.createElement('div');
    row.className = 'om-ep-row';
    row.dataset.prop = prop.key;
    var label = document.createElement('div');
    label.className = 'om-ep-row-label';
    label.textContent = prop.label;
    var badge = document.createElement('span');
    badge.className = 'om-ep-token-badge';
    badge.style.display = 'none';
    label.appendChild(badge);
    row.appendChild(label);

    var control = document.createElement('div');
    control.className = 'om-ep-row-control';

    if (prop.type === 'select') {
      var sel = document.createElement('select');
      prop.options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { setLive(prop, sel.value); });
      control.appendChild(sel);
      row._input = sel;
    } else if (prop.type === 'number') {
      var num = document.createElement('input');
      num.type = 'number';
      num.addEventListener('input', function () {
        setLive(prop, num.value === '' ? null : num.value + 'px');
      });
      control.appendChild(num);
      row._input = num;
    } else if (prop.type === 'color') {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0';
      var swatch = document.createElement('input');
      swatch.type = 'color';
      var text = document.createElement('input');
      text.type = 'text';
      function commit(v) { setLive(prop, v); }
      swatch.addEventListener('input', function () { text.value = swatch.value; commit(swatch.value); });
      text.addEventListener('input', function () { commit(text.value); });
      wrap.appendChild(swatch); wrap.appendChild(text);
      control.appendChild(wrap);
      row._input = text; row._swatch = swatch;
    } else if (prop.type === 'weight') {
      var wsel = document.createElement('select');
      WEIGHT_NAMES.forEach(function (n) {
        var opt = document.createElement('option'); opt.value = n; opt.textContent = n; wsel.appendChild(opt);
      });
      wsel.addEventListener('change', function () { setLive(prop, String(weightNameToValue(wsel.value))); });
      control.appendChild(wsel);
      row._input = wsel;
    } else if (prop.type === 'width') {
      var tri = document.createElement('div');
      tri.className = 'om-ep-tristate';
      ['natural', 'fixed', 'fill'].forEach(function (mode) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = mode === 'natural' ? 'Hug' : mode === 'fixed' ? 'Fixed' : 'Fill';
        b.dataset.mode = mode;
        b.addEventListener('click', function () { setWidthMode(mode); });
        tri.appendChild(b);
      });
      var px = document.createElement('input');
      px.type = 'number';
      px.style.width = '64px';
      px.addEventListener('input', function () {
        if (px.value !== '') setLive(prop, Math.round(Number(px.value)) + 'px');
      });
      control.appendChild(tri);
      control.appendChild(px);
      row._tri = tri; row._input = px;
    }

    row.appendChild(control);

    if (prop.unset) {
      var unset = document.createElement('button');
      unset.type = 'button';
      unset.className = 'om-ep-unset';
      unset.title = 'Unset (use inherited)';
      unset.addEventListener('click', function () { setLive(prop, null); });
      row.appendChild(unset);
    }
    return row;
  }

  function setWidthMode(mode) {
    if (mode === 'natural') { setLive(PROPS[2], null); return; }
    if (mode === 'fill') { setLive(PROPS[2], '100%'); return; }
    var row = panelState.rows.width;
    var current = widthStateOf(panelState.current.width || '');
    var px = current.px || Math.round(panelState.el.getBoundingClientRect().width) || 100;
    setLive(PROPS[2], px + 'px');
  }

  /* Refresh one row's displayed controls from panelState.current, without touching the DOM
     element itself — called after every setLive() and after undo/redo. */
  function refreshRow(prop) {
    var row = panelState.rows[prop.key];
    if (!row) return;
    var raw = panelState.current[prop.key] || '';
    var isToken = /^var\(--[\w-]+\)/.test(raw);
    var badge = row.querySelector('.om-ep-token-badge');
    if (badge) {
      badge.style.display = isToken ? '' : 'none';
      badge.textContent = 'token';
      badge.title = isToken ? ('Authored as ' + raw + ' — editing writes the resolved value') : '';
    }
    var computed = '';
    try { computed = (getComputedStyle(panelState.el).getPropertyValue(prop.css) || '').trim(); } catch (e) { /* noop */ }

    if (prop.type === 'select') {
      row._input.value = computed || raw || prop.options[0];
    } else if (prop.type === 'number') {
      var n = parseFloat(raw || computed);
      row._input.value = isNaN(n) ? '' : Math.round(n);
    } else if (prop.type === 'color') {
      var shown = raw || computed;
      row._input.value = shown;
      var hex = /^#[0-9a-fA-F]{6}$/.test(shown) ? shown : rgbToHex(shown);
      if (hex) row._swatch.value = hex;
    } else if (prop.type === 'weight') {
      var wn = parseFloat(raw || computed) || 400;
      row._input.value = nearestWeightName(wn);
    } else if (prop.type === 'width') {
      var ws = widthStateOf(raw);
      Array.prototype.forEach.call(row._tri.children, function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.mode === ws.mode));
      });
      row._input.style.display = ws.mode === 'fixed' ? '' : 'none';
      if (ws.mode === 'fixed' && ws.px != null) row._input.value = ws.px;
    }

    row.setAttribute('data-unset', raw ? '0' : '1');
  }

  function rgbToHex(v) {
    var m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v || '');
    if (!m) return null;
    return '#' + [1, 2, 3].map(function (i) {
      return ('0' + parseInt(m[i], 10).toString(16)).slice(-2);
    }).join('');
  }

  function isDirty() {
    var p = panelState;
    return PROPS.some(function (prop) { return (p.current[prop.key] || '') !== (p.orig[prop.key] || ''); });
  }

  function updateFootButtons() {
    if (!panelEl) return;
    panelEl.querySelector('.om-ep-undo').disabled = !panelState.history.length;
    panelEl.querySelector('.om-ep-redo').disabled = !panelState.redo.length;
    var dirty = isDirty();
    panelEl.querySelector('.om-ep-discard').disabled = !dirty;
    panelEl.querySelector('.om-ep-save').disabled = !dirty;
  }

  /* Apply one property change to the live element (instant visual feedback in the preview),
     recording enough to undo it. `rawOrNull` is a real CSS value string, or null to unset. */
  function setLive(prop, rawOrNull) {
    var el = panelState.el;
    var before = el.style.getPropertyValue(prop.css);
    if (rawOrNull === null) el.style.removeProperty(prop.css); else el.style.setProperty(prop.css, rawOrNull);
    var after = el.style.getPropertyValue(prop.css);
    // A control can report a redundant 'change' for a value that didn't actually move (e.g. a
    // browser/automation firing both an input-driven change and an explicit one for the same
    // commit) — matches docs/edit_writeback.mjs's own idempotency stance (an already-equal write
    // is a no-op, not a no-op *history entry*): recording it anyway would make one Undo silently
    // do nothing, which reads as a broken button rather than as "there was nothing to undo yet".
    if (before === after) { refreshRow(prop); updateFootButtons(); return; }
    panelState.history.push({ key: prop.key, before: before });
    panelState.redo = []; // a fresh edit invalidates whatever redo history there was
    panelState.current[prop.key] = after;
    refreshRow(prop);
    updateFootButtons();
  }

  function applyRaw(key, raw) {
    var prop = PROPS.filter(function (p) { return p.key === key; })[0];
    var el = panelState.el;
    if (raw) el.style.setProperty(prop.css, raw); else el.style.removeProperty(prop.css);
    panelState.current[key] = el.style.getPropertyValue(prop.css);
    refreshRow(prop);
  }

  function doUndo() {
    var h = panelState.history.pop();
    if (!h) return;
    var prop = PROPS.filter(function (p) { return p.key === h.key; })[0];
    var beforeUndo = panelState.el.style.getPropertyValue(prop.css);
    applyRaw(h.key, h.before);
    panelState.redo.push({ key: h.key, before: beforeUndo });
    updateFootButtons();
  }

  function doRedo() {
    var h = panelState.redo.pop();
    if (!h) return;
    var prop = PROPS.filter(function (p) { return p.key === h.key; })[0];
    var beforeRedo = panelState.el.style.getPropertyValue(prop.css);
    applyRaw(h.key, h.before);
    panelState.history.push({ key: h.key, before: beforeRedo });
    updateFootButtons();
  }

  /* Full revert: every property back to what it was when this element was selected. Used by
     Discard, and by closing the panel without saving. */
  function discardAll() {
    if (!panelState) return;
    PROPS.forEach(function (prop) { applyRaw(prop.key, panelState.orig[prop.key] || ''); });
    panelState.history = []; panelState.redo = [];
    updateFootButtons();
    setStatus('Discarded.', null);
  }

  /* ------------------------------------------------------------------------ element selection */

  function selectElement(card, el) {
    var doc = el.ownerDocument;
    panelState = {
      card: card, el: el, doc: doc,
      rows: {}, orig: {}, current: {}, history: [], redo: []
    };
    var body = panelEl.querySelector('.om-ep-body');
    body.style.display = '';
    body.innerHTML = '';
    panelEl.querySelector('.om-ep-foot').style.display = '';
    panelEl.querySelector('.om-ep-hint').style.display = 'none';

    var lastSection = null;
    PROPS.forEach(function (prop) {
      if (prop.section !== lastSection) {
        lastSection = prop.section;
        var h = document.createElement('div');
        h.className = 'om-ep-section-label';
        h.textContent = prop.section;
        body.appendChild(h);
      }
      var row = buildRowDom(prop);
      panelState.rows[prop.key] = row;
      body.appendChild(row);
      var live = readLive(el, prop);
      panelState.orig[prop.key] = live.raw;
      panelState.current[prop.key] = live.raw;
      refreshRow(prop);
    });

    var sub = panelEl.querySelector('.om-ep-subtitle');
    if (sub) sub.textContent = describeElement(el, true);
    setStatus('', null);
    updateFootButtons();
  }

  /* ----------------------------------------------------------------------------------- save */

  /* Classify + write one property, or report why it can't be written directly. Returns a Promise
     resolving to { done:true } | { tokenEdit:{...} } | { agentic:string }. */
  function saveOneProperty(prop, omId, path) {
    var newRaw = panelState.current[prop.key] || '';
    var wasUnset = !newRaw;
    if (wasUnset) {
      return postJSON('/_api/edit/apply', {
        path: path, charOffset: omId.charOffset, property: prop.key, allowUnset: true
      }).then(function (r) {
        if (r.ok) return { done: true };
        // Deleting a token-authored declaration is still an edit whose intent isn't ours to
        // guess (does removing the USE also mean the token itself is wrong?) — same "ask,
        // don't choose" rule as a value change, just phrased as a removal.
        return { agentic: prop.label + ': remove the ' + prop.key + ' declaration (was ' +
          (panelState.orig[prop.key] || 'unset') + ').' };
      });
    }
    return postJSON('/_api/edit/resolve', { path: path, charOffset: omId.charOffset, property: prop.key })
      .then(function (r) {
        if (!r.ok || !r.elementFound) {
          return { agentic: prop.label + ': set to ' + newRaw + ' (element not resolvable in source).' };
        }
        if (r.property === 'present' && r.authoredKind === 'token') {
          return { tokenEdit: {
            property: prop.key, token: r.authoredToken,
            oldResolvedValue: r.resolvedValue, newResolvedValue: newRaw
          } };
        }
        if (r.property === 'present' && r.authoredKind === 'literal') {
          return applyWrite({ path: path, charOffset: omId.charOffset, property: prop.key, newValue: writeValue(prop, newRaw) });
        }
        if (r.property === 'missing') {
          return applyWrite({ path: path, charOffset: omId.charOffset, property: prop.key, newValue: writeValue(prop, newRaw), allowMissing: true });
        }
        return { agentic: prop.label + ': set to ' + newRaw + ' (' + (r.reason || r.property || 'unsupported shape') + ').' };
      });
  }

  function applyWrite(payload) {
    return postJSON('/_api/edit/apply', payload).then(function (r) {
      if (r.ok) return { done: true };
      return { agentic: payload.property + ': write refused (' + (r.reason || 'unknown') + ').' };
    });
  }

  function writeValue(prop, raw) {
    if (prop.key === 'width') return raw === '100%' ? 'fill' : Math.round(parseFloat(raw));
    if (prop.key === 'gap' || prop.key === 'border-radius') return Math.round(parseFloat(raw));
    if (prop.key === 'font-weight') return Math.round(parseFloat(raw));
    return raw; // display, background: plain CSS keyword/color strings
  }

  function applySave() {
    if (!panelState || !isDirty()) return;
    var card = panelState.card, el = panelState.el;
    var path = card.getAttribute('data-card-path');
    var omId = ownOmId(el);
    var dirtyProps = PROPS.filter(function (p) { return (panelState.current[p.key] || '') !== (panelState.orig[p.key] || ''); });
    panelEl.querySelector('.om-ep-save').disabled = true;
    setStatus('Saving…', null);

    var descriptor = descriptorOf(el);
    var agenticNotes = [];
    var tokenEdits = [];
    var chain = Promise.resolve();

    if (!omId) {
      // No own id on the exact clicked element -- per the addressability policy above, every
      // change on this element goes through the agentic route, not just the ones that would.
      dirtyProps.forEach(function (p) {
        agenticNotes.push(p.label + ': set to ' + (panelState.current[p.key] || '(unset)') + '.');
      });
    } else {
      dirtyProps.forEach(function (prop) {
        // Sequential, not Promise.all: each write re-resolves the file fresh from disk, and two
        // edits to the SAME style object literal can shift each other's character offsets, so
        // the next resolve must only ever start after the previous write has landed.
        chain = chain.then(function () { return saveOneProperty(prop, omId, path); }).then(function (res) {
          if (res.tokenEdit) tokenEdits.push(res.tokenEdit);
          if (res.agentic) agenticNotes.push(res.agentic);
        });
      });
    }

    chain.then(function () {
      var jobs = [];
      tokenEdits.forEach(function (te) {
        jobs.push(postJSON('/_api/edit/token', {
          path: path, name: card.getAttribute('data-card-name'), property: te.property, token: te.token,
          oldResolvedValue: te.oldResolvedValue, newResolvedValue: te.newResolvedValue,
          element: descriptor, session: EDIT_SESSION_ID
        }).then(function (r) { return r.entry && r.entry.id; }));
      });
      if (agenticNotes.length) {
        jobs.push(postJSON('/_api/feedback', {
          path: path, name: card.getAttribute('data-card-name'),
          text: 'Property edit requested via the visual editor:\n' + agenticNotes.join('\n') +
            '\n(one or more of these could not be located precisely in this card\'s own inline ' +
            'script — locate the element from the description below and apply the same change.)',
          element: descriptor, selector: selectorOf(el)
        }).then(function (r) { return r.entry && r.entry.id; }));
      }

      var wroteLiteral = dirtyProps.length > (tokenEdits.length + agenticNotes.length);
      if (wroteLiteral) reloadPreview(card);
      // Whatever got written directly is no longer "dirty" against the file; token/agentic jobs
      // stay pending until they land, but the panel's own diff is against the live DOM, which
      // already shows the requested value either way.
      dirtyProps.forEach(function (p) { panelState.orig[p.key] = panelState.current[p.key]; });
      updateFootButtons();

      if (!jobs.length) {
        setStatus('Saved.', 'ok');
        return;
      }
      setStatus(jobs.length + ' change' + (jobs.length > 1 ? 's' : '') + ' sent to Claude to apply…', null);
      Promise.all(jobs).then(function (ids) {
        pollPanelJobs(card, ids.filter(Boolean));
      });
    }).catch(function (err) {
      setStatus('Save failed: ' + err.message, 'error');
      panelEl.querySelector('.om-ep-save').disabled = false;
    });
  }

  var panelPollTimer = null;
  function pollPanelJobs(card, ids) {
    if (!ids.length) return;
    clearInterval(panelPollTimer);
    panelPollTimer = setInterval(function () {
      fetch('/_api/feedback', { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (data) {
          var byId = {};
          (data.entries || []).forEach(function (e) { byId[e.id] = e; });
          var pending = ids.filter(function (id) {
            var e = byId[id];
            return e && (e.status === 'queued' || e.status === 'running');
          });
          if (pending.length < ids.length) {
            var anyFailed = ids.some(function (id) { return byId[id] && byId[id].status === 'failed'; });
            if (!pending.length) {
              clearInterval(panelPollTimer);
              setStatus(anyFailed ? 'Claude could not apply one or more changes — see .feedback/.' : 'Applied.',
                anyFailed ? 'error' : 'ok');
              if (panelState && panelState.card === card) reloadPreview(card);
            }
          }
        }).catch(function () { /* next tick retries */ });
    }, 2500);
  }

  /* ------------------------------------------------------------------------------ open/close */

  // Which card the panel is currently attached to — tracked separately from panelState, which is
  // about the currently SELECTED ELEMENT and is deliberately null until a pick lands. Closing the
  // panel before ever picking anything is a normal path (open it, change your mind, hit ×), and
  // it still has to un-arm the picker and drop the card's srcmap-instrumented preview src; using
  // panelState.card for that would silently no-op on exactly that path, since panelState IS null.
  var activeEditCard = null;

  function openEditPanel(card) {
    ensurePanel();
    if (isOpen(card)) closeBox(card); // mutual exclusion with the feedback composer
    var iframe = card.querySelector('.om-ds-preview-mount iframe');
    if (!iframe) return;
    activeEditCard = card;
    var base = iframe.getAttribute('src').split('?')[0];
    // ?srcmap=1 is what makes data-om-id exist at all (see docs/serve.py) — the plain preview
    // src cards load at rest has none of this instrumentation, by design (pixel fidelity at
    // rest: nothing about entering edit mode may change what a JS-off load looks like).
    iframe.setAttribute('src', base + '?srcmap=1&v=' + Date.now());
    // Always wait for this navigation's own 'load' — never shortcut via readyState, which reads
    // 'complete' for the OLD document for a brief window right after setAttribute('src', ...)
    // triggers the new one (the swap isn't synchronous). Arming against that stale document's
    // contentDocument would attach listeners to an object the incoming navigation is about to
    // discard, and the resulting "click does nothing" has no error to surface it: the load event
    // is the only signal that the new (srcmap-instrumented) document actually exists yet.
    iframe.addEventListener('load', function arm() {
      enterPickMode(card, function (el) { selectElement(card, el); }, function () { closeEditPanel(true); });
    }, { once: true });
    card.setAttribute('data-editing', '1');
    // Docks the panel (docs/gallery.css) rather than letting it overlay the page: found by
    // actually driving this in a browser, not by inspection — a fixed fixed-position panel over
    // a card whose own Feedback/Edit buttons sit near the right edge makes those buttons
    // physically unclickable (verified: Playwright's actionability check reports the panel's own
    // subtree "intercepts pointer events" on exactly that pair) without shrinking the content
    // that sits under it.
    document.body.classList.add('om-edit-panel-open');
    panelEl.setAttribute('data-open', '1');
    panelEl.querySelector('.om-ep-subtitle').textContent = card.getAttribute('data-card-name') || '';
    panelEl.querySelector('.om-ep-body').style.display = 'none';
    panelEl.querySelector('.om-ep-foot').style.display = 'none';
    panelEl.querySelector('.om-ep-hint').style.display = '';
    panelState = null;
  }

  function closeEditPanel(discard) {
    if (discard && panelState) discardAll();
    var card = activeEditCard;
    if (panelEl) panelEl.removeAttribute('data-open');
    document.body.classList.remove('om-edit-panel-open');
    if (card) {
      card.removeAttribute('data-editing');
      exitPickMode(card);
      // Drop back to the plain, uninstrumented preview src — nothing about the srcmap opt-in
      // should linger once editing stops.
      var iframe = card.querySelector('.om-ds-preview-mount iframe');
      if (iframe) {
        var base = iframe.getAttribute('src').split('?')[0];
        iframe.setAttribute('src', base);
      }
    }
    activeEditCard = null;
    panelState = null;
    clearInterval(panelPollTimer);
  }

  /* ------------------------------------------------------------------------------ wiring */

  function wire(card) {
    var fb = card.querySelector('.om-ds-feedback-btn');
    if (fb) {
      fb.addEventListener('click', function () {
        if (isOpen(card)) closeBox(card); else openBox(card);
      });
    }

    var edit = card.querySelector('.om-ds-edit-btn');
    if (edit) {
      edit.addEventListener('click', function () {
        postJSON('/_api/open', { path: card.getAttribute('data-card-path') })
          .catch(function (err) {
            toast('Could not open the file: ' + err.message);
          });
      });

      // The visual property editor's own trigger — built here at runtime, never emitted by
      // gen_gallery.py (see CLAUDE.md: "pixel fidelity at rest" / "New UI is additive and
      // hidden until invoked"), cloned off the Edit button so it inherits the same button-family
      // classes verbatim rather than a second copy of that long Tailwind-utility string living
      // in this file too. `edit` itself keeps opening VS Code — see .probe/gallery-interactive.mjs,
      // which still asserts exactly that — this is a new, separate affordance next to it.
      var props = edit.cloneNode(true);
      props.className = props.className.replace('om-ds-edit-btn', 'om-ds-props-btn');
      props.title = 'Edit ' + (card.getAttribute('data-card-name') || 'this card') + ' visually';
      var propsLabel = props.querySelector('span');
      if (propsLabel) propsLabel.innerHTML =
        '<i class="ai-Sliders leading-none not-italic w-[1em] h-[1em] inline-flex items-center ' +
        'justify-center shrink-0" style="font-size:11px"></i>Edit properties';
      edit.insertAdjacentElement('afterend', props);
      props.addEventListener('click', function () { openEditPanel(card); });
    }

    var cancel = card.querySelector('.om-ds-cancel');
    if (cancel) cancel.addEventListener('click', function () { closeBox(card); });

    var submit = card.querySelector('.om-ds-submit');
    if (submit) submit.addEventListener('click', function () { submitFeedback(card); });

    var clear = card.querySelector('.om-ds-element-chip button');
    if (clear) clear.addEventListener('click', function () { clearElement(card); });

    var ta = card.querySelector('.om-ds-feedback-box textarea');
    if (ta) {
      ta.addEventListener('input', function () { autosize(ta); syncSubmit(card); });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeBox(card); }
        // ⌘/Ctrl+Enter submits — the usual composer shortcut, and the only way to submit without
        // leaving the textarea.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitFeedback(card); }
      });
    }

    // A lazy iframe usually isn't loaded when the box is first opened; re-arm on load so picking
    // starts working the moment it is, without the user having to close and reopen.
    var iframe = card.querySelector('.om-ds-preview-mount iframe');
    if (iframe) {
      iframe.addEventListener('load', function () {
        if (isOpen(card) && !card._element) enterPickMode(card);
      });
    }
  }

  document.querySelectorAll('.om-review-card').forEach(wire);

  // Any run still in flight from a previous page load keeps its own status on the server; this
  // page just doesn't know which card it belongs to until it polls once.
  fetch('/_api/feedback', { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function (data) {
      var live = (data.entries || []).filter(function (e) {
        return e.status === 'queued' || e.status === 'running';
      });
      live.forEach(function (e) {
        // No CSS.escape here: the value sits inside quotes in the attribute selector, where a
        // repo-relative path needs no escaping — running it through CSS.escape would actively
        // break it by backslash-escaping every `/`.
        var card = document.querySelector('.om-review-card[data-card-path="' + e.path + '"]');
        if (card && !card._entryId) { card._entryId = e.id; card._lastStatus = null; }
      });
      if (live.length) startPolling();
    }).catch(function () { /* server not up: buttons will report it on first click */ });
})();
