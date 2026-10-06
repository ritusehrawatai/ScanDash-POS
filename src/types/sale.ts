export interface SaleItemDto {
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

export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export interface SaleDto {
  id: number;
  receiptNumber: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: SaleStatus;
  itemCount: number;
  items: SaleItemDto[];
  createdAt: string;
}

export interface CreateSaleItemPayload {
  productId: number;
  quantity: number;
}

export interface CreateSalePayload {
  items: CreateSaleItemPayload[];
}
