// pdf.js for the browser, with its worker served by Vite. Imported lazily, only when a PDF is uploaded.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default pdfjs;
