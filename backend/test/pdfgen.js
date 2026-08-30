import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument, rgb } from 'pdf-lib';

// Primary PDF generator using pdfkit (simpler, compatible with legacy pdf.js)
async function makePdfKitPdf(pageTexts) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', (err) => {
      reject(err);
    });

    // Add each page with the given text
    for (let i = 0; i < pageTexts.length; i++) {
      if (i > 0) {
        doc.addPage();
      }
      doc.fontSize(12);
      doc.text(pageTexts[i], 50, 700);
    }

    doc.end();
  });
}

// Fallback PDF generator using pdf-lib
async function makePdfLibPdf(pageTexts) {
  const pdfDoc = await PDFLibDocument.create();

  for (const text of pageTexts) {
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { height } = page.getSize();
    page.drawText(text, {
      x: 50,
      y: height - 100,
      size: 12,
      color: rgb(0, 0, 0),
    });
  }

  // Disable compression to ensure compatibility with legacy pdf.js parser
  const pdfBytes = await pdfDoc.save({
    compress: false,
  });
  return Buffer.from(pdfBytes);
}

// Generate valid multi-page PDFs using pdfkit library.
// This ensures compatibility with pdf-parse and the bundled pdf.js parser.
export async function makeMultiPagePdf(pageTexts) {
  return makePdfKitPdf(pageTexts);
}
