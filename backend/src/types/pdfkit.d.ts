declare module 'pdfkit' {
  // Minimal PDFKit typing used by our export helpers.
  // Avoid depending on @types/pdfkit in production-only installs.
  export default class PDFDocument {
    constructor(options?: any);
    on(event: string, listener: (...args: any[]) => void): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: any): this;
    moveDown(lines?: number): this;
    end(): void;
  }
}

