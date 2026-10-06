import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const startTime = Date.now();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

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
          'invoice-ocr-tesseract': 'PLANNED (Phase 3)',
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
    type: 'LOW_STOCK' | 'OUT_OF_STOCK';
    message: string;
    severity: 'WARNING' | 'CRITICAL';
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
