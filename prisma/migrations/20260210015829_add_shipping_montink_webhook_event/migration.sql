-- AlterTable: Adicionar campos de endereço de entrega, frete, Montink e totais ao Order
ALTER TABLE "orders" ADD COLUMN "subtotal" DOUBLE PRECISION,
ADD COLUMN "discount_total" DOUBLE PRECISION,
ADD COLUMN "shipping_cep" TEXT,
ADD COLUMN "shipping_address1" TEXT,
ADD COLUMN "shipping_number" TEXT,
ADD COLUMN "shipping_district" TEXT,
ADD COLUMN "shipping_city" TEXT,
ADD COLUMN "shipping_state" TEXT,
ADD COLUMN "shipping_complement" TEXT,
ADD COLUMN "shipping_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "shipping_service" TEXT,
ADD COLUMN "shipping_deadline" INTEGER,
ADD COLUMN "montink_order_id" TEXT,
ADD COLUMN "montink_status" TEXT;

-- CreateTable: Criar tabela WebhookEvent para idempotência
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "payload" JSONB,
    "status" TEXT,
    "error_message" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Índice único para evitar processamento duplicado de webhooks
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");
