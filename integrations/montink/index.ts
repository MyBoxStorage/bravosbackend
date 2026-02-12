/**
 * Barrel export para integração Montink
 * 
 * Exporta client e types para uso em outras partes do backend
 */

export { montinkRequest } from './client.js';
export type {
  MontinkProduct,
  MontinkShippingQuote,
  MontinkOrderRequest,
  MontinkOrderResponse,
} from './types.js';

export { getMontinkShippingQuote } from './shipping.js';
export type {
  MontinkShippingQuoteParams,
  MontinkShippingOption,
} from './shipping.js';

export { mapOrderToMontinkPayload } from './mappers.js';

export { getMontinkOrder, listMontinkProducts, createMontinkOrder } from './orders.js';
