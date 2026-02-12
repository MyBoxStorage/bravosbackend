-- Migration: Add Montink order statuses
-- Description: Adiciona novos status ao enum OrderStatus para integração com Montink
-- Date: 2024

-- Adicionar novos valores ao enum OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_MONTINK';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_MONTINK';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED_MONTINK';
