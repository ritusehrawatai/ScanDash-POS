import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { invoiceOcrService } from './src/services/InvoiceOcrService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const startTime = Date.now();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // REST API Routes matching the Spring Boot backend contract
  // Architecture: Frontend -> REST API -> Controller -> Service -> Repository -> PostgreSQL

  // Health check endpoint
  app.get(['/api/v1/health', '/api/health'], async (req: Request, res: Response) => {
    // Check if external Spring Boot instance is reachable (e.g. at localhost:8080)
    const springBootUrl = process.env.SPRING_BOOT_URL || 'http://localhost:8080';
    let springBootActive = false;
    let externalData = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const upstream = await fetch(`${springBootUrl}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (upstream.ok) {
        externalData = await upstream.json();
        springBootActive = true;
      }
    } catch {
      // Upstream Spring Boot not running locally, fallback to embedded mock/standalone engine
      springBootActive = false;
    }

    if (springBootActive && externalData) {
      res.json(externalData);
      return;
    }

    // Default standalone response strictly matching Spring Boot ApiResponse<HealthStatusDto>
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const memoryUsage = process.memoryUsage();

    const responsePayload = {
      success: true,
      message: 'System is healthy and operational',
      data: {
        status: 'UP',
        service: 'grocery-pos-backend',
        version: '1.0.0-SNAPSHOT',
        environment: process.env.NODE_ENV || 'dev',
        uptimeSeconds,
        database: {
          status: 'CONFIGURED',
          databaseProductName: 'PostgreSQL 15 (Configured in backend/src/main/resources/application.yml)',
          url: 'jdbc:postgresql://localhost:5432/grocerypos',
        },
        memory: {
          totalMemoryMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          freeMemoryMb: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024),
          maxMemoryMb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        modules: {
          'core-architecture': 'READY (Initialized)',
          'spring-boot-maven': 'CONFIGURED (backend/pom.xml & Java sources ready)',
          'database-layer': 'CONFIGURED (Spring Data JPA + PostgreSQL driver)',
          'health-check-api': 'READY (Operational /api/v1/health)',
          'product-database': 'IMPLEMENTED (Product, Category, Supplier entities & JPA Repositories)',
          'product-management-api': 'IMPLEMENTED (CRUD REST API + Search)',
          'inventory-foundation': 'IMPLEMENTED (Inventory & InventoryTransaction entities, repositories & service)',
          'low-stock-notifications': 'IMPLEMENTED (In-App Notification entity, triggers, duplicate prevention & APIs)',
          'invoice-upload': 'IMPLEMENTED (Secure storage, JPG/JPEG/PNG/PDF validation, status UPLOADED)',
          'invoice-ocr-tesseract': 'IMPLEMENTED (Tesseract OCR, InvoiceOcrService, entity extraction, confidence scoring & manual review flagging)',
          'invoice-review-confirmation': 'IMPLEMENTED (Interactive Review Screen, Edit Supplier/Number/Date/Product/SKU/Barcode/Qty/Price, Product Matching, Item Ignoring, Explicit Confirmation & Inventory Stock Update)',
          'pos-checkout': 'IMPLEMENTED (Sale & SaleItem entities, transactional checkout, stock deduction & audit)',
          'sales-reporting': 'PLANNED (Phase 5)',
          'auth-rbac': 'PLANNED (Phase 6)',
        },
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    res.json(responsePayload);
  });

  // Lightweight heartbeat ping endpoint
  app.get('/api/v1/health/ping', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'FreshCart POS API heartbeat',
      data: 'pong',
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // Product REST API Endpoints
  // POST   /api/products
  // GET    /api/products
  // GET    /api/products/:id
  // PUT    /api/products/:id
  // DELETE /api/products/:id
  // ==========================================

  interface ProductRecord {
    id: number;
    name: string;
    sku: string;
    barcode: string | null;
    description: string | null;
    categoryId: number | null;
    categoryName: string | null;
    supplierId: number | null;
    supplierName: string | null;
    purchasePrice: number;
    sellingPrice: number;
    taxRate: number;
    unit: string;
    minimumInventoryThreshold: number;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  }

  const productsStore: ProductRecord[] = [
    {
      id: 1,
      name: 'Organic Cavendish Bananas',
      sku: 'SKU-BAN-001',
      barcode: '012345678901',
      description: 'Fair-trade organic Cavendish bananas by the bunch',
      categoryId: 1,
      categoryName: 'Produce',
      supplierId: 1,
      supplierName: 'Green Valley Produce',
      purchasePrice: 0.65,
      sellingPrice: 1.29,
      taxRate: 0.0,
      unit: 'KG',
      minimumInventoryThreshold: 20,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Whole Milk 1 Gallon',
      sku: 'SKU-MLK-001',
      barcode: '012345678902',
      description: 'Grade A pasteurized whole milk',
      categoryId: 2,
      categoryName: 'Dairy',
      supplierId: 2,
      supplierName: 'Sunny Ridge Dairies',
      purchasePrice: 2.4,
      sellingPrice: 3.89,
      taxRate: 0.0,
      unit: 'GALLON',
      minimumInventoryThreshold: 15,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'Organic Milk Half Gallon',
      sku: 'SKU-MLK-002',
      barcode: '012345678903',
      description: 'USDA Certified organic pasteurized milk',
      categoryId: 2,
      categoryName: 'Dairy',
      supplierId: 2,
      supplierName: 'Sunny Ridge Dairies',
      purchasePrice: 2.8,
      sellingPrice: 4.49,
      taxRate: 0.0,
      unit: 'GALLON',
      minimumInventoryThreshold: 10,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 4,
      name: 'Chocolate Milk 1 Quart',
      sku: 'SKU-MLK-003',
      barcode: '012345678904',
      description: 'Rich and creamy Dutch chocolate whole milk',
      categoryId: 2,
      categoryName: 'Dairy',
      supplierId: 2,
      supplierName: 'Sunny Ridge Dairies',
      purchasePrice: 1.6,
      sellingPrice: 2.79,
      taxRate: 0.0,
      unit: 'QUART',
      minimumInventoryThreshold: 12,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  let nextProductId = 5;

  // Helper validation for price and threshold
  function validateProductInput(body: any): string | null {
    if (!body || typeof body !== 'object') {
      return 'Request body must be a valid JSON object.';
    }
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return 'Product name is required and cannot be empty.';
    }
    if (!body.sku || typeof body.sku !== 'string' || body.sku.trim() === '') {
      return 'SKU is required and cannot be empty.';
    }
    if (body.purchasePrice === undefined || body.purchasePrice === null || typeof body.purchasePrice !== 'number' || isNaN(body.purchasePrice) || body.purchasePrice < 0) {
      return 'Purchase price is required, must be a number, and cannot be negative.';
    }
    if (body.sellingPrice === undefined || body.sellingPrice === null || typeof body.sellingPrice !== 'number' || isNaN(body.sellingPrice) || body.sellingPrice < 0) {
      return 'Selling price is required, must be a number, and cannot be negative.';
    }
    if (body.taxRate === undefined || body.taxRate === null || typeof body.taxRate !== 'number' || isNaN(body.taxRate) || body.taxRate < 0) {
      return 'Tax rate is required, must be a number, and cannot be negative.';
    }
    if (body.minimumInventoryThreshold !== undefined && body.minimumInventoryThreshold !== null) {
      if (typeof body.minimumInventoryThreshold !== 'number' || isNaN(body.minimumInventoryThreshold) || body.minimumInventoryThreshold < 0) {
        return 'Minimum inventory threshold must be a number and cannot be negative.';
      }
    }
    return null;
  }

  // POST /api/products
  app.post('/api/products', (req: Request, res: Response) => {
    const errorMsg = validateProductInput(req.body);
    if (errorMsg) {
      res.status(400).json({
        success: false,
        error: errorMsg,
        status: 400,
        path: '/api/products',
        timestamp: new Date().toISOString(),
        details: [errorMsg],
      });
      return;
    }

    const { name, sku, barcode, description, categoryId, supplierId, purchasePrice, sellingPrice, taxRate, unit, minimumInventoryThreshold, active } = req.body;
    const trimmedSku = sku.trim();
    const trimmedBarcode = barcode && typeof barcode === 'string' && barcode.trim() !== '' ? barcode.trim() : null;

    // Duplicate SKU check
    if (productsStore.some((p) => p.sku.toLowerCase() === trimmedSku.toLowerCase())) {
      res.status(409).json({
        success: false,
        error: `A product with SKU '${trimmedSku}' already exists.`,
        status: 409,
        path: '/api/products',
        timestamp: new Date().toISOString(),
        details: ['Unique constraint conflict: sku'],
      });
      return;
    }

    // Duplicate barcode check
    if (trimmedBarcode && productsStore.some((p) => p.barcode === trimmedBarcode)) {
      res.status(409).json({
        success: false,
        error: `A product with barcode '${trimmedBarcode}' already exists.`,
        status: 409,
        path: '/api/products',
        timestamp: new Date().toISOString(),
        details: ['Unique constraint conflict: barcode'],
      });
      return;
    }

    const newProduct: ProductRecord = {
      id: nextProductId++,
      name: name.trim(),
      sku: trimmedSku,
      barcode: trimmedBarcode,
      description: description ? description.trim() : null,
      categoryId: categoryId || null,
      categoryName: categoryId === 1 ? 'Produce' : categoryId === 2 ? 'Dairy' : null,
      supplierId: supplierId || null,
      supplierName: supplierId === 1 ? 'Green Valley Produce' : supplierId === 2 ? 'Sunny Ridge Dairies' : null,
      purchasePrice: Number(purchasePrice),
      sellingPrice: Number(sellingPrice),
      taxRate: Number(taxRate),
      unit: unit ? unit.trim() : 'PCS',
      minimumInventoryThreshold: minimumInventoryThreshold !== undefined ? Number(minimumInventoryThreshold) : 0,
      active: active !== undefined ? Boolean(active) : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    productsStore.push(newProduct);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/products
  app.get('/api/products', (req: Request, res: Response) => {
    const { search, categoryId, activeOnly } = req.query;
    let list = [...productsStore];

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }

    if (categoryId) {
      const cid = Number(categoryId);
      list = list.filter((p) => p.categoryId === cid);
    }

    if (activeOnly === 'true') {
      list = list.filter((p) => p.active);
    }

    res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: list,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/products/search?q={query}
  app.get('/api/products/search', (req: Request, res: Response) => {
    const q = req.query.q !== undefined ? String(req.query.q).trim().toLowerCase() : '';
    const activeOnly = req.query.activeOnly === 'true';

    let list = [...productsStore];

    if (activeOnly) {
      list = list.filter((p) => p.active);
    }

    if (q) {
      list = list.filter((p) => {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku.toLowerCase().includes(q);
        const matchesBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
        const matchesCategory = p.categoryName ? p.categoryName.toLowerCase().includes(q) : false;
        return matchesName || matchesSku || matchesBarcode || matchesCategory;
      });
    }

    res.json({
      success: true,
      message: `Found ${list.length} products matching query '${q}'`,
      data: list,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/products/:id
  app.get('/api/products/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const product = productsStore.find((p) => p.id === id);
    if (!product) {
      res.status(404).json({
        success: false,
        error: `Product not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: ['Resource not found'],
      });
      return;
    }

    res.json({
      success: true,
      message: 'Product retrieved successfully',
      data: product,
      timestamp: new Date().toISOString(),
    });
  });

  // PUT /api/products/:id
  app.put('/api/products/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const index = productsStore.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).json({
        success: false,
        error: `Product not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: ['Resource not found'],
      });
      return;
    }

    const errorMsg = validateProductInput(req.body);
    if (errorMsg) {
      res.status(400).json({
        success: false,
        error: errorMsg,
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: [errorMsg],
      });
      return;
    }

    const { name, sku, barcode, description, categoryId, supplierId, purchasePrice, sellingPrice, taxRate, unit, minimumInventoryThreshold, active } = req.body;
    const trimmedSku = sku.trim();
    const trimmedBarcode = barcode && typeof barcode === 'string' && barcode.trim() !== '' ? barcode.trim() : null;

    // Check duplicate SKU on other products
    const duplicateSku = productsStore.find((p) => p.sku.toLowerCase() === trimmedSku.toLowerCase() && p.id !== id);
    if (duplicateSku) {
      res.status(409).json({
        success: false,
        error: `A product with SKU '${trimmedSku}' already exists.`,
        status: 409,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: ['Unique constraint conflict: sku'],
      });
      return;
    }

    // Check duplicate barcode on other products
    if (trimmedBarcode) {
      const duplicateBarcode = productsStore.find((p) => p.barcode === trimmedBarcode && p.id !== id);
      if (duplicateBarcode) {
        res.status(409).json({
          success: false,
          error: `A product with barcode '${trimmedBarcode}' already exists.`,
          status: 409,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
          details: ['Unique constraint conflict: barcode'],
        });
        return;
      }
    }

    const existing = productsStore[index];
    const updated: ProductRecord = {
      ...existing,
      name: name.trim(),
      sku: trimmedSku,
      barcode: trimmedBarcode,
      description: description ? description.trim() : null,
      categoryId: categoryId !== undefined ? categoryId : existing.categoryId,
      supplierId: supplierId !== undefined ? supplierId : existing.supplierId,
      purchasePrice: Number(purchasePrice),
      sellingPrice: Number(sellingPrice),
      taxRate: Number(taxRate),
      unit: unit ? unit.trim() : existing.unit,
      minimumInventoryThreshold: minimumInventoryThreshold !== undefined ? Number(minimumInventoryThreshold) : existing.minimumInventoryThreshold,
      active: active !== undefined ? Boolean(active) : existing.active,
      updatedAt: new Date().toISOString(),
    };

    productsStore[index] = updated;

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updated,
      timestamp: new Date().toISOString(),
    });
  });

  // DELETE /api/products/:id
  app.delete('/api/products/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const index = productsStore.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).json({
        success: false,
        error: `Product not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: ['Resource not found'],
      });
      return;
    }

    productsStore.splice(index, 1);
    res.status(204).send();
  });

  // ==========================================
  // Inventory REST API Endpoints
  // GET  /api/inventory
  // GET  /api/inventory/product/:productId
  // GET  /api/inventory/:productId
  // POST /api/inventory/add
  // POST /api/inventory/remove
  // POST /api/inventory/adjust
  // GET  /api/inventory/:productId/transactions
  // GET  /api/inventory/transactions?productId={id}
  // ==========================================

  interface InventoryRecord {
    id: number;
    productId: number;
    productName: string;
    productSku: string;
    unit: string;
    currentQuantity: number;
    minimumInventoryThreshold: number;
    stockStatus: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
    lastUpdated: string;
  }

  // Consistent backend inventory status calculation logic
  // - If current quantity == 0: OUT OF STOCK
  // - If current quantity > 0 AND current quantity <= minimum threshold: LOW STOCK
  // - Otherwise: IN STOCK
  function calculateInventoryStatus(quantity: number, threshold: number): 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK' {
    if (quantity <= 0) {
      return 'OUT OF STOCK';
    }
    if (quantity > 0 && quantity <= threshold) {
      return 'LOW STOCK';
    }
    return 'IN STOCK';
  }

  interface InventoryTransactionRecord {
    id: number;
    productId: number;
    productName: string;
    productSku: string;
    transactionType: string;
    quantity: number;
    previousQuantity: number;
    newQuantity: number;
    reason: string | null;
    referenceId: string | null;
    createdAt: string;
  }

  const inventoryStore: Map<number, InventoryRecord> = new Map([
    [
      1,
      {
        id: 1,
        productId: 1,
        productName: 'Organic Cavendish Bananas',
        productSku: 'SKU-BAN-001',
        unit: 'KG',
        currentQuantity: 45.5,
        minimumInventoryThreshold: 20,
        stockStatus: 'IN STOCK',
        lastUpdated: new Date().toISOString(),
      },
    ],
    [
      2,
      {
        id: 2,
        productId: 2,
        productName: 'Whole Milk 1 Gallon',
        productSku: 'SKU-MLK-001',
        unit: 'GALLON',
        currentQuantity: 28.0,
        minimumInventoryThreshold: 15,
        stockStatus: 'IN STOCK',
        lastUpdated: new Date().toISOString(),
      },
    ],
    [
      3,
      {
        id: 3,
        productId: 3,
        productName: 'Organic Milk Half Gallon',
        productSku: 'SKU-MLK-002',
        unit: 'GALLON',
        currentQuantity: 18.0,
        minimumInventoryThreshold: 10,
        stockStatus: 'IN STOCK',
        lastUpdated: new Date().toISOString(),
      },
    ],
    [
      4,
      {
        id: 4,
        productId: 4,
        productName: 'Chocolate Milk 1 Quart',
        productSku: 'SKU-MLK-003',
        unit: 'QUART',
        currentQuantity: 14.0,
        minimumInventoryThreshold: 12,
        stockStatus: 'IN STOCK',
        lastUpdated: new Date().toISOString(),
      },
    ],
  ]);

  let nextInvId = 5;
  let nextTxId = 100;

  // ==========================================
  // In-App Notification Store & Trigger Logic
  // ==========================================
  interface NotificationRecord {
    id: number;
    type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'RESTOCK';
    message: string;
    severity: 'WARNING' | 'CRITICAL' | 'INFO';
    productId: number;
    productName: string;
    productSku: string;
    product: {
      id: number;
      name: string;
      sku: string;
      unit: string;
    };
    read: boolean;
    createdAt: string;
  }

  let nextNotificationId = 1;
  const notificationsStore: NotificationRecord[] = [];

  function checkAndTriggerStockNotification(product: ProductRecord, currentQuantity: number) {
    if (!product) return;
    const threshold = product.minimumInventoryThreshold ?? 0;
    const status = calculateInventoryStatus(currentQuantity, threshold);

    if (status === 'OUT OF STOCK') {
      // Check if unread OUT_OF_STOCK already exists for this product
      const alreadyNotified = notificationsStore.some(
        (n) => n.productId === product.id && n.type === 'OUT_OF_STOCK' && !n.read
      );
      if (!alreadyNotified) {
        const msg = `Product '${product.name}' (SKU: ${product.sku}) is OUT OF STOCK. Current quantity: 0 ${product.unit}.`;
        const notification: NotificationRecord = {
          id: nextNotificationId++,
          type: 'OUT_OF_STOCK',
          message: msg,
          severity: 'CRITICAL',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
          },
          read: false,
          createdAt: new Date().toISOString(),
        };
        notificationsStore.unshift(notification);
      }
    } else if (status === 'LOW STOCK') {
      // Check if unread LOW_STOCK already exists for this product
      const alreadyNotified = notificationsStore.some(
        (n) => n.productId === product.id && n.type === 'LOW_STOCK' && !n.read
      );
      if (!alreadyNotified) {
        const msg = `Product '${product.name}' (SKU: ${product.sku}) is running LOW ON STOCK. Current quantity: ${currentQuantity} ${product.unit} (Minimum threshold: ${threshold}).`;
        const notification: NotificationRecord = {
          id: nextNotificationId++,
          type: 'LOW_STOCK',
          message: msg,
          severity: 'WARNING',
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
          },
          read: false,
          createdAt: new Date().toISOString(),
        };
        notificationsStore.unshift(notification);
      }
    }
  }

  const inventoryTransactionsStore: InventoryTransactionRecord[] = [
    {
      id: 1,
      productId: 1,
      productName: 'Organic Cavendish Bananas',
      productSku: 'SKU-BAN-001',
      transactionType: 'PURCHASE',
      quantity: 45.5,
      previousQuantity: 0.0,
      newQuantity: 45.5,
      reason: 'Initial supplier delivery',
      referenceId: 'PO-1001',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 2,
      productId: 2,
      productName: 'Whole Milk 1 Gallon',
      productSku: 'SKU-MLK-001',
      transactionType: 'PURCHASE',
      quantity: 28.0,
      previousQuantity: 0.0,
      newQuantity: 28.0,
      reason: 'Dairy delivery',
      referenceId: 'PO-1002',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  // Helper to get or create inventory
  function getOrCreateInventory(product: ProductRecord): InventoryRecord {
    let inv = inventoryStore.get(product.id);
    const threshold = product.minimumInventoryThreshold ?? 0;
    if (!inv) {
      inv = {
        id: nextInvId++,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unit: product.unit,
        currentQuantity: 0.0,
        minimumInventoryThreshold: threshold,
        stockStatus: calculateInventoryStatus(0.0, threshold),
        lastUpdated: new Date().toISOString(),
      };
      inventoryStore.set(product.id, inv);
    } else {
      inv.minimumInventoryThreshold = threshold;
      inv.stockStatus = calculateInventoryStatus(inv.currentQuantity, threshold);
    }
    return inv;
  }

  // GET /api/inventory
  app.get('/api/inventory', (req: Request, res: Response) => {
    // Ensure all products have inventory records
    productsStore.forEach((p) => getOrCreateInventory(p));
    const list = Array.from(inventoryStore.values());
    res.json({
      success: true,
      message: 'Inventory retrieved successfully',
      data: list,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/inventory/product/:productId & GET /api/inventory/:productId
  app.get(['/api/inventory/product/:productId', '/api/inventory/:productId([0-9]+)'], (req: Request, res: Response) => {
    const pid = Number(req.params.productId);
    const product = productsStore.find((p) => p.id === pid);
    if (!product) {
      res.status(404).json({
        success: false,
        error: `Product not found with ID: ${pid}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const inv = getOrCreateInventory(product);
    res.json({
      success: true,
      message: 'Product inventory retrieved successfully',
      data: inv,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/inventory/add
  app.post('/api/inventory/add', (req: Request, res: Response) => {
    const { productId, quantity, transactionType, reason, referenceId } = req.body;
    const pid = Number(productId);
    const qty = Number(quantity);

    if (!pid || isNaN(pid)) {
      res.status(400).json({ success: false, error: 'Product ID is required', status: 400, path: req.originalUrl });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({ success: false, error: 'Quantity to add must be greater than zero', status: 400, path: req.originalUrl });
      return;
    }

    const product = productsStore.find((p) => p.id === pid);
    if (!product) {
      res.status(404).json({ success: false, error: `Product not found with ID: ${pid}`, status: 404, path: req.originalUrl });
      return;
    }

    const inv = getOrCreateInventory(product);
    const previousQuantity = inv.currentQuantity;
    const newQuantity = Number((previousQuantity + qty).toFixed(3));

    inv.currentQuantity = newQuantity;
    inv.stockStatus = calculateInventoryStatus(newQuantity, product.minimumInventoryThreshold ?? 0);
    inv.lastUpdated = new Date().toISOString();

    const txType = transactionType || 'PURCHASE';
    const tx: InventoryTransactionRecord = {
      id: nextTxId++,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      transactionType: txType,
      quantity: qty,
      previousQuantity,
      newQuantity,
      reason: reason || 'Stock addition',
      referenceId: referenceId || null,
      createdAt: new Date().toISOString(),
    };
    inventoryTransactionsStore.push(tx);
    checkAndTriggerStockNotification(product, newQuantity);

    res.status(201).json({
      success: true,
      message: 'Stock added successfully',
      data: tx,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/inventory/remove
  app.post('/api/inventory/remove', (req: Request, res: Response) => {
    const { productId, quantity, transactionType, reason, referenceId } = req.body;
    const pid = Number(productId);
    const qty = Number(quantity);

    if (!pid || isNaN(pid)) {
      res.status(400).json({ success: false, error: 'Product ID is required', status: 400, path: req.originalUrl });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({ success: false, error: 'Quantity to remove must be greater than zero', status: 400, path: req.originalUrl });
      return;
    }

    const product = productsStore.find((p) => p.id === pid);
    if (!product) {
      res.status(404).json({ success: false, error: `Product not found with ID: ${pid}`, status: 404, path: req.originalUrl });
      return;
    }

    const inv = getOrCreateInventory(product);
    const previousQuantity = inv.currentQuantity;

    // Prevent negative inventory
    if (previousQuantity < qty) {
      res.status(400).json({
        success: false,
        error: `Insufficient inventory: current stock is ${previousQuantity}, but requested deduction is ${qty}`,
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const newQuantity = Number((previousQuantity - qty).toFixed(3));
    inv.currentQuantity = newQuantity;
    inv.stockStatus = calculateInventoryStatus(newQuantity, product.minimumInventoryThreshold ?? 0);
    inv.lastUpdated = new Date().toISOString();

    const txType = transactionType || 'DAMAGE';
    const tx: InventoryTransactionRecord = {
      id: nextTxId++,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      transactionType: txType,
      quantity: qty,
      previousQuantity,
      newQuantity,
      reason: reason || 'Stock removal',
      referenceId: referenceId || null,
      createdAt: new Date().toISOString(),
    };
    inventoryTransactionsStore.push(tx);
    checkAndTriggerStockNotification(product, newQuantity);

    res.json({
      success: true,
      message: 'Stock removed successfully',
      data: tx,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/inventory/adjust
  app.post('/api/inventory/adjust', (req: Request, res: Response) => {
    const { productId, targetQuantity, reason, referenceId } = req.body;
    const pid = Number(productId);
    const target = Number(targetQuantity);

    if (!pid || isNaN(pid)) {
      res.status(400).json({ success: false, error: 'Product ID is required', status: 400, path: req.originalUrl });
      return;
    }
    if (isNaN(target) || target < 0) {
      res.status(400).json({ success: false, error: 'Target stock quantity cannot be negative', status: 400, path: req.originalUrl });
      return;
    }

    const product = productsStore.find((p) => p.id === pid);
    if (!product) {
      res.status(404).json({ success: false, error: `Product not found with ID: ${pid}`, status: 404, path: req.originalUrl });
      return;
    }

    const inv = getOrCreateInventory(product);
    const previousQuantity = inv.currentQuantity;
    const delta = Math.abs(Number((target - previousQuantity).toFixed(3)));

    inv.currentQuantity = target;
    inv.stockStatus = calculateInventoryStatus(target, product.minimumInventoryThreshold ?? 0);
    inv.lastUpdated = new Date().toISOString();

    const tx: InventoryTransactionRecord = {
      id: nextTxId++,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      transactionType: 'ADJUSTMENT',
      quantity: delta,
      previousQuantity,
      newQuantity: target,
      reason: reason || 'Stock level adjustment',
      referenceId: referenceId || null,
      createdAt: new Date().toISOString(),
    };
    inventoryTransactionsStore.push(tx);
    checkAndTriggerStockNotification(product, target);

    res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: tx,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/inventory/:productId/transactions & GET /api/inventory/transactions
  app.get(
    [
      '/api/inventory/product/:productId/transactions',
      '/api/inventory/:productId([0-9]+)/transactions',
      '/api/inventory/transactions',
    ],
    (req: Request, res: Response) => {
      const pidParam = req.params.productId || req.query.productId;
      if (!pidParam) {
        // Return all transactions if no product specified
        const allTx = [...inventoryTransactionsStore].reverse();
        res.json({
          success: true,
          message: 'All inventory transactions retrieved successfully',
          data: allTx,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const pid = Number(pidParam);
      const product = productsStore.find((p) => p.id === pid);
      if (!product) {
        res.status(404).json({
          success: false,
          error: `Product not found with ID: ${pid}`,
          status: 404,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const history = inventoryTransactionsStore
        .filter((tx) => tx.productId === pid)
        .reverse();

      res.json({
        success: true,
        message: 'Transaction history retrieved successfully',
        data: history,
        timestamp: new Date().toISOString(),
      });
    }
  );

  // ==========================================
  // In-App Low-Stock Notifications REST API
  // GET    /api/notifications
  // GET    /api/notifications/unread-count
  // PUT    /api/notifications/:id/read
  // PATCH  /api/notifications/:id/read
  // PUT    /api/notifications/read-all
  // POST   /api/notifications/read-all
  // ==========================================

  // GET /api/notifications
  app.get('/api/notifications', (req: Request, res: Response) => {
    const unreadOnly = req.query.unreadOnly === 'true';
    const list = unreadOnly
      ? notificationsStore.filter((n) => !n.read)
      : [...notificationsStore];

    res.json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: list,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/notifications/unread-count
  app.get('/api/notifications/unread-count', (req: Request, res: Response) => {
    const count = notificationsStore.filter((n) => !n.read).length;
    res.json({
      success: true,
      message: 'Unread count retrieved',
      data: { count },
      timestamp: new Date().toISOString(),
    });
  });

  // PUT /api/notifications/:id/read & PATCH /api/notifications/:id/read
  app.all(['/api/notifications/:id/read'], (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const notification = notificationsStore.find((n) => n.id === id);
    if (!notification) {
      res.status(404).json({
        success: false,
        error: `Notification not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        details: ['Resource not found'],
      });
      return;
    }

    notification.read = true;
    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
      timestamp: new Date().toISOString(),
    });
  });

  // PUT /api/notifications/read-all & POST /api/notifications/read-all
  app.all(['/api/notifications/read-all'], (req: Request, res: Response) => {
    let updatedCount = 0;
    notificationsStore.forEach((n) => {
      if (!n.read) {
        n.read = true;
        updatedCount++;
      }
    });

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: { updatedCount },
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // Sale Processing REST API
  // POST /api/sales - Complete POS Cart Sale
  // GET  /api/sales - List all completed sales
  // GET  /api/sales/:id - Get sale by ID
  // GET  /api/sales/receipt/:receiptNumber - Lookup by receipt
  // ==========================================

  interface SaleItemRecord {
    id: number;
    saleId: number;
    productId: number;
    productName: string;
    productSku: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  }

  interface SaleRecord {
    id: number;
    receiptNumber: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
    itemCount: number;
    items: SaleItemRecord[];
    createdAt: string;
  }

  let nextSaleId = 1;
  let nextSaleItemId = 1;
  const salesStore: SaleRecord[] = [];

  // POST /api/sales - Complete a sale transactionally
  app.post('/api/sales', (req: Request, res: Response) => {
    const { items } = req.body;

    // 1. Validate cart
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Cart cannot be empty. At least one product is required to complete a sale.',
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Consolidate quantities per product ID
    const aggregated = new Map<number, number>();
    for (const item of items) {
      const pid = Number(item.productId);
      const qty = Number(item.quantity);

      if (!pid || isNaN(pid)) {
        res.status(400).json({
          success: false,
          error: 'Product ID is required for each cart item',
          status: 400,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (isNaN(qty) || qty <= 0) {
        res.status(400).json({
          success: false,
          error: `Quantity must be greater than zero for product ID: ${pid}`,
          status: 400,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const existingQty = aggregated.get(pid) || 0;
      aggregated.set(pid, Number((existingQty + qty).toFixed(3)));
    }

    // 2. Validate product availability and inventory before any mutations
    const validatedProducts: { product: ProductRecord; inv: InventoryRecord; qty: number }[] = [];

    for (const [productId, requestedQty] of aggregated.entries()) {
      const product = productsStore.find((p) => p.id === productId);
      if (!product) {
        res.status(404).json({
          success: false,
          error: `Product not found with ID: ${productId}`,
          status: 404,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (product.active === false) {
        res.status(400).json({
          success: false,
          error: `Product '${product.name}' (SKU: ${product.sku}) is inactive and cannot be sold.`,
          status: 400,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const inv = getOrCreateInventory(product);
      if (inv.currentQuantity < requestedQty) {
        res.status(400).json({
          success: false,
          error: `Insufficient inventory for product '${product.name}' (SKU: ${product.sku}). Available: ${inv.currentQuantity} ${product.unit}, Requested: ${requestedQty} ${product.unit}`,
          status: 400,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      validatedProducts.push({ product, inv, qty: requestedQty });
    }

    // 3. Calculate subtotal, 4. Calculate tax, 5. Calculate total
    let orderSubtotal = 0;
    let orderTax = 0;
    let totalItemCount = 0;

    const receiptNumber = `REC-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const saleId = nextSaleId++;

    const preparedItems: SaleItemRecord[] = [];

    for (const { product, qty } of validatedProducts) {
      const unitPrice = product.sellingPrice;
      const lineSubtotal = Number((unitPrice * qty).toFixed(2));

      const rawTaxRate = product.taxRate || 0;
      const taxRateDec = rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate;
      const lineTax = Number((lineSubtotal * taxRateDec).toFixed(2));
      const lineTotal = Number((lineSubtotal + lineTax).toFixed(2));

      orderSubtotal += lineSubtotal;
      orderTax += lineTax;
      totalItemCount += qty;

      preparedItems.push({
        id: nextSaleItemId++,
        saleId,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unit: product.unit,
        quantity: qty,
        unitPrice,
        taxRate: rawTaxRate,
        subtotal: lineSubtotal,
        taxAmount: lineTax,
        totalAmount: lineTotal,
      });
    }

    orderSubtotal = Number(orderSubtotal.toFixed(2));
    orderTax = Number(orderTax.toFixed(2));
    const orderTotal = Number((orderSubtotal + orderTax).toFixed(2));

    // 6. Create Sale
    const saleRecord: SaleRecord = {
      id: saleId,
      receiptNumber,
      subtotal: orderSubtotal,
      taxAmount: orderTax,
      totalAmount: orderTotal,
      status: 'COMPLETED',
      itemCount: Math.round(totalItemCount),
      items: preparedItems,
      createdAt: new Date().toISOString(),
    };

    salesStore.unshift(saleRecord);

    // 8. Deduct inventory, 9. Create SALE inventory transactions, 10. Recalculate status, 11. Trigger notifications
    for (const { product, inv, qty } of validatedProducts) {
      const previousQuantity = inv.currentQuantity;
      const newQuantity = Number((previousQuantity - qty).toFixed(3));

      // 8. Deduct inventory
      inv.currentQuantity = newQuantity;
      inv.lastUpdated = new Date().toISOString();

      // 9. Create SALE inventory transaction
      const tx: InventoryTransactionRecord = {
        id: nextTxId++,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        transactionType: 'SALE',
        quantity: qty,
        previousQuantity,
        newQuantity,
        reason: `Sale completed - ${receiptNumber}`,
        referenceId: receiptNumber,
        createdAt: new Date().toISOString(),
      };
      inventoryTransactionsStore.push(tx);

      // 10. Recalculate inventory status
      inv.stockStatus = calculateInventoryStatus(newQuantity, product.minimumInventoryThreshold ?? 0);

      // 11. Trigger existing notification logic
      checkAndTriggerStockNotification(product, newQuantity);
    }

    res.status(201).json({
      success: true,
      message: `Sale completed successfully. Receipt: ${receiptNumber}`,
      data: saleRecord,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/sales - List all completed sales
  app.get('/api/sales', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Sales retrieved successfully',
      data: salesStore,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/sales/receipt/:receiptNumber
  app.get('/api/sales/receipt/:receiptNumber', (req: Request, res: Response) => {
    const receiptNumber = req.params.receiptNumber;
    const sale = salesStore.find((s) => s.receiptNumber.toLowerCase() === receiptNumber.toLowerCase());

    if (!sale) {
      res.status(404).json({
        success: false,
        error: `Sale not found with receipt number: ${receiptNumber}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      message: 'Sale retrieved successfully',
      data: sale,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/sales/:id
  app.get('/api/sales/:id([0-9]+)', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const sale = salesStore.find((s) => s.id === id);

    if (!sale) {
      res.status(404).json({
        success: false,
        error: `Sale not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      message: 'Sale retrieved successfully',
      data: sale,
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // Purchase Invoice Management API
  // Requirement: Implement ONLY invoice upload.
  // Allowed: JPG, JPEG, PNG, PDF
  // Validate: File type, File size, File integrity
  // Status: Initially UPLOADED
  // Store securely
  // Do NOT run OCR yet.
  // Do NOT modify inventory.
  // Do NOT automatically create products.
  // ==========================================

  const invoiceUploadsDir = path.resolve(__dirname, 'uploads', 'invoices');
  if (!fs.existsSync(invoiceUploadsDir)) {
    fs.mkdirSync(invoiceUploadsDir, { recursive: true });
  }

  const uploadInvoiceMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB maximum
    },
  });

  interface PurchaseInvoiceRecord {
    id: number;
    invoiceNumber: string;
    originalFilename: string;
    storedFilename: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    fileHash: string;
    status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'CONFIRMED' | 'FAILED';
    uploadedBy: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    ocrResult?: any;
    ocrProcessedAt?: string;
    confirmedAt?: string;
  }

  const ALLOWED_INVOICE_EXTS = ['jpg', 'jpeg', 'png', 'pdf'];

  function validateInvoiceBuffer(
    buffer: Buffer,
    originalFilename: string,
    mimeType?: string
  ): {
    valid: boolean;
    error?: string;
    extension: string;
    resolvedMime: string;
    sha256: string;
  } {
    if (!buffer || buffer.length === 0) {
      return {
        valid: false,
        error: 'Upload rejected: File is empty (0 bytes).',
        extension: '',
        resolvedMime: '',
        sha256: '',
      };
    }

    if (buffer.length > 15 * 1024 * 1024) {
      return {
        valid: false,
        error: `Upload rejected: File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds 15 MB limit.`,
        extension: '',
        resolvedMime: '',
        sha256: '',
      };
    }

    // Clean filename and extract extension
    const cleanName = path.basename(originalFilename || 'invoice');
    const dotIndex = cleanName.lastIndexOf('.');
    const ext = dotIndex > 0 ? cleanName.substring(dotIndex + 1).toLowerCase() : '';

    if (!ALLOWED_INVOICE_EXTS.includes(ext)) {
      return {
        valid: false,
        error: `Upload rejected: Unsupported file extension '.${ext}'. Allowed formats: JPG, JPEG, PNG, PDF.`,
        extension: '',
        resolvedMime: '',
        sha256: '',
      };
    }

    // Header magic bytes check
    if (buffer.length < 4) {
      return {
        valid: false,
        error: 'Integrity check failed: File header is truncated or corrupted.',
        extension: '',
        resolvedMime: '',
        sha256: '',
      };
    }

    if (ext === 'pdf') {
      // PDF header %PDF- (0x25, 0x50, 0x44, 0x46)
      const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
      if (!isPdf) {
        return {
          valid: false,
          error: 'Integrity check failed: File header signature does not match valid PDF specification.',
          extension: '',
          resolvedMime: '',
          sha256: '',
        };
      }
    } else if (ext === 'png') {
      // PNG header 0x89 50 4E 47
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      if (!isPng) {
        return {
          valid: false,
          error: 'Integrity check failed: File header signature does not match valid PNG specification.',
          extension: '',
          resolvedMime: '',
          sha256: '',
        };
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      // JPEG SOI header 0xFF 0xD8 0xFF
      const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      if (!isJpg) {
        return {
          valid: false,
          error: 'Integrity check failed: File header signature does not match valid JPEG/JPG specification.',
          extension: '',
          resolvedMime: '',
          sha256: '',
        };
      }
    }

    let resolvedMime = mimeType || '';
    if (!resolvedMime || resolvedMime === 'application/octet-stream') {
      if (ext === 'pdf') resolvedMime = 'application/pdf';
      else if (ext === 'png') resolvedMime = 'image/png';
      else resolvedMime = 'image/jpeg';
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      valid: true,
      extension: ext,
      resolvedMime,
      sha256,
    };
  }

  let nextInvoiceId = 1;
  const invoicesStore: PurchaseInvoiceRecord[] = [];

  interface PurchaseInvoiceItemRecord {
    id: number;
    purchaseInvoiceId: number;
    invoiceNumber: string;
    productId: number;
    productName: string;
    sku: string;
    barcode: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    matchedBy: 'EXPLICIT_USER_SELECTION' | 'BARCODE' | 'SKU' | 'NAME' | 'NEW_PRODUCT_CREATED';
    createdAt: string;
  }

  let nextPurchaseInvoiceItemId = 1;
  const purchaseInvoiceItemsStore: PurchaseInvoiceItemRecord[] = [];

  // Seed sample invoice data to demonstrate Tesseract OCR and manual review flagging
  const sampleImagePath = path.join(invoiceUploadsDir, 'sample-valley-organics-invoice.jpg');
  const sampleImageStats = fs.existsSync(sampleImagePath) ? fs.statSync(sampleImagePath) : null;

  // 1. Processed Invoice demonstrating extraction & low-confidence review flags
  invoicesStore.push({
    id: nextInvoiceId++,
    invoiceNumber: 'INV-20260928-88310',
    originalFilename: 'sysco_metro_distributors_invoice.png',
    storedFilename: 'sample-sysco-metro-distributors.png',
    filePath: sampleImagePath,
    fileSize: sampleImageStats ? sampleImageStats.size : 248192,
    mimeType: 'image/jpeg',
    fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'PROCESSED',
    uploadedBy: 'Store Manager',
    notes: 'Weekly fresh produce & dairy delivery from Metro distributor',
    createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    ocrProcessedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    ocrResult: {
      supplier: {
        value: 'Sysco Metro Food Distribution LLC',
        confidence: 94,
        flaggedForReview: false,
      },
      invoiceNumber: {
        value: 'INV-20260928-88310',
        confidence: 96,
        flaggedForReview: false,
      },
      invoiceDate: {
        value: '2026-09-28',
        confidence: 95,
        flaggedForReview: false,
      },
      total: {
        value: 148.8,
        confidence: 93,
        flaggedForReview: false,
      },
      items: [
        {
          id: 'item-01',
          productName: {
            value: 'Organic Hass Avocados (Case 48ct)',
            confidence: 96,
            flaggedForReview: false,
          },
          sku: {
            value: 'AVO-ORG-01',
            confidence: 94,
            flaggedForReview: false,
          },
          barcode: {
            value: '072527273070',
            confidence: 95,
            flaggedForReview: false,
          },
          quantity: {
            value: 2,
            confidence: 95,
            flaggedForReview: false,
          },
          unitPrice: {
            value: 24.5,
            confidence: 94,
            flaggedForReview: false,
          },
          total: {
            value: 49.0,
            confidence: 95,
            flaggedForReview: false,
          },
          confidence: 95,
          flaggedForReview: false,
          reviewReasons: [],
        },
        {
          id: 'item-02',
          productName: {
            value: 'Whole Fresh Organic Milk 1 Gal',
            confidence: 94,
            flaggedForReview: false,
          },
          sku: {
            value: 'MLK-ORG-02',
            confidence: 95,
            flaggedForReview: false,
          },
          barcode: {
            value: '011110417004',
            confidence: 94,
            flaggedForReview: false,
          },
          quantity: {
            value: 15,
            confidence: 95,
            flaggedForReview: false,
          },
          unitPrice: {
            value: 3.8,
            confidence: 93,
            flaggedForReview: false,
          },
          total: {
            value: 57.0,
            confidence: 94,
            flaggedForReview: false,
          },
          confidence: 94,
          flaggedForReview: false,
          reviewReasons: [],
        },
        {
          id: 'item-03',
          productName: {
            value: 'Honeycrisp Apples (Bag 3lb)',
            confidence: 92,
            flaggedForReview: false,
          },
          sku: {
            value: 'APP-HON-05',
            confidence: 92,
            flaggedForReview: false,
          },
          barcode: {
            value: '033383112001',
            confidence: 91,
            flaggedForReview: false,
          },
          quantity: {
            value: 10,
            confidence: 94,
            flaggedForReview: false,
          },
          unitPrice: {
            value: 4.28,
            confidence: 90,
            flaggedForReview: false,
          },
          total: {
            value: 42.8,
            confidence: 92,
            flaggedForReview: false,
          },
          confidence: 92,
          flaggedForReview: false,
          reviewReasons: [],
        },
        {
          id: 'item-04',
          productName: {
            value: 'Bulk Unlabeled Cilantro (Smudged scan)',
            confidence: 62,
            flaggedForReview: true,
            reason: 'Low OCR confidence (62%) on handwritten product line',
          },
          sku: {
            value: 'SKU-UNRESOLVED',
            confidence: 45,
            flaggedForReview: true,
            reason: 'SKU could not be parsed from scan',
          },
          barcode: {
            value: 'Missing / Illegible',
            confidence: 40,
            flaggedForReview: true,
            reason: 'Barcode not detected on document',
          },
          quantity: {
            value: 1,
            confidence: 65,
            flaggedForReview: true,
          },
          unitPrice: {
            value: 5.0,
            confidence: 60,
            flaggedForReview: true,
          },
          total: {
            value: 12.0,
            confidence: 58,
            flaggedForReview: true,
            reason: 'Arithmetic discrepancy: Qty (1) × Unit Price ($5.00) ≠ Line Total ($12.00)',
          },
          confidence: 55,
          flaggedForReview: true,
          reviewReasons: [
            'Low OCR confidence (62%) on product name',
            'SKU missing on scanned line item',
            'Barcode not detected on invoice',
            'Arithmetic discrepancy: 1 × $5.00 ($5.00) does not equal $12.00',
          ],
        },
      ],
      overallConfidence: 84,
      hasLowConfidenceValues: true,
      manualReviewRequired: true,
      ocrEngine: 'Tesseract OCR (open-source v5)',
      processedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      rawText:
        'SYSCO METRO FOOD DISTRIBUTION LLC\nInvoice #: INV-20260928-88310\nDate: 2026-09-28\n\nOrganic Hass Avocados (Case 48ct) | SKU: AVO-ORG-01 | UPC: 072527273070 | Qty: 2 | Unit: 24.50 | Total: 49.00\nWhole Fresh Organic Milk 1 Gal | SKU: MLK-ORG-02 | UPC: 011110417004 | Qty: 15 | Unit: 3.80 | Total: 57.00\nHoneycrisp Apples (Bag 3lb) | SKU: APP-HON-05 | UPC: 033383112001 | Qty: 10 | Unit: 4.28 | Total: 42.80\nBulk Unlabeled Cilantro | Qty: 1 | Unit: 5.00 | Total: 12.00\n\nGrand Total: $148.80',
      flaggedFieldsCount: 4,
      inventoryUpdated: false,
      automaticallyConfirmed: false,
    },
  });

  // 2. Uploaded invoice ready for 1-click live Tesseract OCR execution
  if (fs.existsSync(sampleImagePath)) {
    invoicesStore.push({
      id: nextInvoiceId++,
      invoiceNumber: 'INV-20261005-94812',
      originalFilename: 'green_valley_organics_oct5.jpg',
      storedFilename: 'sample-valley-organics-invoice.jpg',
      filePath: sampleImagePath,
      fileSize: sampleImageStats ? sampleImageStats.size : 312480,
      mimeType: 'image/jpeg',
      fileHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      status: 'UPLOADED',
      uploadedBy: 'Admin / Owner',
      notes: 'Scanned paper invoice from Green Valley Organics — Ready for Tesseract OCR extraction',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // POST /api/invoices/upload
  // Accepts multipart file or base64 JSON payload
  app.post('/api/invoices/upload', uploadInvoiceMiddleware.single('file'), (req: Request, res: Response) => {
    let fileBuffer: Buffer | null = null;
    let originalFilename = '';
    let mimeType = '';
    let notes = (req.body?.notes as string) || '';
    let uploadedBy = (req.body?.uploadedBy as string) || 'Admin / Owner';

    if (req.file) {
      fileBuffer = req.file.buffer;
      originalFilename = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (req.body?.base64Data && req.body?.filename) {
      originalFilename = req.body.filename;
      mimeType = req.body.mimeType || '';
      try {
        const cleanBase64 = req.body.base64Data.replace(/^data:.*?;base64,/, '');
        fileBuffer = Buffer.from(cleanBase64, 'base64');
      } catch {
        res.status(400).json({
          success: false,
          error: 'Invalid base64 encoded data provided for invoice file.',
          status: 400,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    if (!fileBuffer || !originalFilename) {
      res.status(400).json({
        success: false,
        error: 'No invoice file uploaded. Please provide a JPG, JPEG, PNG, or PDF file.',
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate type, size, and integrity
    const validation = validateInvoiceBuffer(fileBuffer, originalFilename, mimeType);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Securely write file to disk with unique UUID filename to prevent collisions & path traversal
    const safeStoredFilename = `${crypto.randomUUID()}.${validation.extension}`;
    const secureFilePath = path.join(invoiceUploadsDir, safeStoredFilename);

    try {
      fs.writeFileSync(secureFilePath, fileBuffer);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Failed to securely write invoice to disk: ${err.message}`,
        status: 500,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Generate formatted invoice tracking number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortRef = crypto.randomUUID().substring(0, 8).toUpperCase();
    const invoiceNumber = `INV-${todayStr}-${shortRef}`;

    // Create PurchaseInvoice record with initial status UPLOADED
    // STRICT ADHERENCE:
    // Do NOT run OCR yet.
    // Do NOT modify inventory.
    // Do NOT automatically create products.
    const newInvoice: PurchaseInvoiceRecord = {
      id: nextInvoiceId++,
      invoiceNumber,
      originalFilename: path.basename(originalFilename),
      storedFilename: safeStoredFilename,
      filePath: secureFilePath,
      fileSize: fileBuffer.length,
      mimeType: validation.resolvedMime,
      fileHash: validation.sha256,
      status: 'UPLOADED',
      uploadedBy,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    invoicesStore.unshift(newInvoice);

    res.status(201).json({
      success: true,
      message: 'Invoice uploaded and verified successfully. Status: UPLOADED',
      data: newInvoice,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/invoices - List all purchase invoices
  app.get('/api/invoices', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Purchase invoices retrieved successfully',
      data: invoicesStore,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/invoices/:id - Retrieve single invoice
  app.get('/api/invoices/:id([0-9]+)', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      message: 'Invoice retrieved successfully',
      data: invoice,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/invoices/:id/download or /file - Stream stored invoice file
  app.get(['/api/invoices/:id([0-9]+)/download', '/api/invoices/:id([0-9]+)/file'], (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!fs.existsSync(invoice.filePath)) {
      res.status(404).json({
        success: false,
        error: `Invoice physical file not found on disk: ${invoice.storedFilename}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.setHeader('Content-Type', invoice.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.originalFilename}"`);
    fs.createReadStream(invoice.filePath).pipe(res);
  });

  // DELETE /api/invoices/:id - Delete invoice
  app.delete('/api/invoices/:id([0-9]+)', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const index = invoicesStore.findIndex((inv) => inv.id === id);

    if (index === -1) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const removed = invoicesStore.splice(index, 1)[0];
    if (fs.existsSync(removed.filePath)) {
      try {
        fs.unlinkSync(removed.filePath);
      } catch (e) {
        console.warn(`Could not delete file ${removed.filePath}:`, e);
      }
    }

    res.json({
      success: true,
      message: `Invoice ${removed.invoiceNumber} deleted successfully`,
      data: removed,
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // Purchase Invoice OCR Processing API
  // Requirement: Implement ONLY OCR processing for uploaded invoices.
  // Engine: Free/open-source Tesseract OCR (InvoiceOcrService)
  // Extracts: Supplier, Invoice number, Invoice date, Product name, SKU, Barcode, Quantity, Unit price, Total
  // Flags: Low-confidence values (<75% or arithmetic discrepancies) flagged for manual review
  // STRICT RULES:
  // - Store extracted data
  // - Do NOT update inventory
  // - Do NOT automatically confirm invoice
  // ==========================================

  // POST /api/invoices/:id/ocr - Execute Tesseract OCR on uploaded invoice
  app.post('/api/invoices/:id([0-9]+)/ocr', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!fs.existsSync(invoice.filePath)) {
      res.status(404).json({
        success: false,
        error: `Invoice physical file not found on disk: ${invoice.storedFilename}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      invoice.status = 'PROCESSING';
      invoice.updatedAt = new Date().toISOString();

      console.log(`[InvoiceOcrService] Starting Tesseract OCR for Invoice ${invoice.invoiceNumber} (${invoice.originalFilename})...`);

      const ocrResult = await invoiceOcrService.processInvoice(invoice.filePath, {
        originalFilename: invoice.originalFilename,
        mimeType: invoice.mimeType,
      });

      // Store extracted data onto the invoice
      invoice.ocrResult = ocrResult;
      invoice.status = 'PROCESSED';
      invoice.ocrProcessedAt = ocrResult.processedAt;
      invoice.updatedAt = new Date().toISOString();

      console.log(`[InvoiceOcrService] OCR completed for ${invoice.invoiceNumber}. Extracted ${ocrResult.items.length} items. Low confidence flagged: ${ocrResult.hasLowConfidenceValues}`);

      // STRICT RULES CONFIRMATION:
      // Do NOT update inventory
      // Do NOT automatically confirm invoice
      res.json({
        success: true,
        message: 'Tesseract OCR completed successfully. Extracted data stored. Low-confidence values flagged for manual review.',
        data: ocrResult,
        invoice,
        safeguards: {
          inventoryUpdated: false,
          automaticallyConfirmed: false,
          requiresManualReview: ocrResult.manualReviewRequired,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[InvoiceOcrService] OCR failed for ${invoice.invoiceNumber}:`, err);
      invoice.status = 'FAILED';
      invoice.updatedAt = new Date().toISOString();

      res.status(500).json({
        success: false,
        error: `OCR processing failed: ${err?.message || 'Unknown OCR error'}`,
        status: 500,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // GET /api/invoices/:id/ocr - Retrieve OCR extracted data and review flags
  app.get('/api/invoices/:id([0-9]+)/ocr', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!invoice.ocrResult) {
      res.status(404).json({
        success: false,
        error: `OCR has not been executed yet for invoice ${invoice.invoiceNumber}. Current status: ${invoice.status}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      message: 'OCR extracted data retrieved successfully',
      data: invoice.ocrResult,
      invoice,
      timestamp: new Date().toISOString(),
    });
  });

  // PUT /api/invoices/:id/review - Save edited invoice review data
  // Requirement: Allow editing supplier, invoice number, date, product, SKU, barcode, quantity, price, matching product, ignoring item.
  // STRICT SAFEGUARD:
  // Inventory must NOT change until the invoice is explicitly confirmed.
  // This endpoint only persists the review draft.
  app.put('/api/invoices/:id([0-9]+)/review', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!invoice.ocrResult) {
      res.status(400).json({
        success: false,
        error: `Invoice ${invoice.invoiceNumber} has no OCR results to review.`,
        status: 400,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { supplier, invoiceNumber, invoiceDate, total, items, notes } = req.body;

    // Update Header Fields
    if (typeof supplier === 'string' && supplier.trim()) {
      invoice.ocrResult.supplier.value = supplier.trim();
      invoice.ocrResult.supplier.userEdited = true;
      invoice.ocrResult.supplier.flaggedForReview = false;
    }

    if (typeof invoiceNumber === 'string' && invoiceNumber.trim()) {
      invoice.invoiceNumber = invoiceNumber.trim();
      invoice.ocrResult.invoiceNumber.value = invoiceNumber.trim();
      invoice.ocrResult.invoiceNumber.userEdited = true;
      invoice.ocrResult.invoiceNumber.flaggedForReview = false;
    }

    if (typeof invoiceDate === 'string' && invoiceDate.trim()) {
      invoice.ocrResult.invoiceDate.value = invoiceDate.trim();
      invoice.ocrResult.invoiceDate.userEdited = true;
      invoice.ocrResult.invoiceDate.flaggedForReview = false;
    }

    if (typeof notes === 'string') {
      invoice.notes = notes;
    }

    // Update Line Items
    if (Array.isArray(items)) {
      const existingItemsMap = new Map(invoice.ocrResult.items.map((it: any) => [it.id, it]));

      invoice.ocrResult.items = items.map((it: any, index: number) => {
        const existing: any = existingItemsMap.get(it.id) || {};

        const productNameVal = it.productName !== undefined ? String(it.productName).trim() : existing.productName?.value || '';
        const skuVal = it.sku !== undefined ? String(it.sku).trim() : existing.sku?.value || '';
        const barcodeVal = it.barcode !== undefined ? String(it.barcode).trim() : existing.barcode?.value || '';
        const quantityVal = it.quantity !== undefined ? Math.max(0, Number(it.quantity)) : existing.quantity?.value || 1;
        const unitPriceVal = it.unitPrice !== undefined ? Math.max(0, Number(it.unitPrice)) : existing.unitPrice?.value || 0;
        const totalVal = it.total !== undefined ? Number(it.total) : Number((quantityVal * unitPriceVal).toFixed(2));

        const isIgnored = Boolean(it.ignored);
        const matchedPid = it.matchedProductId !== undefined ? (it.matchedProductId ? Number(it.matchedProductId) : null) : existing.matchedProductId ?? null;
        const matchedPName = it.matchedProductName !== undefined ? it.matchedProductName : existing.matchedProductName ?? null;
        const matchedPSku = it.matchedProductSku !== undefined ? it.matchedProductSku : existing.matchedProductSku ?? null;

        return {
          id: it.id || existing.id || `item-${index + 1}`,
          productName: {
            value: productNameVal,
            confidence: existing.productName?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.productName?.originalValue ?? existing.productName?.value,
            userEdited: it.productName !== undefined ? true : existing.productName?.userEdited,
          },
          sku: {
            value: skuVal,
            confidence: existing.sku?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.sku?.originalValue ?? existing.sku?.value,
            userEdited: it.sku !== undefined ? true : existing.sku?.userEdited,
          },
          barcode: {
            value: barcodeVal,
            confidence: existing.barcode?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.barcode?.originalValue ?? existing.barcode?.value,
            userEdited: it.barcode !== undefined ? true : existing.barcode?.userEdited,
          },
          quantity: {
            value: quantityVal,
            confidence: existing.quantity?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.quantity?.originalValue ?? existing.quantity?.value,
            userEdited: it.quantity !== undefined ? true : existing.quantity?.userEdited,
          },
          unitPrice: {
            value: unitPriceVal,
            confidence: existing.unitPrice?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.unitPrice?.originalValue ?? existing.unitPrice?.value,
            userEdited: it.unitPrice !== undefined ? true : existing.unitPrice?.userEdited,
          },
          total: {
            value: totalVal,
            confidence: existing.total?.confidence ?? 100,
            flaggedForReview: false,
            originalValue: existing.total?.originalValue ?? existing.total?.value,
            userEdited: it.total !== undefined ? true : existing.total?.userEdited,
          },
          confidence: existing.confidence ?? 100,
          flaggedForReview: false,
          reviewReasons: [],
          matchedProductId: matchedPid,
          matchedProductName: matchedPName,
          matchedProductSku: matchedPSku,
          ignored: isIgnored,
          userModified: true,
        };
      });

      // Recalculate grand total from non-ignored items
      const sumActive = invoice.ocrResult.items
        .filter((it: any) => !it.ignored)
        .reduce((sum: number, it: any) => sum + it.total.value, 0);

      invoice.ocrResult.total.value = total !== undefined ? Number(total) : Number(sumActive.toFixed(2));
      invoice.ocrResult.total.userEdited = true;
      invoice.ocrResult.total.flaggedForReview = false;
    }

    // Update review summary counters
    const activeItems = invoice.ocrResult.items.filter((it: any) => !it.ignored);
    const flaggedItems = activeItems.filter((it: any) => it.flaggedForReview);
    invoice.ocrResult.hasLowConfidenceValues = flaggedItems.length > 0;
    invoice.ocrResult.manualReviewRequired = flaggedItems.length > 0;
    invoice.ocrResult.flaggedFieldsCount = flaggedItems.length;

    // Strict Safeguards:
    invoice.ocrResult.inventoryUpdated = false;
    invoice.ocrResult.automaticallyConfirmed = false;
    invoice.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Invoice review draft saved successfully. Inventory remains completely untouched.',
      data: invoice,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/invoices/:id/items - Retrieve confirmed purchase invoice line items
  app.get('/api/invoices/:id([0-9]+)/items', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const invoice = invoicesStore.find((inv) => inv.id === id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Purchase invoice not found with ID: ${id}`,
        status: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const items = purchaseInvoiceItemsStore.filter((it) => it.purchaseInvoiceId === id);

    res.json({
      success: true,
      message: `Retrieved ${items.length} confirmed invoice items for invoice #${invoice.invoiceNumber}`,
      data: items,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/invoices/:id/confirm - Explicitly confirm invoice with atomic database transaction
  // Implements the 10-step confirmation sequence:
  // 1. Validate invoice.
  // 2. Validate invoice items.
  // 3. Match each item to a product.
  // 4. Require user confirmation for uncertain matches.
  // 5. Create purchase invoice.
  // 6. Create invoice items.
  // 7. Increase inventory.
  // 8. Create PURCHASE inventory transactions.
  // 9. Recalculate stock status.
  // 10. Trigger notification logic.
  //
  // Use a database transaction.
  // If any operation fails, roll back the entire operation.
  // Never silently create duplicate products.
  app.post('/api/invoices/:id([0-9]+)/confirm', (req: Request, res: Response) => {
    const id = Number(req.params.id);

    // =========================================================================
    // DATABASE TRANSACTION SNAPSHOT (Atomic rollback safeguard)
    // =========================================================================
    const transactionSnapshot = {
      productsStore: JSON.parse(JSON.stringify(productsStore)),
      inventoryEntries: JSON.parse(JSON.stringify(Array.from(inventoryStore.entries()))),
      inventoryTransactionsStore: JSON.parse(JSON.stringify(inventoryTransactionsStore)),
      invoicesStore: JSON.parse(JSON.stringify(invoicesStore)),
      purchaseInvoiceItemsStore: JSON.parse(JSON.stringify(purchaseInvoiceItemsStore)),
      notificationsStore: JSON.parse(JSON.stringify(notificationsStore)),
      nextProductId,
      nextInvId,
      nextTxId,
      nextNotificationId,
      nextPurchaseInvoiceItemId,
    };

    const rollbackTransaction = (
      reason: string,
      failedStepNumber: number,
      failedStepName: string,
      httpStatus: number = 422,
      extraDetails?: any
    ) => {
      console.warn(
        `[DB TRANSACTION ROLLBACK] Confirmation aborted at Step ${failedStepNumber} (${failedStepName}): ${reason}`
      );

      // Revert all stores to pristine pre-transaction state
      productsStore.length = 0;
      productsStore.push(...transactionSnapshot.productsStore);

      inventoryStore.clear();
      transactionSnapshot.inventoryEntries.forEach(([k, v]: [number, any]) => inventoryStore.set(k, v));

      inventoryTransactionsStore.length = 0;
      inventoryTransactionsStore.push(...transactionSnapshot.inventoryTransactionsStore);

      invoicesStore.length = 0;
      invoicesStore.push(...transactionSnapshot.invoicesStore);

      purchaseInvoiceItemsStore.length = 0;
      purchaseInvoiceItemsStore.push(...transactionSnapshot.purchaseInvoiceItemsStore);

      notificationsStore.length = 0;
      notificationsStore.push(...transactionSnapshot.notificationsStore);

      nextProductId = transactionSnapshot.nextProductId;
      nextInvId = transactionSnapshot.nextInvId;
      nextTxId = transactionSnapshot.nextTxId;
      nextNotificationId = transactionSnapshot.nextNotificationId;
      nextPurchaseInvoiceItemId = transactionSnapshot.nextPurchaseInvoiceItemId;

      res.status(httpStatus).json({
        success: false,
        error: reason,
        transactionStatus: 'ROLLED_BACK',
        failedStep: {
          stepNumber: failedStepNumber,
          stepName: failedStepName,
        },
        details: extraDetails || null,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    };

    try {
      // -----------------------------------------------------------------------
      // STEP 1: VALIDATE INVOICE
      // -----------------------------------------------------------------------
      const invoice = invoicesStore.find((inv) => inv.id === id);
      if (!invoice) {
        return rollbackTransaction(`Purchase invoice not found with ID: ${id}`, 1, 'Validate invoice', 404);
      }

      if (invoice.status === 'CONFIRMED') {
        return rollbackTransaction(
          `Invoice ${invoice.invoiceNumber} has already been confirmed on ${invoice.confirmedAt}. Duplicate confirmation is forbidden.`,
          1,
          'Validate invoice',
          400
        );
      }

      if (!invoice.ocrResult || !Array.isArray(invoice.ocrResult.items)) {
        return rollbackTransaction(
          `Invoice ${invoice.invoiceNumber} does not contain OCR extracted review data to confirm.`,
          1,
          'Validate invoice',
          400
        );
      }

      const supplierName = invoice.ocrResult.supplier?.value?.trim();
      if (!supplierName) {
        return rollbackTransaction('Invoice supplier name cannot be empty.', 1, 'Validate invoice', 422);
      }

      const invNumber = (invoice.invoiceNumber || invoice.ocrResult.invoiceNumber?.value)?.trim();
      if (!invNumber) {
        return rollbackTransaction('Invoice tracking number cannot be empty.', 1, 'Validate invoice', 422);
      }

      const invoiceDate = invoice.ocrResult.invoiceDate?.value?.trim();
      if (!invoiceDate) {
        return rollbackTransaction('Invoice date is required and cannot be empty.', 1, 'Validate invoice', 422);
      }

      // Check duplicate invoice number among other already confirmed invoices
      const isDuplicateConfirmedNum = invoicesStore.some(
        (inv) => inv.id !== invoice.id && inv.status === 'CONFIRMED' && inv.invoiceNumber.toLowerCase() === invNumber.toLowerCase()
      );
      if (isDuplicateConfirmedNum) {
        return rollbackTransaction(
          `A purchase invoice with number '${invNumber}' is already confirmed in the ledger. Duplicate invoice numbers are forbidden.`,
          1,
          'Validate invoice',
          409
        );
      }

      // Optional failure simulation parameter to verify transactional rollback
      if (req.body?.simulateFailure === true) {
        throw new Error('Simulated database deadlock/failure triggered by client. Verifying transaction rollback.');
      }

      // -----------------------------------------------------------------------
      // STEP 2: VALIDATE INVOICE ITEMS
      // -----------------------------------------------------------------------
      const allItems = invoice.ocrResult.items;
      const activeItems = allItems.filter((it: any) => !it.ignored);

      if (activeItems.length === 0) {
        return rollbackTransaction(
          'Invoice confirmation rejected: Invoice contains 0 active items. At least one line item must not be ignored.',
          2,
          'Validate invoice items',
          422
        );
      }

      for (let i = 0; i < activeItems.length; i++) {
        const item = activeItems[i];
        const pName = item.productName?.value?.trim();
        if (!pName) {
          return rollbackTransaction(
            `Line item #${i + 1} (${item.id}) is missing a valid product name.`,
            2,
            'Validate invoice items',
            422
          );
        }

        const qty = Number(item.quantity?.value);
        if (isNaN(qty) || qty <= 0) {
          return rollbackTransaction(
            `Line item '${pName}' has invalid quantity '${item.quantity?.value}'. Quantity must be a positive number greater than 0.`,
            2,
            'Validate invoice items',
            422
          );
        }

        const price = Number(item.unitPrice?.value);
        if (isNaN(price) || price < 0) {
          return rollbackTransaction(
            `Line item '${pName}' has invalid unit price '${item.unitPrice?.value}'. Unit price must be non-negative.`,
            2,
            'Validate invoice items',
            422
          );
        }
      }

      // -----------------------------------------------------------------------
      // STEP 3: MATCH EACH ITEM TO A PRODUCT
      // -----------------------------------------------------------------------
      interface ItemMatchOutcome {
        item: any;
        matchedProduct: ProductRecord | null;
        matchedBy: 'EXPLICIT_USER_SELECTION' | 'BARCODE' | 'SKU' | 'NAME' | 'NEW_PRODUCT_CREATED';
        isCertain: boolean;
        certaintyScore: number;
        reason?: string;
      }

      const matchOutcomes: ItemMatchOutcome[] = [];

      for (const item of activeItems) {
        let matchedProduct: ProductRecord | null = null;
        let matchedBy: ItemMatchOutcome['matchedBy'] = 'NEW_PRODUCT_CREATED';
        let isCertain = true;
        let certaintyScore = 100;
        let reason = 'High confidence exact match';

        // 3a. Explicit user selection
        if (item.matchedProductId) {
          const found = productsStore.find((p) => p.id === Number(item.matchedProductId));
          if (found) {
            matchedProduct = found;
            matchedBy = 'EXPLICIT_USER_SELECTION';
            isCertain = true;
            certaintyScore = 100;
            reason = 'Explicitly matched by user';
          } else {
            return rollbackTransaction(
              `Matched product ID ${item.matchedProductId} specified for '${item.productName.value}' does not exist in catalog.`,
              3,
              'Match each item to a product',
              422
            );
          }
        }

        // 3b. Match by Barcode
        if (!matchedProduct && item.barcode?.value && item.barcode.value !== 'Not detected' && item.barcode.value !== 'Missing / Illegible') {
          const found = productsStore.find((p) => p.barcode === item.barcode.value.trim());
          if (found) {
            matchedProduct = found;
            matchedBy = 'BARCODE';
            const barcodeConfidence = item.barcode?.confidence ?? 100;
            if (barcodeConfidence < 75) {
              isCertain = false;
              certaintyScore = barcodeConfidence;
              reason = `Low OCR confidence (${barcodeConfidence}%) on barcode`;
            } else {
              isCertain = true;
              certaintyScore = barcodeConfidence;
            }
          }
        }

        // 3c. Match by SKU
        if (!matchedProduct && item.sku?.value && item.sku.value !== 'Missing' && item.sku.value !== 'SKU-UNRESOLVED') {
          const found = productsStore.find((p) => p.sku.toLowerCase() === item.sku.value.trim().toLowerCase());
          if (found) {
            matchedProduct = found;
            matchedBy = 'SKU';
            const skuConfidence = item.sku?.confidence ?? 100;
            if (skuConfidence < 75) {
              isCertain = false;
              certaintyScore = skuConfidence;
              reason = `Low OCR confidence (${skuConfidence}%) on SKU`;
            } else {
              isCertain = true;
              certaintyScore = skuConfidence;
            }
          }
        }

        // 3d. Match by Product Name
        if (!matchedProduct && item.productName?.value) {
          const cleanName = item.productName.value.toLowerCase().trim();
          // Exact name match
          const foundExact = productsStore.find((p) => p.name.toLowerCase().trim() === cleanName);
          if (foundExact) {
            matchedProduct = foundExact;
            matchedBy = 'NAME';
            const nameConfidence = item.productName?.confidence ?? 100;
            if (nameConfidence < 75) {
              isCertain = false;
              certaintyScore = nameConfidence;
              reason = `Low OCR confidence (${nameConfidence}%) on product name`;
            } else {
              isCertain = true;
              certaintyScore = nameConfidence;
            }
          } else {
            // Fuzzy / partial name match
            const foundFuzzy = productsStore.find(
              (p) =>
                p.name.toLowerCase().includes(cleanName) ||
                cleanName.includes(p.name.toLowerCase()) ||
                (cleanName.length > 5 && p.name.toLowerCase().slice(0, 5) === cleanName.slice(0, 5))
            );
            if (foundFuzzy) {
              matchedProduct = foundFuzzy;
              matchedBy = 'NAME';
              isCertain = false; // Fuzzy name matching is uncertain!
              certaintyScore = 65;
              reason = `Fuzzy name resemblance to catalog product '${foundFuzzy.name}'`;
            }
          }
        }

        // 3e. Product not found in catalog: Candidate for creating new product
        if (!matchedProduct) {
          // RULE: Never silently create duplicate products!
          // Inspect if an existing product already shares this barcode or SKU
          const candidateBarcode =
            item.barcode?.value && item.barcode.value !== 'Not detected' && item.barcode.value !== 'Missing / Illegible'
              ? item.barcode.value.trim()
              : null;
          const candidateSku =
            item.sku?.value && item.sku.value !== 'Missing' && item.sku.value !== 'SKU-UNRESOLVED'
              ? item.sku.value.trim()
              : null;

          if (candidateBarcode) {
            const conflictBarcode = productsStore.find((p) => p.barcode === candidateBarcode);
            if (conflictBarcode) {
              return rollbackTransaction(
                `Duplicate conflict: Product '${item.productName.value}' has barcode '${candidateBarcode}' which already belongs to '${conflictBarcode.name}' (SKU: ${conflictBarcode.sku}). Never silently create duplicate products.`,
                3,
                'Match each item to a product',
                409,
                { conflictingProduct: conflictBarcode }
              );
            }
          }

          if (candidateSku) {
            const conflictSku = productsStore.find((p) => p.sku.toLowerCase() === candidateSku.toLowerCase());
            if (conflictSku) {
              return rollbackTransaction(
                `Duplicate conflict: Product '${item.productName.value}' has SKU '${candidateSku}' which already belongs to '${conflictSku.name}'. Never silently create duplicate products.`,
                3,
                'Match each item to a product',
                409,
                { conflictingProduct: conflictSku }
              );
            }
          }

          matchedProduct = null;
          matchedBy = 'NEW_PRODUCT_CREATED';
          isCertain = false; // Unmatched items require explicit user approval
          certaintyScore = 50;
          reason = 'Unmatched item: Will be cataloged as a brand new product';
        }

        // Low OCR overall confidence also makes match uncertain
        if (item.confidence < 75 || item.flaggedForReview) {
          isCertain = false;
          if (certaintyScore > item.confidence) certaintyScore = item.confidence;
        }

        matchOutcomes.push({
          item,
          matchedProduct,
          matchedBy,
          isCertain,
          certaintyScore,
          reason,
        });
      }

      // -----------------------------------------------------------------------
      // STEP 4: REQUIRE USER CONFIRMATION FOR UNCERTAIN MATCHES
      // -----------------------------------------------------------------------
      const uncertainMatches = matchOutcomes.filter((m) => !m.isCertain);

      if (uncertainMatches.length > 0) {
        const userExplicitlyConfirmed =
          req.body?.confirmedUncertainMatches === true ||
          uncertainMatches.every((u) => Boolean(u.item.uncertainMatchConfirmed));

        if (!userExplicitlyConfirmed) {
          return rollbackTransaction(
            `Confirmation blocked: Invoice contains ${uncertainMatches.length} uncertain product match(es) or new product candidate(s) that require explicit user verification.`,
            4,
            'Require user confirmation for uncertain matches',
            422,
            {
              uncertainMatchesCount: uncertainMatches.length,
              uncertainItems: uncertainMatches.map((u) => ({
                itemId: u.item.id,
                productName: u.item.productName?.value,
                sku: u.item.sku?.value,
                barcode: u.item.barcode?.value,
                matchedProductId: u.matchedProduct?.id ?? null,
                matchedProductName: u.matchedProduct?.name ?? null,
                matchedBy: u.matchedBy,
                confidence: u.certaintyScore,
                reason: u.reason,
              })),
            }
          );
        }
      }

      // -----------------------------------------------------------------------
      // STEP 5: CREATE PURCHASE INVOICE
      // -----------------------------------------------------------------------
      const confirmedTimestamp = new Date().toISOString();
      const confirmedBy = req.body?.confirmedBy || invoice.uploadedBy || 'Store Admin';

      invoice.status = 'CONFIRMED';
      invoice.confirmedAt = confirmedTimestamp;
      invoice.updatedAt = confirmedTimestamp;
      invoice.ocrResult.inventoryUpdated = true;
      invoice.ocrResult.automaticallyConfirmed = false;
      invoice.ocrResult.confirmedAt = confirmedTimestamp;
      invoice.ocrResult.confirmedBy = confirmedBy;

      // Grand total calculated from active confirmed items
      const grandTotal = activeItems.reduce(
        (sum: number, it: any) => sum + (Number(it.quantity?.value) || 0) * (Number(it.unitPrice?.value) || 0),
        0
      );
      invoice.ocrResult.total.value = Number(grandTotal.toFixed(2));

      // -----------------------------------------------------------------------
      // STEP 6: CREATE INVOICE ITEMS
      // -----------------------------------------------------------------------
      const createdInvoiceItems: PurchaseInvoiceItemRecord[] = [];
      const inventoryUpdates: Array<{
        productId: number;
        productName: string;
        productSku: string;
        addedQuantity: number;
        newQuantity: number;
        transactionId: number;
        stockStatus: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
      }> = [];
      const triggeredNotifications: any[] = [];

      for (const outcome of matchOutcomes) {
        let targetProduct = outcome.matchedProduct;
        const item = outcome.item;
        const qtyToAdd = Number(item.quantity?.value);
        const unitPrice = Number(item.unitPrice?.value) || 0;

        // If new product needed, create it now (confirmed by user)
        if (!targetProduct) {
          const generatedSku =
            item.sku?.value && item.sku.value !== 'Missing' && item.sku.value !== 'SKU-UNRESOLVED'
              ? item.sku.value.trim()
              : `SKU-INV-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`;

          const barcodeVal =
            item.barcode?.value && item.barcode.value !== 'Not detected' && item.barcode.value !== 'Missing / Illegible'
              ? item.barcode.value.trim()
              : null;

          // Double check unique SKU and barcode before insert
          if (productsStore.some((p) => p.sku.toLowerCase() === generatedSku.toLowerCase())) {
            return rollbackTransaction(
              `Unique constraint violated: Cannot create product with duplicate SKU '${generatedSku}'.`,
              6,
              'Create invoice items',
              409
            );
          }
          if (barcodeVal && productsStore.some((p) => p.barcode === barcodeVal)) {
            return rollbackTransaction(
              `Unique constraint violated: Cannot create product with duplicate barcode '${barcodeVal}'.`,
              6,
              'Create invoice items',
              409
            );
          }

          targetProduct = {
            id: nextProductId++,
            name: item.productName?.value || 'Unnamed Product',
            sku: generatedSku,
            barcode: barcodeVal,
            description: `Auto-cataloged from confirmed invoice ${invoice.invoiceNumber}`,
            categoryId: null,
            categoryName: 'General Produce / Goods',
            supplierId: null,
            supplierName: supplierName,
            purchasePrice: unitPrice,
            sellingPrice: Number((unitPrice * 1.35).toFixed(2)),
            taxRate: 0.0,
            unit: 'PCS',
            minimumInventoryThreshold: 10,
            active: true,
            createdAt: confirmedTimestamp,
            updatedAt: confirmedTimestamp,
          };

          productsStore.push(targetProduct);
        }

        // Link matched product back to OCR item
        item.matchedProductId = targetProduct.id;
        item.matchedProductName = targetProduct.name;
        item.matchedProductSku = targetProduct.sku;

        // Create formal PurchaseInvoiceItemRecord
        const invoiceItemRecord: PurchaseInvoiceItemRecord = {
          id: nextPurchaseInvoiceItemId++,
          purchaseInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          productId: targetProduct.id,
          productName: targetProduct.name,
          sku: targetProduct.sku,
          barcode: targetProduct.barcode,
          quantity: qtyToAdd,
          unitPrice: unitPrice,
          totalPrice: Number((qtyToAdd * unitPrice).toFixed(2)),
          matchedBy: outcome.matchedBy,
          createdAt: confirmedTimestamp,
        };
        purchaseInvoiceItemsStore.push(invoiceItemRecord);
        createdInvoiceItems.push(invoiceItemRecord);

        // ---------------------------------------------------------------------
        // STEP 7: INCREASE INVENTORY
        // ---------------------------------------------------------------------
        const invRecord = getOrCreateInventory(targetProduct);
        const prevQty = invRecord.currentQuantity;
        const prevStatus = invRecord.stockStatus;
        const newQty = Number((prevQty + qtyToAdd).toFixed(3));

        invRecord.currentQuantity = newQty;
        invRecord.lastUpdated = confirmedTimestamp;

        // ---------------------------------------------------------------------
        // STEP 8: CREATE PURCHASE INVENTORY TRANSACTIONS
        // ---------------------------------------------------------------------
        const txId = nextTxId++;
        const tx: InventoryTransactionRecord = {
          id: txId,
          productId: targetProduct.id,
          productName: targetProduct.name,
          productSku: targetProduct.sku,
          transactionType: 'PURCHASE',
          quantity: qtyToAdd,
          previousQuantity: prevQty,
          newQuantity: newQty,
          reason: `Purchase Invoice Confirmed: ${invoice.invoiceNumber}`,
          referenceId: invoice.invoiceNumber,
          createdAt: confirmedTimestamp,
        };
        inventoryTransactionsStore.push(tx);

        // ---------------------------------------------------------------------
        // STEP 9: RECALCULATE STOCK STATUS
        // ---------------------------------------------------------------------
        const newStatus = calculateInventoryStatus(newQty, targetProduct.minimumInventoryThreshold ?? 0);
        invRecord.stockStatus = newStatus;

        inventoryUpdates.push({
          productId: targetProduct.id,
          productName: targetProduct.name,
          productSku: targetProduct.sku,
          addedQuantity: qtyToAdd,
          newQuantity: newQty,
          transactionId: txId,
          stockStatus: newStatus,
        });

        // ---------------------------------------------------------------------
        // STEP 10: TRIGGER NOTIFICATION LOGIC
        // ---------------------------------------------------------------------
        if ((prevStatus === 'OUT OF STOCK' || prevStatus === 'LOW STOCK') && newStatus === 'IN STOCK') {
          const restockNotification: NotificationRecord = {
            id: nextNotificationId++,
            type: 'RESTOCK',
            message: `Product '${targetProduct.name}' (SKU: ${targetProduct.sku}) was successfully restocked (+${qtyToAdd} ${targetProduct.unit}) from Purchase Invoice ${invoice.invoiceNumber}. Current quantity: ${newQty} ${targetProduct.unit} (IN STOCK).`,
            severity: 'INFO',
            productId: targetProduct.id,
            productName: targetProduct.name,
            productSku: targetProduct.sku,
            product: {
              id: targetProduct.id,
              name: targetProduct.name,
              sku: targetProduct.sku,
              unit: targetProduct.unit,
            },
            read: false,
            createdAt: confirmedTimestamp,
          };
          notificationsStore.unshift(restockNotification);
          triggeredNotifications.push(restockNotification);
        } else {
          // If still low stock or out of stock, trigger appropriate threshold alert
          checkAndTriggerStockNotification(targetProduct, newQty);
        }
      }

      console.log(
        `[DB Transaction COMMITTED] Invoice ${invoice.invoiceNumber} confirmed successfully. Created ${createdInvoiceItems.length} invoice items, updated ${inventoryUpdates.length} product stocks, recorded ${inventoryUpdates.length} PURCHASE transactions.`
      );

      res.json({
        success: true,
        message: `Purchase invoice ${invoice.invoiceNumber} confirmed successfully via database transaction! All 10 verification and inventory steps executed.`,
        invoice,
        createdInvoiceItems,
        inventoryUpdates,
        skippedItemsCount: allItems.length - activeItems.length,
        notificationsTriggered: triggeredNotifications,
        transactionStatus: 'COMMITTED',
        timestamp: confirmedTimestamp,
      });
    } catch (err: any) {
      return rollbackTransaction(
        `Unexpected failure during confirmation: ${err.message || 'Internal error'}. Transaction rolled back cleanly.`,
        99,
        'Database Transaction Safe Guard',
        500
      );
    }
  });


  // OpenAPI schema definition endpoint
  app.get('/api/v1/docs/openapi.json', (req: Request, res: Response) => {
    res.json({
      openapi: '3.0.1',
      info: {
        title: 'FreshCart Grocery Store POS API',
        description: 'REST API for Grocery Store POS System architecture',
        version: '1.0.0',
      },
      paths: {
        '/api/v1/health': {
          get: {
            tags: ['Health Check API'],
            summary: 'Get System Health Status',
            description: 'Returns system uptime, database connection state, and architecture module readiness.',
            responses: {
              '200': {
                description: 'OK',
              },
            },
          },
        },
        '/api/v1/health/ping': {
          get: {
            tags: ['Health Check API'],
            summary: 'Ping heartbeat',
            responses: {
              '200': {
                description: 'OK',
              },
            },
          },
        },
      },
    });
  });

  // Setup Vite middlewares for development or static serving for production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FreshCart POS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
