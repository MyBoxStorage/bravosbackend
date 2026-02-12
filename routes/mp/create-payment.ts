/**
 * POST /api/mp/create-payment
 * 
 * Cria um pagamento no Mercado Pago (PIX ou Boleto)
 * 
 * Body:
 * {
 *   items: Array<{ productId, quantity, unitPrice, size?, color? }>,
 *   payer: { name, email, cpf?, phone? },
 *   amount: number,
 *   paymentMethod: "pix" | "bolbradesco"
 * }
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';

const prisma = new PrismaClient();

// Schema de validação
const createPaymentSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    size: z.string().optional(),
    color: z.string().optional(),
  })).min(1),
  payer: z.object({
    name: z.string().min(3),
    email: z.string().email(),
    cpf: z.string().optional(),
    phone: z.string().optional(),
  }),
  amount: z.number().positive(),
  paymentMethod: z.enum(['pix', 'bolbradesco']),
});

export async function createPayment(req: Request, res: Response) {
  try {
    // Validação de entrada
    const validationResult = createPaymentSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.issues,
      });
    }

    const { items, payer, amount, paymentMethod } = validationResult.data;

    // Verificar Access Token
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error('MP_ACCESS_TOKEN não configurado');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Mercado Pago access token not configured',
      });
    }

    // Gerar referência externa única
    const externalReference = `BRAVOS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Preparar dados para o Mercado Pago
    const mpPaymentData: any = {
      transaction_amount: amount,
      description: `Pedido BRAVOS BRASIL - ${items.length} item(ns)`,
      payment_method_id: paymentMethod === 'pix' ? 'pix' : 'bolbradesco',
      payer: {
        email: payer.email,
        ...(payer.cpf && {
          identification: {
            type: payer.cpf.length === 11 ? 'CPF' : 'CNPJ',
            number: payer.cpf.replace(/\D/g, ''),
          },
        }),
        ...(payer.name && {
          first_name: payer.name.split(' ')[0] || payer.name,
          last_name: payer.name.split(' ').slice(1).join(' ') || '',
        }),
        ...(payer.phone && {
          phone: {
            number: payer.phone.replace(/\D/g, ''),
          },
        }),
      },
      external_reference: externalReference,
      statement_descriptor: 'BRAVOS BRASIL',
      notification_url: process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/mp/webhooks`
        : undefined,
      additional_info: {
        items: items.map((item) => ({
          id: item.productId,
          title: `Produto ${item.productId}`,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
      },
    };

    // Configurações específicas por método de pagamento
    if (paymentMethod === 'pix') {
      // PIX - sem configurações adicionais necessárias
    } else if (paymentMethod === 'bolbradesco') {
      // Boleto - configurar data de vencimento (3 dias)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 3);
      mpPaymentData.date_of_expiration = expirationDate.toISOString();
    }

    // Criar pedido no banco de dados (status: PENDING)
    const order = await prisma.order.create({
      data: {
        total: amount,
        status: 'PENDING',
        payerName: payer.name,
        payerEmail: payer.email,
        payerCpf: payer.cpf,
        payerPhone: payer.phone,
        paymentMethod: paymentMethod,
        externalReference: externalReference,
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

    logger.info(`Order created: ${order.id}, External Ref: ${externalReference}`);

    // Chamar API do Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mpPaymentData),
    });

    const mpData = await mpResponse.json() as any;

    if (!mpResponse.ok) {
      logger.error('Mercado Pago error:', mpData);
      
      // Atualizar pedido com status FAILED
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });

      return res.status(mpResponse.status).json({
        error: 'Payment creation failed',
        message: mpData.message || 'Erro ao criar pagamento no Mercado Pago',
        details: mpData,
      });
    }

    // Atualizar pedido com dados do pagamento
    const updateData: any = {
      mpPaymentId: mpData.id?.toString(),
      mpStatus: mpData.status,
    };

    // Extrair dados específicos do método de pagamento
    if (paymentMethod === 'pix' && mpData.point_of_interaction?.transaction_data) {
      const pixData = mpData.point_of_interaction.transaction_data;
      updateData.pixQrCode = pixData.qr_code_base64 || pixData.qr_code;
      updateData.pixCopyPaste = pixData.qr_code;
    } else if (paymentMethod === 'bolbradesco' && mpData.transaction_details) {
      updateData.boletoUrl = mpData.transaction_details.external_resource_url;
      updateData.boletoBarcode = mpData.transaction_details.barcode;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    logger.info(`Payment created: MP ID ${mpData.id}, Order ${order.id}`);

    // Retornar dados para o frontend
    const responseData: any = {
      orderId: order.id,
      paymentId: mpData.id,
      status: mpData.status,
      paymentMethod: paymentMethod,
    };

    // Adicionar dados específicos do método
    if (paymentMethod === 'pix' && mpData.point_of_interaction?.transaction_data) {
      const pixData = mpData.point_of_interaction.transaction_data;
      responseData.pix = {
        qrCode: pixData.qr_code_base64 || pixData.qr_code,
        copyPaste: pixData.qr_code,
      };
    } else if (paymentMethod === 'bolbradesco' && mpData.transaction_details) {
      responseData.boleto = {
        url: mpData.transaction_details.external_resource_url,
        barcode: mpData.transaction_details.barcode,
      };
    }

    res.status(201).json(responseData);

  } catch (error) {
    logger.error('Create payment error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
