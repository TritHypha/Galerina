import { TowerRuntime } from '@galerina/tower-citizen/kernel';
import { checkLease } from '@galerina/tower-citizen/custody';
export const available = typeof TowerRuntime === 'function' && typeof checkLease === 'function';
