/* ROOTS E-Mail-Signatur: eine Vorlage fuer Intranet ("Mein Profil") und Onboarding.
 * Outlook uebernimmt nur Inline-Styles und absolute Bild-URLs, deshalb kein CSS. */
(function () {
  const LOGO_URL = 'https://pgoutzeris-stack.github.io/ROOTS_Intranet/assets/signature/ROOTS_regular_blk.png';
  const WEBSITE_URL = 'https://www.roots-consultants.com/';
  const COMPANY = 'ROOTS Brand Strategy Consultants GmbH';
  const FONT = 'font-family:Aptos,Arial,Helvetica,sans-serif;font-size:11pt;color:#000000';

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function telHref(phone) {
    return 'tel:' + String(phone).replace(/[^\d+]/g, '');
  }

  function normalizeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
  }

  // profile: { full_name, email, phone, linkedin_url }
  function build(profile) {
    const p = profile || {};
    const name = String(p.full_name || '').trim();
    const email = String(p.email || '').trim();
    const phone = String(p.phone || '').trim();
    const linkedin = normalizeUrl(p.linkedin_url);

    const missing = [];
    if (!name) missing.push('Name');
    if (!phone) missing.push('Telefon');
    if (!email) missing.push('E-Mail');
    if (!linkedin) missing.push('LinkedIn');

    const line = (inner) => `<p style="margin:0;${FONT}">${inner}</p>`;
    const gap = `<p style="margin:0;${FONT}">&nbsp;</p>`;
    const link = (href, text) => `<a href="${esc(href)}" style="${FONT};text-decoration:none">${esc(text)}</a>`;

    const parts = [
      line(`<b>${esc(name || 'Name fehlt')}</b>`),
      line(esc(COMPANY)),
      gap,
      `<p style="margin:0"><img src="${LOGO_URL}" width="150" height="33" alt="ROOTS" style="display:block;width:150px;height:33px;border:0"></p>`,
      gap,
    ];
    if (phone) parts.push(line(link(telHref(phone), phone)));
    if (email) parts.push(line(link('mailto:' + email, email)));
    parts.push(line(
      link(WEBSITE_URL, 'Website') + (linkedin ? '&nbsp;I&nbsp;' + link(linkedin, 'LinkedIn') : '')
    ));

    const plainLines = [name, COMPANY, '', 'ROOTS', ''];
    if (phone) plainLines.push(phone);
    if (email) plainLines.push(email);
    plainLines.push('Website' + (linkedin ? ' I LinkedIn' : ''));
    const plain = plainLines.join('\n');

    return { html: parts.join(''), plain, missing };
  }

  async function copy(html, plain) {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([doc], { type: 'text/html' }),
        'text/plain': new Blob([plain || ''], { type: 'text/plain' }),
      })]);
      return true;
    } catch (_) {
      try { await navigator.clipboard.writeText(plain || ''); return true; } catch (__) { return false; }
    }
  }

  window.RootsSignature = { build, copy, LOGO_URL };
})();
