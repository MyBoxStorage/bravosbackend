/**
 * Tipos básicos para integração com API Montink
 * 
 * Interfaces mínimas - podem ser expandidas conforme necessário
 */

/**
 * Produto Montink
 */
export interface MontinkProduct {
  id?: string;
  name?: string;
  sku?: string;
  [key: string]: any;
}

/**
 * Cotação de frete Montink
 */
export interface MontinkShippingQuote {
  service?: string;
  price?: number;
  deadline?: number;
  [key: string]: any;
}

/**
 * Request para criar pedido na Montink
 */
export interface MontinkOrderRequest {
  orderId?: string;
  items?: Array<{
    productId?: string;
    quantity?: number;
    [key: string]: any;
  }>;
  shipping?: {
    cep?: string;
    address?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Response de criação de pedido na Montink
 */
export interface MontinkOrderResponse {
  id: string;
  status?: string;
  [key: string]: any;
}

/**
 * ⚠️ TODO: Tipos para criação de pedido
 * 
 * Estes tipos serão definidos quando a documentação oficial do endpoint POST estiver disponível.
 * 
 * Fontes a consultar:
 * - Documentação oficial da API Montink (quando disponível)
 * - Resposta do suporte Montink
 * - Exemplos de payload em documentação Postman (se disponível)
 * 
 * Campos prováveis (NÃO CONFIRMADOS):
 * - items: Array<{ productId: string, quantity: number }>
 * - shipping: { cep: string, address: string, ... }
 * - customer: { name: string, email: string, phone?: string }
 */
export type MontinkCreateOrderRequest = unknown; // TODO: Definir quando documentação oficial estiver disponível
export type MontinkCreateOrderResponse = MontinkOrderResponse; // Reutilizar tipo base por enquanto
