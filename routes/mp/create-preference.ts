/**
 * POST /api/mp/create-preference
 * 
 * Cria uma preferência de pagamento (Checkout Preference) no Mercado Pago
 * 
 * Body:
 * {
 *   items: Array<{ productId, quantity, unitPrice, name, description?, image?, size?, color? }>,
 *   payer: { name, email, cpf?, phone?, zipCode?, address? },
 *   amount: number,
 *   shipping?: number,
 *   externalReference?: string
 * }
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

const prisma = new PrismaClient();

// Schema de validação
const createPreferenceSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    name: z.string(),
    description: z.string().optional(),
    image: z.string().optional(),
    size: z.string().optional(),
    color: z.string().optional(),
  })).min(1),
  payer: z.object({
    name: z.string().min(3),
    email: z.string().email(),
    cpf: z.string().optional(),
    phone: z.string().optional(),
    zipCode: z.string().optional(),
    address: z.string().optional(),
  }),
  amount: z.number().positive(),
  shipping: z.number().nonnegative().optional(),
  externalReference: z.string().optional(),
});

export async function createPreference(req: Request, res: Response) {
  try {
    // Validação de entrada
    const validationResult = createPreferenceSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.issues,
      });
    }

    const { items, payer, amount, shipping, externalReference } = validationResult.data;

    // Verificar Access Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error('MP_ACCESS_TOKEN não configurado');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Mercado Pago access token not configured',
      });
    }

    // Gerar referência externa única se não fornecida
    const finalExternalReference = externalReference || `BRAVOS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // URLs base
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

    // Preparar dados para criar preferência no Mercado Pago
    const preferenceData = {
      items: items.map((item) => ({
        id: item.productId,
        title: `${item.name}${item.size ? ` - ${item.size}` : ''}${item.color ? ` - ${item.color}` : ''}`,
        description: item.description || item.name,
        picture_url: item.image 
          ? (item.image.startsWith('http') ? item.image : `${frontendUrl}${item.image}`)
          : undefined,
        category_id: 'fashion', // Categoria padrão para produtos de moda
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
      payer: {
        name: payer.name,
        surname: payer.name.split(' ').slice(1).join(' ') || '',
        email: payer.email,
        ...(payer.cpf && {
          identification: {
            type: payer.cpf.length === 11 ? 'CPF' : 'CNPJ',
            number: payer.cpf.replace(/\D/g, ''),
          },
        }),
        ...(payer.phone && {
          phone: {
            area_code: payer.phone.replace(/\D/g, '').substring(0, 2) || '11',
            number: payer.phone.replace(/\D/g, '').substring(2) || '',
          },
        }),
        ...(payer.zipCode && {
          address: {
            zip_code: payer.zipCode.replace(/\D/g, ''),
            street_name: payer.address || '',
          },
        }),
      },
      external_reference: finalExternalReference,
      statement_descriptor: 'BRAVOS BRASIL',
      back_urls: {
        success: `${frontendUrl}/checkout/success`,
        failure: `${frontendUrl}/checkout/failure`,
        pending: `${frontendUrl}/checkout/pending`,
      },
      notification_url: `${backendUrl}/api/mp/webhooks`,
      auto_return: 'approved', // Redireciona automaticamente quando aprovado
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: 12, // Máximo de parcelas
      },
      ...(shipping && shipping > 0 && {
        shipments: {
          cost: shipping,
          mode: 'not_specified',
        },
      }),
      expires: true, // A preferência expira
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
      metadata: {
        order_id: finalExternalReference,
        items_count: items.length,
        platform: 'BRAVOS_BRASIL',
      },
    };

    logger.info(`Creating preference for order: ${finalExternalReference}`);

    // Criar preferência no Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceData),
    });

    const mpData = await mpResponse.json() as any;

    if (!mpResponse.ok) {
      logger.error('Mercado Pago preference error:', mpData);
      return res.status(mpResponse.status).json({
        error: 'Preference creation failed',
        message: mpData.message || 'Erro ao criar preferência no Mercado Pago',
        details: mpData,
      });
    }

    logger.info(`Preference created: ${mpData.id}, Order: ${finalExternalReference}`);

    // Criar pedido no banco de dados (status: PENDING)
    const order = await prisma.order.create({
      data: {
        total: amount,
        status: 'PENDING',
        payerName: payer.name,
        payerEmail: payer.email,
        payerCpf: payer.cpf,
        payerPhone: payer.phone,
        paymentMethod: 'checkout_preference',
        externalReference: finalExternalReference,
        mpPreferenceId: mpData.id?.toString(),
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            size: item.size,
            color: item.color,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    logger.info(`Order created: ${order.id}, Preference: ${mpData.id}`);

    // Retornar dados para o frontend
    res.status(201).json({
      preferenceId: mpData.id,
      initPoint: mpData.init_point, // URL para redirecionamento (web)
      sandboxInitPoint: mpData.sandbox_init_point, // URL para sandbox
      orderId: order.id,
      externalReference: finalExternalReference,
      // URLs para mobile (deep links)
      mobile: {
        android: mpData.init_point,
        ios: mpData.init_point,
      },
    });

  } catch (error) {
    logger.error('Create preference error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
