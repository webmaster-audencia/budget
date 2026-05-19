import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Capture une zone DOM (la vue dashboard courante) et génère un PDF A4 portrait
 * propre, adapté au reporting interne.
 */
export async function exportNodeToPdf(
  node: HTMLElement,
  fileName: string
): Promise<void> {
  // marquage temporaire pour cacher les éléments .no-print pendant la capture
  node.classList.add('export-zone');
  try {
    const canvas = await html2canvas(node, {
      backgroundColor: '#f7f2e9',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableW = pageW - margin * 2;

    // hauteur proportionnelle du PNG ramenée à la largeur utile
    const ratio = canvas.height / canvas.width;
    const imgH = usableW * ratio;

    if (imgH <= pageH - margin * 2) {
      // tient sur une page
      pdf.addImage(imgData, 'PNG', margin, margin, usableW, imgH, undefined, 'FAST');
    } else {
      // multi-pages : on découpe verticalement
      const pageImgH = pageH - margin * 2;
      // Hauteur de la portion source (en px du canvas) qui correspond à une page utile
      const sliceHpx = (pageImgH / ratio) * (canvas.width / usableW);
      const totalPxH = canvas.height;
      let yPx = 0;
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = canvas.width;
      const ctx = tmpCanvas.getContext('2d')!;
      let first = true;
      while (yPx < totalPxH) {
        const h = Math.min(sliceHpx, totalPxH - yPx);
        tmpCanvas.height = h;
        ctx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
        ctx.fillStyle = '#f7f2e9';
        ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
        ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
        const slice = tmpCanvas.toDataURL('image/png');
        if (!first) pdf.addPage();
        const sliceImgH = (h / canvas.width) * usableW;
        pdf.addImage(slice, 'PNG', margin, margin, usableW, sliceImgH, undefined, 'FAST');
        yPx += h;
        first = false;
      }
    }

    pdf.save(fileName);
  } finally {
    node.classList.remove('export-zone');
  }
}
