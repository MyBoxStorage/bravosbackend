/**
 * Serviço de Fulfillment Montink
 * 
 * Responsável por criar pedidos na Montink quando um Order interno é marcado como READY_FOR_MONTINK.
 * 
 * ⚠️ IMPORTANTE: Este serviço só funciona se:
 * 1. MONTINK_CREATE_ORDER_ENABLED=true no .env
 * 2. Endpoint POST oficial da Montink estiver disponível e documentado
 */

import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { mapOrderToMontinkPayload } from '../integrations/montink/mappers.js';
import { createMontinkOrder } from '../integrations/montink/orders.js';

const MONTINK_CREATE_ORDER_ENABLED = process.env.MONTINK_CREATE_ORDER_ENABLED === 'true';

/**
 * Processa fulfillment de um pedido para Montink
 * 
 * @param orderId - ID do Order interno no banco
 * @returns Promise<void> - Resolve quando processamento completo (sucesso ou falha)
 */
export async function processMontinkFulfillment(orderId: string): Promise<void> {
  // Verificar feature flag
  if (!MONTINK_CREATE_ORDER_ENABLED) {
    logger.info(`Montink fulfillment skipped: feature flag disabled, orderId=${orderId}`);
    return;
  }

  try {
    // Buscar Order com OrderItems
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      logger.error(`Montink fulfillment failed: Order not found, orderId=${orderId}`);
      return;
    }

    // Validar que Order está em status correto
    if (order.status !== 'READY_FOR_MONTINK') {
      logger.warn(
        `Montink fulfillment skipped: Order status is ${order.status}, expected READY_FOR_MONTINK, orderId=${orderId}`
      );
      return;
    }

    // Validar que tem itens
    if (!order.items || order.items.length === 0) {
      logger.error(`Montink fulfillment failed: Order has no items, orderId=${orderId}`);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FAILED_MONTINK',
          montinkStatus: 'No items in order',
        },
      });
      return;
    }

    // Validar endereço mínimo (CEP necessário)
    if (!order.shippingCep) {
      logger.error(`Montink fulfillment failed: Missing shipping CEP, orderId=${orderId}`);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FAILED_MONTINK',
          montinkStatus: 'Missing shipping CEP',
        },
      });
      return;
    }

    logger.info(`Montink fulfillment started: orderId=${orderId}, externalReference=${order.externalReference}`);

    // Mapear Order para payload Montink
    const payload = mapOrderToMontinkPayload(order, order.items);

    // Criar pedido na Montink
    const montinkResponse = await createMontinkOrder(payload);

    // Atualizar Order com sucesso
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SENT_TO_MONTINK',
        montinkOrderId: montinkResponse.id?.toString() ?? null,
        montinkStatus: montinkResponse.status ?? 'sent',
      },
    });

    logger.info(
      `Montink fulfillment success: orderId=${orderId}, montinkOrderId=${montinkResponse.id}, externalReference=${order.externalReference}`
    );
  } catch (error) {
    // Tratar erro e atualizar Order
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error(`Montink fulfillment failed: orderId=${orderId}, error=${errorMessage}`);

    // Atualizar Order com falha
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'FAILED_MONTINK',
        montinkStatus: errorMessage.substring(0, 255), // Limitar tamanho se necessário
      },
    });
  }
}
