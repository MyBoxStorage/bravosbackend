/**
 * Client HTTP para API Montink
 * 
 * Cliente reutilizável para fazer requisições à API da Montink
 */

import { logger } from '../../utils/logger.js';

const MONTINK_BASE_URL = process.env.MONTINK_BASE_URL ?? 'https://api.montink.com.br';
const MONTINK_API_TOKEN = process.env.MONTINK_API_TOKEN;

/**
 * Faz uma requisição HTTP para a API Montink
 * 
 * @param method - Método HTTP (GET, POST, PUT, DELETE, etc.)
 * @param path - Caminho da API (ex: '/orders', '/shipping/quote')
 * @param body - Corpo da requisição (opcional, será serializado como JSON)
 * @returns Promise com a resposta parseada como JSON
 * @throws Error se a requisição falhar
 */
export async function montinkRequest<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<T> {
  // Validar token
  if (!MONTINK_API_TOKEN) {
    throw new Error('MONTINK_API_TOKEN não configurado');
  }

  // Construir URL completa
  const url = `${MONTINK_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // Preparar headers
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${MONTINK_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Preparar opções da requisição
  const options: RequestInit = {
    method,
    headers,
  };

  // Adicionar body se fornecido
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  logger.info(`Montink API Request: ${method} ${url}`);

  try {
    const response = await fetch(url, options);

    // Tentar parsear resposta como JSON
    let responseData: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Se resposta não foi OK, lançar erro
    if (!response.ok) {
      const errorMessage = typeof responseData === 'string' 
        ? responseData 
        : responseData?.message || responseData?.error || 'Erro desconhecido';
      
      logger.error(`Montink API Error: ${method} ${url} - ${response.status} - ${errorMessage}`);
      
      throw new Error(
        `Montink API Error (${response.status}): ${errorMessage}`
      );
    }

    logger.info(`Montink API Success: ${method} ${url} - ${response.status}`);
    
    return responseData as T;
  } catch (error) {
    // Se já é um Error, re-lançar
    if (error instanceof Error) {
      throw error;
    }
    
    // Caso contrário, criar novo Error
    logger.error(`Montink API Request Failed: ${method} ${url}`, error);
    throw new Error(`Falha ao fazer requisição para Montink: ${error}`);
  }
}
