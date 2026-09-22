/** TPL correctness oracle cluster. Shared arithmetic primitives remain internal. */
export {
  TPLSimulator, TritState, SecurityTrap, TPLIntegrityFault,
  asTrit, sumTrit, xorTrit, carryTrit, addTrit, mulTrit, consensusTrit, negT,
} from "./tpl-simulator.js";
export type { Trit } from "./tpl-simulator.js";
