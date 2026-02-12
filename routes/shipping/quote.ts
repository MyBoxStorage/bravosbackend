/**
 * POST /api/shipping/quote
 * 
 * Calcula o custo de frete via API Montink com fallback automático
 * 
 * Body:
 * {
 *   "subtotal": number,
 *   "cep"?: string,
 *   "items"?: Array<{ productId: string, quantity: number }>
 * }
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { getMontinkShippingQuote } from '../../integrations/montink/shipping.js';
import { 
  SHIPPING_STRATEGY, 
  FALLBACK_SHIPPING_CONFIG,
  calculateFallbackShipping 
} from '../../config/shipping.js';

// Schema de validação
const shippingQuoteSchema = z.object({
  subtotal: z.number().nonnegative(),
  cep: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
  })).optional(),
});

export async function shippingQuote(req: Request, res: Response) {
  try {
    // Validação de entrada
    const validationResult = shippingQuoteSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.issues,
      });
    }

    const { subtotal, cep, items } = validationResult.data;

    // Tentar calcular frete via Montink se tiver CEP e itens
    if (cep && items && items.length > 0) {
      try {
        const options = await getMontinkShippingQuote({
          cep,
          items,
        });

        // Selecionar a opção mais barata
        const selectedOption = options.reduce((cheapest, current) => 
          current.cost < cheapest.cost ? current : cheapest
        );

        const shippingCost = selectedOption.cost;
        const isFree = shippingCost === 0;

        logger.info(`Shipping quote: source=montink, shippingCost=${shippingCost}, service=${selectedOption.service}`);

        return res.status(200).json({
          shippingCost,
          service: selectedOption.service,
          deadline: selectedOption.deadline ?? null,
          freeShippingThreshold: FALLBACK_SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
          isFree,
          source: 'montink',
        });
      } catch (error) {
        // Se Montink falhar e estratégia for fallback, usar frete fixo
        if (SHIPPING_STRATEGY === 'MONTINK_PRIMARY_WITH_FALLBACK') {
          logger.warn(`Montink shipping quote failed, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          const shippingCost = calculateFallbackShipping(subtotal);
          const isFree = shippingCost === 0;

          logger.info(`Shipping quote: source=fallback, shippingCost=${shippingCost}, service=fallback_fixed`);

          return res.status(200).json({
            shippingCost,
            service: 'fallback_fixed',
            deadline: null,
            freeShippingThreshold: FALLBACK_SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
            isFree,
            source: 'fallback',
          });
        }

        // Se estratégia for MONTINK_REQUIRED, retornar erro
        throw error;
      }
    }

    // Se não tiver CEP ou itens, usar frete fixo diretamente
    const shippingCost = calculateFallbackShipping(subtotal);
    const isFree = shippingCost === 0;

    logger.info(`Shipping quote: source=fallback, shippingCost=${shippingCost}, service=fallback_fixed`);

    res.status(200).json({
      shippingCost,
      service: 'fallback_fixed',
      deadline: null,
      freeShippingThreshold: FALLBACK_SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
      isFree,
      source: 'fallback',
    });

  } catch (error) {
    logger.error('Shipping quote error:', error);
    
    // Se estratégia for MONTINK_REQUIRED e Montink falhar, retornar erro
    if (SHIPPING_STRATEGY === 'MONTINK_REQUIRED') {
      return res.status(500).json({
        error: 'Shipping calculation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Caso contrário, usar fallback mesmo em erro inesperado
    const subtotal = req.body?.subtotal ?? 0;
    const shippingCost = calculateFallbackShipping(subtotal);
    const isFree = shippingCost === 0;

    logger.warn(`Shipping quote error, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);

    res.status(200).json({
      shippingCost,
      service: 'fallback_fixed',
      deadline: null,
      freeShippingThreshold: FALLBACK_SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD,
      isFree,
      source: 'fallback',
    });
  }
}
