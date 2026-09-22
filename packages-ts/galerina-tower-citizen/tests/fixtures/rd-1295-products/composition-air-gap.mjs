import { createCertifiedTower } from '@galerina/tower-citizen/inference';
import { TPLSimulator } from '@galerina/tower-citizen/tpl';
export const available = typeof createCertifiedTower === 'function' && typeof TPLSimulator === 'function';
