import { TowerRuntime } from '@galerina/tower-citizen/governance-v1';
import { collapse } from '@galerina/tower-citizen/governance-v1';
export const available = typeof TowerRuntime === 'function' && typeof collapse === 'function';
