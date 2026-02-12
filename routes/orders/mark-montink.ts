/**
 * POST /api/orders/:externalReference/mark-montink
 * 
 * Marca um pedido como enviado à Montink (operação administrativa)
 * 
 * Requer:
 * - Header: x-admin-token (ADMIN_TOKEN do .env)
 * - Body: { montinkOrderId: string, montinkStatus: string }
 * 
 * Regras:
 * - Só permite se Order.status for READY_FOR_MONTINK ou PAID
 * - Atualiza montinkOrderId, montinkStatus e status = SENT_TO_MONTINK
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/logger.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const markMontinkSchema = z.object({
  externalReference: z.string().min(1),
  body: z.object({
    montinkOrderId: z.string().min(1),
    montinkStatus: z.string().min(1),
  }),
});

/**
 * Middleware para validar admin token
 */
function validateAdminToken(req: Request, res: Response, next: () => void) {
  const token = req.headers['x-admin-token'] as string;

  if (!ADMIN_TOKEN) {
    logger.error('ADMIN_TOKEN not configured in environment');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Token administrativo não configurado',
    });
  }

  if (!token || token !== ADMIN_TOKEN) {
    logger.warn(`Unauthorized admin access attempt: token=${token ? 'provided' : 'missing'}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token administrativo inválido',
    });
  }

  next();
}

export async function markMontink(req: Request, res: Response) {
  try {
    // Validar entrada
    const { externalReference, body } = markMontinkSchema.parse({
      externalReference: req.params.externalReference,
      body: req.body,
    });

    // Buscar Order
    const order = await prisma.order.findUnique({
      where: { externalReference },
    });

    if (!order) {
      logger.warn(`Order not found for mark-montink: externalReference=${externalReference}`);
      return res.status(404).json({
        error: 'Order not found',
        message: 'Pedido não encontrado',
      });
    }

    // Validar que status permite marcação
    if (order.status !== 'READY_FOR_MONTINK' && order.status !== 'PAID') {
      logger.warn(
        `Cannot mark montink: Order status is ${order.status}, expected READY_FOR_MONTINK or PAID, externalReference=${externalReference}`
      );
      return res.status(400).json({
        error: 'Invalid order status',
        message: `Pedido não está pronto para produção. Status atual: ${order.status}`,
        currentStatus: order.status,
      });
    }

    // Atualizar Order
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'SENT_TO_MONTINK',
        montinkOrderId: body.montinkOrderId,
        montinkStatus: body.montinkStatus,
      },
    });

    // Registrar evento de auditoria administrativa
    await prisma.adminEvent.create({
      data: {
        action: 'MARK_MONTINK',
        orderId: updatedOrder.id,
        externalReference: updatedOrder.externalReference,
        metadata: {
          montinkOrderId: body.montinkOrderId,
          montinkStatus: body.montinkStatus,
        },
      },
    });

    logger.info(
      `Order marked as sent to Montink: externalReference=${externalReference}, montinkOrderId=${body.montinkOrderId}, status=${updatedOrder.status}`
    );

    return res.json({
      success: true,
      message: 'Pedido marcado como enviado à Montink',
      order: {
        orderId: updatedOrder.id,
        externalReference: updatedOrder.externalReference,
        status: updatedOrder.status,
        montinkOrderId: updatedOrder.montinkOrderId,
        montinkStatus: updatedOrder.montinkStatus,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`Invalid request: ${error.issues.map((e: any) => e.path.join('.')).join(', ')}`);
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Parâmetros inválidos',
        details: error.issues,
      });
    }

    logger.error(`Error marking montink: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao marcar pedido',
    });
  }
}

// Exportar também o middleware para uso no index.ts
export { validateAdminToken };
