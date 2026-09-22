import { collapse } from '@galerina/tower-citizen/governance';
import { admitPhotonicConfig } from '@galerina/tower-citizen/photonic';
export const available = typeof collapse === 'function' && typeof admitPhotonicConfig === 'function';
