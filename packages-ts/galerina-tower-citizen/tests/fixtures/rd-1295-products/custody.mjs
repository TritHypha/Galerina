import { checkLease } from '@galerina/tower-citizen/custody';
export const available = typeof checkLease === 'function';
