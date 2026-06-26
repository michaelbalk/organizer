/** Minimal LCARS-tinted interstitial page for sign-in / connect outcomes. */
export function page(heading: string, body: string, linkHref = '/', linkText = 'Return to Organizer'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Organizer</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#000;color:#f4ead2;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#0c0c0c;border:1px solid #ff9900;padding:40px 48px;border-radius:16px;text-align:center;max-width:440px;
box-shadow:0 10px 40px rgba(0,0,0,.6)}h1{margin:0 0 12px;font-size:22px;color:#ff9900}
p{margin:0 0 20px;color:#d8a657;line-height:1.5}
a{display:inline-block;background:#ff9900;color:#000;text-decoration:none;font-weight:600;
padding:10px 22px;border-radius:999px}</style></head>
<body><div class="card"><h1>${esc(heading)}</h1><p>${esc(body)}</p><a href="${esc(linkHref)}">${esc(linkText)}</a></div></body></html>`
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}
