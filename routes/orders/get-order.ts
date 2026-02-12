/**
 * GET /api/orders/:externalReference?email=...
 * 
 * Consulta um pedido por externalReference (somente leitura, público)
 * com validação de email no backend.
 * 
 * Retorna:
 * - orderId, externalReference, status
 * - totals (subtotal, discountTotal, shippingCost, total)
 * - shipping info
 * - items (com nome do produto se disponível)
 * - mpStatus, mpPaymentId
 * - montinkStatus, montinkOrderId
 * - payerEmailMasked (email mascarado, ex: jo***@gmail.com)
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/logger.js';

const getOrderSchema = z.object({
  externalReference: z.string().min(1),
  email: z.string().email(),
});

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) {
    return '***';
  }

  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function getOrder(req: Request, res: Response) {
  try {
    // Validar parâmetros
    const params = getOrderSchema.parse({
      externalReference: req.params.externalReference,
      email: req.query.email,
    });

    // Buscar Order com OrderItems e Product (para nome)
    const order = await prisma.order.findUnique({
      where: { externalReference: params.externalReference },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      logger.warn(`Order not found: externalReference=${params.externalReference}`);
      // Não revelar se email bate ou não
      return res.status(404).json({
        error: 'Order not found',
        message: 'Pedido não encontrado',
      });
    }

    // Validar email completo
    const requestEmail = params.email.trim().toLowerCase();
    const orderEmail = (order.payerEmail ?? '').trim().toLowerCase();

    if (!orderEmail || requestEmail !== orderEmail) {
      logger.warn(
        `Order email mismatch or missing: externalReference=${params.externalReference}`
      );
      // 404 genérico para não vazar informações
      return res.status(404).json({
        error: 'Order not found',
        message: 'Pedido não encontrado',
      });
    }

    const payerEmailMasked = maskEmail(orderEmail);

    // Montar resposta (sem PII sensível - apenas email mascarado)
    const response = {
      orderId: order.id,
      externalReference: order.externalReference,
      status: order.status,
      totals: {
        subtotal: order.subtotal ?? 0,
        discountTotal: order.discountTotal ?? 0,
        shippingCost: order.shippingCost,
        total: order.total,
      },
      shipping: {
        cep: order.shippingCep,
        address1: order.shippingAddress1,
        number: order.shippingNumber,
        district: order.shippingDistrict,
        city: order.shippingCity,
        state: order.shippingState,
        complement: order.shippingComplement,
        service: order.shippingService,
        deadline: order.shippingDeadline,
      },
      items: order.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        size: item.size,
        color: item.color,
        name: item.product?.name ?? null,
      })),
      mpStatus: order.mpStatus,
      mpPaymentId: order.mpPaymentId,
      montinkStatus: order.montinkStatus,
      montinkOrderId: order.montinkOrderId,
      payerEmailMasked,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    logger.info(`Order retrieved: externalReference=${params.externalReference}, status=${order.status}`);

    return res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`Invalid request: ${error.issues.map((e: any) => e.path.join('.')).join(', ')}`);
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Parâmetros inválidos',
        details: error.issues,
      });
    }

    logger.error(`Error getting order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao buscar pedido',
    });
  }
}
