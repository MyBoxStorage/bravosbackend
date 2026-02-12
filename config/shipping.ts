/**
 * Configuração de Estratégia de Frete
 * 
 * Define como o sistema calcula o custo de frete e qual política de fallback usar.
 */

/**
 * Estratégias de cálculo de frete disponíveis:
 * 
 * - MONTINK_PRIMARY_WITH_FALLBACK: Tenta usar Montink primeiro, se falhar usa frete fixo
 * - MONTINK_REQUIRED: Requer Montink, falha se não conseguir calcular
 */
export type FreightStrategy = 
  | 'MONTINK_PRIMARY_WITH_FALLBACK'
  | 'MONTINK_REQUIRED';

/**
 * Estratégia atual de cálculo de frete
 * 
 * MONTINK_PRIMARY_WITH_FALLBACK (Recomendado para MVP):
 * - Tenta calcular frete via API Montink
 * - Se Montink falhar (erro, timeout, etc.):
 *   → Usa frete fixo como fallback (R$15 / grátis > R$200)
 *   → Loga warning
 *   → Continua checkout normalmente
 * 
 * MONTINK_REQUIRED:
 * - Requer que Montink funcione
 * - Se Montink falhar, retorna erro
 * - Não permite checkout sem frete calculado
 */
export const SHIPPING_STRATEGY: FreightStrategy = 'MONTINK_PRIMARY_WITH_FALLBACK';

/**
 * Configurações de frete fixo (usado como fallback)
 */
export const FALLBACK_SHIPPING_CONFIG = {
  /** Valor do frete padrão em reais */
  STANDARD_COST: 15,
  
  /** Subtotal mínimo para frete grátis em reais */
  FREE_SHIPPING_THRESHOLD: 200,
} as const;

/**
 * Calcula frete fixo baseado no subtotal
 * 
 * @param subtotal - Subtotal do pedido em reais
 * @returns Custo do frete (0 se for frete grátis)
 */
export function calculateFallbackShipping(subtotal: number): number {
  return subtotal > FALLBACK_SHIPPING_CONFIG.FREE_SHIPPING_THRESHOLD
    ? 0
    : FALLBACK_SHIPPING_CONFIG.STANDARD_COST;
}
