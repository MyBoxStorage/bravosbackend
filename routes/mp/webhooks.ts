/**
 * POST /api/mp/webhooks
 * 
 * Recebe notificações do Mercado Pago sobre mudanças de status de pagamento
 * 
 * Implementa idempotência via tabela WebhookEvent (DB) para evitar processamento duplicado
 */

import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/logger.js';

export async function webhookHandler(req: Request, res: Response) {
  // Sempre responder 200 rapidamente para o Mercado Pago
  // Processamento assíncrono acontece após resposta
  res.status(200).json({ received: true });

  try {
    // Extract básico
    const provider = 'mercadopago';
    const eventType = req.body?.type ?? 'unknown';
    const eventId = String(req.body?.data?.id ?? '');

    // Se eventId vazio, criar WebhookEvent como ignored e retornar
    if (!eventId || eventId === '') {
      await prisma.webhookEvent.create({
        data: {
          provider,
          eventId: `empty-${Date.now()}`,
          eventType,
          payload: req.body,
          status: 'ignored',
          processedAt: new Date(),
        },
      });
      logger.info(`Webhook ignored: eventType=${eventType}, eventId=empty`);
      return;
    }

    // Idempotência via DB: tentar criar WebhookEvent
    let webhookEvent;
    try {
      webhookEvent = await prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          eventType,
          payload: req.body,
          status: 'received',
        },
      });
      logger.info(`Webhook received: eventType=${eventType}, eventId=${eventId}`);
    } catch (error: any) {
      // Se falhar por unique constraint, evento já foi processado
      if (error.code === 'P2002') {
        logger.info(`Webhook already processed: eventType=${eventType}, eventId=${eventId}`);
        return;
      }
      // Outro erro: logar e retornar
      logger.error(`Error creating WebhookEvent: ${error.message}`);
      return;
    }

    // Processamento baseado no tipo de evento
    if (eventType === 'payment') {
      await processPaymentEvent(eventId, webhookEvent.id);
    } else if (eventType === 'merchant_order') {
      // Marcar como processado (lógica futura pode ser adicionada aqui)
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
        },
      });
      logger.info(`Merchant order processed: eventId=${eventId}`);
    } else {
      // Tipo não tratado: marcar como ignored
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: 'ignored',
          processedAt: new Date(),
        },
      });
      logger.info(`Unhandled event type: eventType=${eventType}, eventId=${eventId}`);
    }
  } catch (error) {
    logger.error('Webhook processing error:', error);
    // Erro já foi logado, resposta 200 já foi enviada
  }
}

/**
 * Processa evento de pagamento do Mercado Pago
 */
async function processPaymentEvent(paymentId: string, webhookEventId: string) {
  try {
    // Buscar detalhes do pagamento na API do Mercado Pago
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error('MP_ACCESS_TOKEN não configurado');
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: 'failed',
          errorMessage: 'MP_ACCESS_TOKEN não configurado',
          processedAt: new Date(),
        },
      });
      return;
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      logger.error(`Failed to fetch payment ${paymentId}: ${errorText}`);
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: 'failed',
          errorMessage: `Failed to fetch payment: ${mpResponse.status}`,
          processedAt: new Date(),
        },
      });
      return;
    }

    const payment = await mpResponse.json() as any;
    const externalReference = payment.external_reference;
    const mpPaymentId = payment.id?.toString() ?? null;
    const mpStatus = payment.status ?? null;

    // Se externalReference vazio, ignorar
    if (!externalReference || externalReference.trim() === '') {
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: 'ignored',
          errorMessage: 'External reference missing',
          processedAt: new Date(),
        },
      });
      logger.info(`Payment ignored: externalReference missing, paymentId=${paymentId}`);
      return;
    }

    // Buscar Order por externalReference
    const order = await prisma.order.findUnique({
      where: { externalReference },
    });

    if (!order) {
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: 'failed',
          errorMessage: `Order not found for externalReference: ${externalReference}`,
          processedAt: new Date(),
        },
      });
      logger.warn(`Order not found: externalReference=${externalReference}, paymentId=${paymentId}`);
      return;
    }

    // Mapear status do Mercado Pago para OrderStatus
    let orderStatus: 'PENDING' | 'PAID' | 'READY_FOR_MONTINK' | 'SENT_TO_MONTINK' | 'FAILED_MONTINK' | 'CANCELED' | 'FAILED' | 'REFUNDED' = 'PENDING';

    switch (mpStatus) {
      case 'approved':
        // Quando pagamento é aprovado, marcar como READY_FOR_MONTINK
        // (não criamos pedido Montink ainda pois POST não está documentado)
        orderStatus = 'READY_FOR_MONTINK';
        break;
      case 'cancelled':
      case 'rejected':
        orderStatus = 'CANCELED';
        break;
      case 'refunded':
      case 'charged_back':
        orderStatus = 'REFUNDED';
        break;
      case 'pending':
      case 'in_process':
        orderStatus = 'PENDING';
        break;
      default:
        logger.warn(`Unknown payment status: ${mpStatus}`);
    }

    // Atualizar Order com mpPaymentId, mpStatus e status
    await prisma.order.update({
      where: { id: order.id },
      data: {
        mpPaymentId,
        mpStatus,
        status: orderStatus,
      },
    });

    // Se pedido está READY_FOR_MONTINK, enfileirar fulfillment (fire-and-forget)
    if (orderStatus === 'READY_FOR_MONTINK') {
      // Importar dinamicamente para evitar dependência circular e carregamento desnecessário
      import('../../services/montinkFulfillment')
        .then(({ processMontinkFulfillment }) => {
          // Fire-and-forget: não aguardar resultado
          processMontinkFulfillment(order.id).catch((err: unknown) => {
            // Erro já foi logado dentro de processMontinkFulfillment
            logger.error(`Montink fulfillment async error: orderId=${order.id}`, err);
          });
        })
        .catch((err: unknown) => {
          logger.error(`Failed to load montinkFulfillment service: ${err}`);
        });
    }

    // Marcar WebhookEvent como processado
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: 'processed',
        processedAt: new Date(),
      },
    });

    logger.info(`Order updated: orderId=${order.id}, externalReference=${externalReference}, status=${orderStatus}, mpStatus=${mpStatus}`);
  } catch (error) {
    logger.error(`Error processing payment event ${paymentId}:`, error);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date(),
      },
    });
  }
}
