/**
 * Yori Living Context SPA Entry
 * Governed by Architecture Rev3 Section 5 and AC-105-1.
 */

import './ui/living-context/styles.css';
import './ui/living-context/quiet-precision.css';
import { renderApp } from './ui/living-context/app.js';

const appEl = document.getElementById('app');
if (appEl) {
  renderApp(appEl, 'clear');
}
