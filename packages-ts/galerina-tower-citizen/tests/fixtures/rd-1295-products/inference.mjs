import { createHybridEngine } from '@galerina/tower-citizen/inference';
export const available = typeof createHybridEngine === 'function';
