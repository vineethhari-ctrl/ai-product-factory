import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProductDefinition } from '../types';
import { PrototypeViewer } from './PrototypeViewer';
import { installValidationShim } from './validateShim';
import './viewer.css';

// The stand-alone prototype file carries its definition in <script id="prototype-data" type="application/json">.
installValidationShim();
const root = document.getElementById('root')!;
try {
  const raw = document.getElementById('prototype-data')?.textContent;
  if (!raw) throw new Error('This file has no prototype inside it.');
  const definition = JSON.parse(raw) as ProductDefinition;
  createRoot(root).render(
    <StrictMode>
      <PrototypeViewer definition={definition} />
    </StrictMode>,
  );
} catch (e) {
  root.textContent = `The prototype could not be opened: ${(e as Error).message}`;
}
