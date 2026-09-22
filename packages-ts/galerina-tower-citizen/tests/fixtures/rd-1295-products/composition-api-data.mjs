import { collapse } from '@galerina/tower-citizen/governance';
import { admitRow } from '@galerina/tower-citizen/dataplane';
export const available = typeof collapse === 'function' && typeof admitRow === 'function';
