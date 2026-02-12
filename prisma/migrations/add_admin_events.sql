-- Migration: Add AdminEvent table
-- Description: Cria tabela admin_events para auditoria de ações administrativas (mark-montink)
-- Date: 2026

-- CreateTable: admin_events
CREATE TABLE IF NOT EXISTS "admin_events" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: índice em order_id para facilitar consultas por pedido
CREATE INDEX IF NOT EXISTS "admin_events_order_id_idx" ON "admin_events"("order_id");

