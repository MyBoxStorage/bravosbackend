/**
 * POST /api/checkout/create-order
 * 
 * Cria um pedido (Order) e seus itens (OrderItems) no banco de dados
 * Backend recalcula todos os totals (source of truth)
 * 
 * Body:
 * {
 *   "payer": { name, email, cpf?, phone? },
 *   "shipping": { cep?, address1?, number?, district?, city?, state?, complement?, service?, deadline? },
 *   "items": [{ productId, quantity, unitPrice, size?, color? }]
 * }
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

// Schema de validação
const createOrderSchema = z.object({
  payer: z.object({
    name: z.string().min(3),
    email: z.string().email(),
    cpf: z.string().optional(),
    phone: z.string().optional(),
  }),
  shipping: z.object({
    cep: z.string().optional(),
    address1: z.string().optional(),
    number: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    complement: z.string().optional(),
    service: z.string().optional(),
    deadline: z.number().int().nonnegative().optional(),
  }).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    size: z.string().optional(),
    color: z.string().optional(),
  })).min(1, 'Items array cannot be empty'),
});

/**
 * Calcula desconto baseado na quantidade de itens
 */
function calculateDiscountRate(itemCount: number): number {
  if (itemCount >= 5) return 0.15;
  if (itemCount === 4) return 0.10;
  if (itemCount === 3) return 0.05;
  return 0;
}

/**
 * Calcula todos os valores do pedido
 */
function calculateOrderTotals(items: Array<{ quantity: number; unitPrice: number }>) {
  // Calcular subtotal
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  
  // Calcular quantidade total de itens
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Calcular desconto
  const discountRate = calculateDiscountRate(itemCount);
  const discountTotal = subtotal * discountRate;
  const subtotalAfterDiscount = subtotal - discountTotal;
  
  // Calcular frete
  const FREE_SHIPPING_THRESHOLD = 200;
  const STANDARD_SHIPPING_COST = 15;
  const shippingCost = subtotalAfterDiscount > FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_COST;
  
  // Calcular total
  const total = subtotalAfterDiscount + shippingCost;
  
  return {
    subtotal,
    discountTotal,
    shippingCost,
    total,
    itemCount,
  };
}

export async function createOrder(req: Request, res: Response) {
  try {
    // Validação de entrada
    const validationResult = createOrderSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.issues,
      });
    }

    const { payer, shipping, items } = validationResult.data;

    // Calcular totals no backend (source of truth)
    const totals = calculateOrderTotals(items);

    // Gerar external reference único
    const externalReference = `order_${randomUUID()}`;

    logger.info(`Creating order: externalRef=${externalReference}, total=${totals.total}`);

    // Criar Order e OrderItems em uma transação
    const order = await prisma.$transaction(async (tx: any) => {
      // Criar Order
      const newOrder = await tx.order.create({
        data: {
          total: totals.total,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          status: 'PENDING',
          payerName: payer.name,
          payerEmail: payer.email,
          payerCpf: payer.cpf,
          payerPhone: payer.phone,
          externalReference: externalReference,
          // Endereço de entrega
          shippingCep: shipping?.cep,
          shippingAddress1: shipping?.address1,
          shippingNumber: shipping?.number,
          shippingDistrict: shipping?.district,
          shippingCity: shipping?.city,
          shippingState: shipping?.state,
          shippingComplement: shipping?.complement,
          // Informações de frete
          shippingCost: totals.shippingCost,
          shippingService: shipping?.service,
          shippingDeadline: shipping?.deadline,
        },
      });

      // Criar OrderItems
      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          size: item.size,
          color: item.color,
        })),
      });

      return newOrder;
    });

    logger.info(`Order created: id=${order.id}, externalRef=${externalReference}`);

    res.status(201).json({
      orderId: order.id,
      externalReference: order.externalReference,
      totals: {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        shippingCost: totals.shippingCost,
        total: totals.total,
      },
    });

  } catch (error) {
    logger.error('Create order error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
