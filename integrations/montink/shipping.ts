/**
 * Funções de integração com API Montink para cálculo de frete
 */

import { montinkRequest } from './client.js';
import { logger } from '../../utils/logger.js';

/**
 * Parâmetros para cotação de frete Montink
 */
export interface MontinkShippingQuoteParams {
  cep: string;
  items: Array<{
    productId: string;
    quantity: number;
    [key: string]: any;
  }>;
}

/**
 * Opção de frete retornada pela Montink
 */
export interface MontinkShippingOption {
  service: string;
  cost: number;
  deadline?: number;
  [key: string]: any;
}

/**
 * Response da API Montink para cotação de frete
 * (estrutura flexível para acomodar diferentes formatos da API)
 */
interface MontinkShippingQuoteResponse {
  options?: MontinkShippingOption[];
  services?: MontinkShippingOption[];
  shipping?: MontinkShippingOption[];
  [key: string]: any;
}

/**
 * Calcula frete via API Montink
 * 
 * @param params - Parâmetros da cotação (CEP e itens)
 * @returns Array de opções de frete disponíveis
 * @throws Error se a requisição falhar
 */
export async function getMontinkShippingQuote(
  params: MontinkShippingQuoteParams
): Promise<MontinkShippingOption[]> {
  // Montar payload conforme API Montink
  // Usando estrutura genérica que acomoda diferentes formatos
  const payload = {
    cep: params.cep.replace(/\D/g, ''), // Remove formatação do CEP
    items: params.items.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  };

  logger.info(`Montink shipping quote request: cep=${params.cep}, items=${params.items.length}`);

  try {
    // Chamar API Montink
    // Path comum: /shipping/quote ou /shipping/calculate
    const response = await montinkRequest<MontinkShippingQuoteResponse>(
      'POST',
      '/shipping/quote',
      payload
    );

    // Normalizar resposta em array de opções
    // A API pode retornar em diferentes formatos (options, services, shipping, etc.)
    let options: MontinkShippingOption[] = [];

    if (Array.isArray(response)) {
      // Se resposta já é um array
      options = response.map(opt => ({
        service: opt.service || 'montink_standard',
        cost: opt.cost ?? opt.price ?? 0,
        deadline: opt.deadline ?? opt.delivery_days ?? undefined,
      }));
    } else if (response.options && Array.isArray(response.options)) {
      options = response.options.map(opt => ({
        service: opt.service || 'montink_standard',
        cost: opt.cost ?? opt.price ?? 0,
        deadline: opt.deadline ?? opt.delivery_days ?? undefined,
      }));
    } else if (response.services && Array.isArray(response.services)) {
      options = response.services.map(opt => ({
        service: opt.service || 'montink_standard',
        cost: opt.cost ?? opt.price ?? 0,
        deadline: opt.deadline ?? opt.delivery_days ?? undefined,
      }));
    } else if (response.shipping && Array.isArray(response.shipping)) {
      options = response.shipping.map(opt => ({
        service: opt.service || 'montink_standard',
        cost: opt.cost ?? opt.price ?? 0,
        deadline: opt.deadline ?? opt.delivery_days ?? undefined,
      }));
    } else {
      // Se não encontrar formato esperado, criar opção padrão
      logger.warn('Montink response format not recognized, using default option');
      options = [{
        service: 'montink_standard',
        cost: response.cost ?? response.price ?? 0,
        deadline: response.deadline ?? response.delivery_days ?? undefined,
      }];
    }

    // Validar que temos pelo menos uma opção
    if (options.length === 0) {
      throw new Error('Montink retornou nenhuma opção de frete');
    }

    logger.info(`Montink shipping quote success: ${options.length} options found`);
    
    return options;
  } catch (error) {
    logger.error(`Montink shipping quote error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}
