// Minimal valid multi-page PDF generator (no external deps) so tests can
// validate that per-page extraction respects REAL page boundaries.
//
// Produces a PDF with one line of distinct text per page using standard
// content stream operators (BT/ET, Tf, Td, Tj). Good enough for pdf.js to
// reconstruct the text layer deterministically.

function escapePdfString(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Single-page content stream drawing `text` at x=40, y=700.
function pageContent(text) {
  return `BT /F1 24 Tf 40 700 Td (${escapePdfString(text)}) Tj ET`;
}

// Assembles a multi-page PDF. Each page's text is a distinct marker so we can
// assert per-chunk page attribution after chunking.
export function makeMultiPagePdf(pages) {
  const n = pages.length;
  const fontId = 3; // catalog=1, pagetree=2, font=3
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');

  const entries = [];
  let serial = '%PDF-1.4\n';

  function emit(s) {
    entries.push({ offset: serial.length, text: `${s}\n` });
    serial += `${s}\n`;
  }

  emit('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  emit(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj`);
  emit(`${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);
  for (let i = 0; i < n; i += 1) {
    const c = pageContent(pages[i]);
    const cBuf = Buffer.from(c, 'latin1');
    const pageObjId = 4 + i * 2;
    const contentObjId = 5 + i * 2;
    emit(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj`);
    emit(`${contentObjId} 0 obj\n<< /Length ${cBuf.length} >>\nstream\n${c}\nendstream\nendobj`);
  }

  const xrefOffset = serial.length;
  serial += `xref\n0 ${entries.length + 1}\n`;
  serial += '0000000000 65535 f \n';
  for (const e of entries) {
    serial += `${String(e.offset).padStart(10, '0')} 00000 n \n`;
  }
  serial += `trailer\n<< /Size ${entries.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(serial, 'latin1');
}
