/**
 * Seed script para popular banco de dados com produtos iniciais
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Produtos iniciais baseados em src/data/products.ts
  const products = [
    {
      id: '1',
      name: 'T-Shirt Classic - DEUS PÁTRIA FAMÍLIA',
      description: 'Camiseta de alta qualidade com estampa patriótica',
      price: 89.90,
      image: '/products/tshirt-classic.jpg',
      category: 'camisetas',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: ['preto', 'branco'],
      stock: 100,
    },
    {
      id: '2',
      name: 'T-Shirt Quality - BRASIL ACIMA DE TUDO',
      description: 'Camiseta premium com design exclusivo',
      price: 94.90,
      image: '/products/tshirt-quality.jpg',
      category: 'camisetas',
      sizes: ['P', 'M', 'G', 'GG', 'XG'],
      colors: ['azul', 'preto'],
      stock: 80,
    },
    {
      id: '3',
      name: 'Polo Prime - Bandeira Minimalista',
      description: 'Polo elegante com detalhe discreto da bandeira',
      price: 119.90,
      image: '/products/polo-prime.jpg',
      category: 'polo',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: ['branco', 'preto', 'azul'],
      stock: 60,
    },
    {
      id: '4',
      name: 'Moletom Canguru - Cristo Redentor',
      description: 'Moletom quentinho com estampa icônica',
      price: 179.90,
      image: '/products/moletom-canguru.jpg',
      category: 'moletom',
      sizes: ['P', 'M', 'G', 'GG', 'XG'],
      colors: ['preto', 'cinza'],
      stock: 50,
    },
    {
      id: '5',
      name: 'Boné Americano - Escudo Patriota',
      description: 'Boné estilo trucker com escudo bordado',
      price: 69.90,
      image: '/products/bone-americano.jpg',
      category: 'bone',
      sizes: ['Único'],
      colors: ['verde', 'preto'],
      stock: 120,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }

  console.log(`✅ Seeded ${products.length} products`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
