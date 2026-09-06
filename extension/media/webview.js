// Sonora Design — webview shell relay (docs/EXTENSION-PLAN.md §4 "1.1" deliverable 4).
//
// Thin on purpose: this order only wires the pipe. Order 1.2 adds the actual
// sonora: message handlers on the host side (showTextDocument, toasts, etc. —
// see EXTENSION-PLAN.md §2's bridge-protocol table); this file never inspects
// message contents beyond the "sonora:" prefix, so 1.2 needs no change here.
(function () {
  const vscode = acquireVsCodeApi();
  const iframe = document.getElementById('gallery');
  // Threaded through as a data attribute rather than templated into an inline
  // script, so the panel's CSP never needs 'unsafe-inline' for script-src.
  const galleryOrigin = document.body.dataset.galleryOrigin;

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('sonora:')) return;

    if (event.source === iframe.contentWindow) {
      // gallery -> host
      vscode.postMessage(data);
      return;
    }

    // host -> gallery. Anything not from the iframe is, by elimination, from the
    // extension host (panel.webview.postMessage) — there is no third party in this page.
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage(data, galleryOrigin);
    }
  });
})();
