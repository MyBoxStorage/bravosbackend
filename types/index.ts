/**
 * Types for backend API
 */

export interface CreatePaymentRequest {
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    size?: string;
    color?: string;
  }>;
  payer: {
    name: string;
    email: string;
    cpf?: string;
    phone?: string;
  };
  amount: number;
  paymentMethod: 'pix' | 'bolbradesco';
}

export interface CreatePaymentResponse {
  orderId: string;
  paymentId: number;
  status: string;
  paymentMethod: 'pix' | 'bolbradesco';
  pix?: {
    qrCode: string;
    copyPaste: string;
  };
  boleto?: {
    url: string;
    barcode: string;
  };
}

export interface WebhookNotification {
  type: string;
  data: {
    id: string | number;
  };
}
