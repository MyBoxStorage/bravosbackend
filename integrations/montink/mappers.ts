/**
 * Mappers para transformar dados internos em payloads da API Montink
 * 
 * Estas funções apenas transformam dados, não fazem chamadas à API
 */

import type { MontinkOrderRequest } from './types.js';
import { prisma } from '../../utils/prisma.js';

// Tipos do Prisma - não-nulos para uso no mapper
type Order = NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>>;
type OrderItem = NonNullable<Awaited<ReturnType<typeof prisma.orderItem.findUnique>>>;

/**
 * Mapeia Order + OrderItems para payload de criação de pedido na Montink
 * 
 * A API Montink precisa de:
 * - endereço completo
 * - quantidade de produtos
 * - identificação do produto (productId / SKU)
 * 
 * @param order - Order do banco de dados
 * @param orderItems - Array de OrderItems do pedido
 * @returns Payload pronto para ser enviado à API Montink
 */
export function mapOrderToMontinkPayload(
  order: Order,
  orderItems: OrderItem[]
): MontinkOrderRequest {
  // Montar endereço completo
  const addressParts: string[] = [];
  
  if (order.shippingAddress1) {
    addressParts.push(order.shippingAddress1);
  }
  
  if (order.shippingNumber) {
    addressParts.push(order.shippingNumber);
  }
  
  if (order.shippingComplement) {
    addressParts.push(order.shippingComplement);
  }
  
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : undefined;

  // Montar payload conforme estrutura esperada pela Montink
  const payload: MontinkOrderRequest = {
    // ID do pedido interno (para referência)
    orderId: order.id,
    
    // Itens do pedido
    items: orderItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      // Campos adicionais podem ser adicionados aqui se necessário
    })),
    
    // Endereço de entrega
    shipping: {
      cep: order.shippingCep ? order.shippingCep.replace(/\D/g, '') : undefined, // Remove formatação
      address: fullAddress,
      // Campos adicionais do endereço
      ...(order.shippingDistrict && { district: order.shippingDistrict }),
      ...(order.shippingCity && { city: order.shippingCity }),
      ...(order.shippingState && { state: order.shippingState }),
    },
    
    // Informações adicionais que podem ser úteis
    // (estrutura flexível para acomodar diferentes formatos da API)
    ...(order.payerName && { customerName: order.payerName }),
    ...(order.payerEmail && { customerEmail: order.payerEmail }),
    ...(order.payerPhone && { customerPhone: order.payerPhone }),
    ...(order.shippingService && { shippingService: order.shippingService }),
    ...(order.shippingDeadline && { shippingDeadline: order.shippingDeadline }),
  };

  return payload;
}
