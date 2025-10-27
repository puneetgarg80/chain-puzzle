import type Matter from 'matter-js';

declare global {
  interface Window {
    Matter: typeof Matter;
  }
}
