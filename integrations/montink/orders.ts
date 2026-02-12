/**
 * Funções para integração com API Montink - Pedidos
 * 
 * ⚠️ IMPORTANTE: A API Montink documentada possui apenas endpoints GET.
 * Não há endpoint POST documentado para criar pedidos.
 * 
 * Endpoints disponíveis:
 * - GET /order/{IDPEDIDO} - Buscar pedido por ID
 * - GET /products - Listar produtos
 * - GET /calculate_shipping/{CEP}/{QTD} - Calcular frete
 * 
 * Quando o endpoint POST /order estiver disponível oficialmente,
 * a função createMontinkOrder será implementada.
 */

import { montinkRequest } from './client.js';
import { logger } from '../../utils/logger.js';
import type { MontinkOrderResponse } from './types.js';

/**
 * Busca um pedido na Montink por ID
 * 
 * @param orderId - ID do pedido na Montink
 * @returns Dados do pedido
 * @throws Error se a requisição falhar
 */
export async function getMontinkOrder(orderId: string): Promise<MontinkOrderResponse> {
  logger.info(`Montink: Getting order ${orderId}`);
  
  try {
    const order = await montinkRequest<MontinkOrderResponse>(
      'GET',
      `/order/${orderId}`
    );
    
    logger.info(`Montink: Order ${orderId} retrieved successfully`);
    return order;
  } catch (error) {
    logger.error(`Montink: Failed to get order ${orderId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Lista produtos disponíveis na Montink
 * 
 * @returns Array de produtos
 * @throws Error se a requisição falhar
 */
export async function listMontinkProducts(): Promise<any[]> {
  logger.info('Montink: Listing products');
  
  try {
    const products = await montinkRequest<any[]>(
      'GET',
      '/products'
    );
    
    logger.info(`Montink: Retrieved ${products.length} products`);
    return products;
  } catch (error) {
    logger.error(`Montink: Failed to list products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * ⚠️ BLOQUEADA: Criar pedido na Montink
 * 
 * Esta função está BLOQUEADA porque:
 * - O endpoint POST para criar pedidos NÃO está documentado na API pública da Montink (api.montink.com)
 * - Buscas extensivas não encontraram documentação oficial do endpoint/payload
 * - Apenas endpoints GET estão disponíveis oficialmente:
 *   - GET /order/{IDPEDIDO}
 *   - GET /products
 *   - GET /calculate_shipping/{CEP}/{QTD}
 * 
 * ⚠️ NÃO INVENTAR endpoint ou payload sem documentação oficial.
 * 
 * Para implementar quando documentação estiver disponível:
 * 1. Consultar template de solicitação: MONTINK_SUPPORT_REQUEST_TEMPLATE.md
 * 2. Solicitar documentação oficial via suporte@montink.com.br
 * 3. Após receber documentação:
 *    a. Definir tipos MontinkCreateOrderRequest e MontinkCreateOrderResponse
 *    b. Implementar POST usando montinkRequest com path/headers/body corretos
 *    c. Validar response e extrair montinkOrderId
 *    d. Testar com pedidos de teste
 *    e. Ativar feature flag MONTINK_CREATE_ORDER_ENABLED=true
 * 
 * @param payload - Payload do pedido (gerado por mapOrderToMontinkPayload)
 * @returns Response com ID do pedido criado na Montink
 * @throws Error sempre (função bloqueada até documentação oficial)
 */
export async function createMontinkOrder(payload: any): Promise<MontinkOrderResponse> {
  throw new Error(
    'createMontinkOrder está BLOQUEADA: endpoint POST para criar pedidos não está documentado na API pública Montink. ' +
    'Consulte MONTINK_SUPPORT_REQUEST_TEMPLATE.md para solicitar documentação oficial. ' +
    'Aguarde a liberação oficial do endpoint pela Montink antes de implementar.'
  );
}
