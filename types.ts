
import type Matter from 'matter-js';

declare global {
  interface Window {
    Matter: typeof Matter;
  }
}

export enum GameState {
  IDLE,
  LINK_OPENED,
  CONNECTING,
}

export interface OpenLinkInfo {
  body: Matter.Body;
  originalConstraints: Matter.Constraint[];
  connectedEnds: Matter.Body[];
  newConstraints: Matter.Constraint[];
}
