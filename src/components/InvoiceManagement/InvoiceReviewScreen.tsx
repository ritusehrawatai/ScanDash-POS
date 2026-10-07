import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  Edit3,
  Save,
  Download,
  RefreshCw,
  Search,
  Link2,
  Unlink,
  Plus,
  Info,
  Lock,
  FileText,
  FileImage,
  Sparkles,
  Boxes,
  FileCheck,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  PurchaseInvoice,
  ExtractedInvoiceItem,
  InvoiceReviewPayload,
  InvoiceReviewItemUpdate,
  InvoiceConfirmResponse,
} from '../../types/invoice';
import { Product } from '../../types/product';
import {
  saveInvoiceReview,
  confirmInvoice,
  getInvoiceDownloadUrl,
  InvoiceApiError,
} from '../../api/invoiceApi';
import { fetchProducts } from '../../api/productApi';

interface InvoiceReviewScreenProps {
  invoice: PurchaseInvoice;
  onBack: () => void;
  onInvoiceUpdated: (updatedInvoice: PurchaseInvoice) => void;
}

interface EditableHeader {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  notes: string;
}

interface EditableItemState {
  id: string;
  productName: string;
  sku: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number;
  flaggedForReview: boolean;
  reviewReasons: string[];
  matchedProductId: number | null;
  matchedProductName: string | null;
  matchedProductSku: string | null;
  ignored: boolean;
  userModified: boolean;
  // Field-specific confidence & uncertainty info from OCR
  productNameConfidence: number;
  productNameFlagged: boolean;
  productNameReason?: string;
  skuConfidence: number;
  skuFlagged: boolean;
  skuReason?: string;
  barcodeConfidence: number;
  barcodeFlagged: boolean;
  barcodeReason?: string;
  quantityConfidence: number;
  quantityFlagged: boolean;
  unitPriceConfidence: number;
  unitPriceFlagged: boolean;
  totalConfidence: number;
  totalFlagged: boolean;
  totalReason?: string;
}

export const InvoiceReviewScreen: React.FC<InvoiceReviewScreenProps> = ({
  invoice,
  onBack,
  onInvoiceUpdated,
}) => {
  // Available catalog products for matching
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);

  // Editable Header State
  const [headerState, setHeaderState] = useState<EditableHeader>({
    supplier: invoice.ocrResult?.supplier.value || '',
    invoiceNumber: invoice.ocrResult?.invoiceNumber.value || invoice.invoiceNumber,
    invoiceDate: invoice.ocrResult?.invoiceDate.value || '',
    notes: invoice.notes || '',
  });

  // Editable Line Items State
  const [items, setItems] = useState<EditableItemState[]>(() => {
    if (!invoice.ocrResult?.items) return [];
    return invoice.ocrResult.items.map((it: ExtractedInvoiceItem, idx: number) => ({
      id: it.id || `item-${idx + 1}`,
      productName: it.productName.value,
      sku: it.sku.value,
      barcode: it.barcode.value,
      quantity: Number(it.quantity.value) || 1,
      unitPrice: Number(it.unitPrice.value) || 0,
      total: Number(it.total.value) || 0,
      confidence: it.confidence,
      flaggedForReview: it.flaggedForReview,
      reviewReasons: it.reviewReasons || [],
      matchedProductId: it.matchedProductId ?? null,
      matchedProductName: it.matchedProductName ?? null,
      matchedProductSku: it.matchedProductSku ?? null,
      ignored: Boolean(it.ignored),
      userModified: Boolean(it.userModified),
      productNameConfidence: it.productName.confidence,
      productNameFlagged: it.productName.flaggedForReview,
      productNameReason: it.productName.reason,
      skuConfidence: it.sku.confidence,
      skuFlagged: it.sku.flaggedForReview,
      skuReason: it.sku.reason,
      barcodeConfidence: it.barcode.confidence,
      barcodeFlagged: it.barcode.flaggedForReview,
      barcodeReason: it.barcode.reason,
      quantityConfidence: it.quantity.confidence,
      quantityFlagged: it.quantity.flaggedForReview,
      unitPriceConfidence: it.unitPrice.confidence,
      unitPriceFlagged: it.unitPrice.flaggedForReview,
      totalConfidence: it.total.confidence,
      totalFlagged: it.total.flaggedForReview,
      totalReason: it.total.reason,
    }));
  });

  // Filters and search
  const [itemFilter, setItemFilter] = useState<'ALL' | 'UNCERTAIN' | 'ACTIVE' | 'IGNORED' | 'UNMATCHED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // UI state
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Product Matching Modal State
  const [matchingModalItem, setMatchingModalItem] = useState<EditableItemState | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmUncertainMatchesChecked, setConfirmUncertainMatchesChecked] = useState<boolean>(false);
  const [simulateRollbackFailure, setSimulateRollbackFailure] = useState<boolean>(false);
  const [verifiedItemIds, setVerifiedItemIds] = useState<Set<string>>(new Set());
  const [activeStepTab, setActiveStepTab] = useState<'OVERVIEW' | 'STEPS' | 'UNCERTAIN'>('OVERVIEW');
  const [confirmationResult, setConfirmationResult] = useState<InvoiceConfirmResponse | null>(null);

  // Original Document Viewer panel toggle
  const [showDocPreview, setShowDocPreview] = useState<boolean>(false);

  // Load catalog products for auto-matching and manual match selection
  useEffect(() => {
    let mounted = true;
    const loadCatalog = async () => {
      try {
        setLoadingProducts(true);
        const prods = await fetchProducts();
        if (mounted) {
          setCatalogProducts(prods);
        }
      } catch (err) {
        console.warn('Could not load products for matching:', err);
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    };
    loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-match suggestions on initial load if item has no match
  useEffect(() => {
    if (catalogProducts.length === 0) return;
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.matchedProductId) return item;

        // Try match by Barcode
        if (item.barcode && item.barcode !== 'Not detected' && item.barcode !== 'Missing / Illegible') {
          const matchedByBarcode = catalogProducts.find((p) => p.barcode === item.barcode);
          if (matchedByBarcode) {
            return {
              ...item,
              matchedProductId: matchedByBarcode.id,
              matchedProductName: matchedByBarcode.name,
              matchedProductSku: matchedByBarcode.sku,
            };
          }
        }

        // Try match by SKU
        if (item.sku && item.sku !== 'Missing' && item.sku !== 'SKU-UNRESOLVED') {
          const matchedBySku = catalogProducts.find(
            (p) => p.sku.toLowerCase() === item.sku.toLowerCase()
          );
          if (matchedBySku) {
            return {
              ...item,
              matchedProductId: matchedBySku.id,
              matchedProductName: matchedBySku.name,
              matchedProductSku: matchedBySku.sku,
            };
          }
        }

        // Try match by Name (exact or close)
        if (item.productName) {
          const cleanItemName = item.productName.toLowerCase().trim();
          const matchedByName = catalogProducts.find(
            (p) => p.name.toLowerCase().trim() === cleanItemName
          );
          if (matchedByName) {
            return {
              ...item,
              matchedProductId: matchedByName.id,
              matchedProductName: matchedByName.name,
              matchedProductSku: matchedByName.sku,
            };
          }
        }

        return item;
      })
    );
  }, [catalogProducts]);

  const showAlert = (type: 'success' | 'error' | 'info', text: string) => {
    setAlert({ type, text });
    setTimeout(() => {
      setAlert((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  // Header change handlers
  const handleHeaderChange = (field: keyof EditableHeader, value: string) => {
    setHeaderState((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  // Item change handlers
  const handleItemFieldChange = (
    itemId: string,
    field: 'productName' | 'sku' | 'barcode' | 'quantity' | 'unitPrice',
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        const updated = { ...it, userModified: true };

        if (field === 'quantity') {
          const q = Math.max(0, Number(value) || 0);
          updated.quantity = q;
          updated.total = Number((q * updated.unitPrice).toFixed(2));
          updated.quantityFlagged = false;
        } else if (field === 'unitPrice') {
          const p = Math.max(0, Number(value) || 0);
          updated.unitPrice = p;
          updated.total = Number((updated.quantity * p).toFixed(2));
          updated.unitPriceFlagged = false;
        } else if (field === 'productName') {
          updated.productName = String(value);
          updated.productNameFlagged = false;
        } else if (field === 'sku') {
          updated.sku = String(value);
          updated.skuFlagged = false;
        } else if (field === 'barcode') {
          updated.barcode = String(value);
          updated.barcodeFlagged = false;
        }

        // Update overall item review flag if all specific flags cleared
        if (
          !updated.productNameFlagged &&
          !updated.skuFlagged &&
          !updated.barcodeFlagged &&
          !updated.quantityFlagged &&
          !updated.unitPriceFlagged
        ) {
          updated.flaggedForReview = false;
        }

        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Ignore / Exclude item toggle
  const handleToggleIgnore = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const newIgnored = !it.ignored;
        return {
          ...it,
          ignored: newIgnored,
          userModified: true,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Reset item field to OCR original value
  const handleResetToOcr = (itemId: string) => {
    const originalItem = invoice.ocrResult?.items.find((x) => x.id === itemId);
    if (!originalItem) return;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          productName: originalItem.productName.value,
          sku: originalItem.sku.value,
          barcode: originalItem.barcode.value,
          quantity: Number(originalItem.quantity.value) || 1,
          unitPrice: Number(originalItem.unitPrice.value) || 0,
          total: Number(originalItem.total.value) || 0,
          confidence: originalItem.confidence,
          flaggedForReview: originalItem.flaggedForReview,
          reviewReasons: originalItem.reviewReasons || [],
          userModified: false,
          ignored: false,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Mark an item as manually verified / resolved
  const handleMarkVerified = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          flaggedForReview: false,
          productNameFlagged: false,
          skuFlagged: false,
          barcodeFlagged: false,
          quantityFlagged: false,
          unitPriceFlagged: false,
          totalFlagged: false,
          reviewReasons: [],
          userModified: true,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Product Matching Handlers
  const handleOpenMatchingModal = (item: EditableItemState) => {
    setMatchingModalItem(item);
    setProductSearchQuery(item.sku || item.productName || '');
  };

  const handleSelectMatchedProduct = (product: Product) => {
    if (!matchingModalItem) return;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== matchingModalItem.id) return it;
        return {
          ...it,
          matchedProductId: product.id,
          matchedProductName: product.name,
          matchedProductSku: product.sku,
          // If item's SKU or barcode was missing or uncertain, enrich from matched product
          sku: it.sku && it.sku !== 'Missing' && it.sku !== 'SKU-UNRESOLVED' ? it.sku : product.sku,
          barcode:
            it.barcode && it.barcode !== 'Not detected' && it.barcode !== 'Missing / Illegible'
              ? it.barcode
              : product.barcode || it.barcode,
          userModified: true,
        };
      })
    );
    setMatchingModalItem(null);
    setHasUnsavedChanges(true);
  };

  const handleClearMatch = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          matchedProductId: null,
          matchedProductName: null,
          matchedProductSku: null,
          userModified: true,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Calculations
  const activeItems = useMemo(() => items.filter((it) => !it.ignored), [items]);
  const activeSum = useMemo(
    () => activeItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0),
    [activeItems]
  );
  const ocrHeaderTotal = Number(invoice.ocrResult?.total.value) || 0;
  const totalDifference = Number((activeSum - ocrHeaderTotal).toFixed(2));

  // Count of uncertain values across items
  const uncertainItemsCount = useMemo(
    () => items.filter((it) => !it.ignored && (it.flaggedForReview || it.confidence < 75)).length,
    [items]
  );

  const ignoredItemsCount = useMemo(() => items.filter((it) => it.ignored).length, [items]);
  const unmatchedItemsCount = useMemo(
    () => items.filter((it) => !it.ignored && !it.matchedProductId).length,
    [items]
  );

  // Active items requiring explicit verification for Step 4 of confirmation:
  // - Items with low OCR confidence (< 75%)
  // - Items flagged for review
  // - Unmatched items (new product candidates)
  // - Items with field-level uncertainty flags
  const uncertainActiveItems = useMemo(() => {
    return items.filter((it) => {
      if (it.ignored) return false;
      if (it.flaggedForReview) return true;
      if (it.confidence < 75) return true;
      if (!it.matchedProductId) return true;
      if (it.productNameFlagged || it.skuFlagged || it.barcodeFlagged) return true;
      return false;
    });
  }, [items]);

  // Filtered line items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // Filter tab
      if (itemFilter === 'UNCERTAIN' && (it.ignored || (!it.flaggedForReview && it.confidence >= 75))) {
        return false;
      }
      if (itemFilter === 'ACTIVE' && it.ignored) return false;
      if (itemFilter === 'IGNORED' && !it.ignored) return false;
      if (itemFilter === 'UNMATCHED' && (it.ignored || Boolean(it.matchedProductId))) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = it.productName.toLowerCase().includes(q);
        const matchesSku = it.sku.toLowerCase().includes(q);
        const matchesBarcode = it.barcode.toLowerCase().includes(q);
        const matchesMatched = it.matchedProductName?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode && !matchesMatched) return false;
      }

      return true;
    });
  }, [items, itemFilter, searchQuery]);

  // Save Draft (STRICT NON-MUTATION OF INVENTORY)
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const payload: InvoiceReviewPayload = {
        supplier: headerState.supplier,
        invoiceNumber: headerState.invoiceNumber,
        invoiceDate: headerState.invoiceDate,
        total: activeSum,
        notes: headerState.notes,
        items: items.map((it): InvoiceReviewItemUpdate => ({
          id: it.id,
          productName: it.productName,
          sku: it.sku,
          barcode: it.barcode,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          matchedProductId: it.matchedProductId,
          matchedProductName: it.matchedProductName,
          matchedProductSku: it.matchedProductSku,
          ignored: it.ignored,
          userModified: it.userModified,
          uncertainMatchConfirmed: confirmUncertainMatchesChecked || verifiedItemIds.has(it.id),
        })),
      };

      const updatedInvoice = await saveInvoiceReview(invoice.id, payload);
      setHasUnsavedChanges(false);
      onInvoiceUpdated(updatedInvoice);
      showAlert('success', 'Review draft saved successfully. Inventory remains completely unchanged.');
    } catch (err: any) {
      console.error('Failed to save review draft:', err);
      showAlert('error', err.message || 'Failed to save review draft.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Explicit Confirm (10-STEP TRANSACTIONAL CONFIRMATION WITH ATOMIC ROLLBACK)
  const handleExplicitConfirm = async () => {
    setIsConfirming(true);
    try {
      // First save current review draft to ensure latest values are committed
      const payload: InvoiceReviewPayload = {
        supplier: headerState.supplier,
        invoiceNumber: headerState.invoiceNumber,
        invoiceDate: headerState.invoiceDate,
        total: activeSum,
        notes: headerState.notes,
        items: items.map((it): InvoiceReviewItemUpdate => ({
          id: it.id,
          productName: it.productName,
          sku: it.sku,
          barcode: it.barcode,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          matchedProductId: it.matchedProductId,
          matchedProductName: it.matchedProductName,
          matchedProductSku: it.matchedProductSku,
          ignored: it.ignored,
          userModified: it.userModified,
          uncertainMatchConfirmed: confirmUncertainMatchesChecked || verifiedItemIds.has(it.id),
        })),
      };

      await saveInvoiceReview(invoice.id, payload);

      // Call explicit confirmation endpoint with confirmation options
      const result = await confirmInvoice(invoice.id, {
        confirmedUncertainMatches: confirmUncertainMatchesChecked || uncertainActiveItems.length === 0,
        simulateFailure: simulateRollbackFailure,
      });

      setConfirmationResult(result);
      setShowConfirmModal(false);
      setHasUnsavedChanges(false);
      onInvoiceUpdated(result.invoice);
      showAlert(
        'success',
        `Invoice ${result.invoice.invoiceNumber} explicitly confirmed via database transaction! Created ${result.createdInvoiceItems?.length || 0} invoice items and updated ${result.inventoryUpdates.length} stock balances.`
      );
    } catch (err: any) {
      console.error('Failed to confirm invoice:', err);
      showAlert(
        'error',
        err.message || 'Failed to confirm invoice. Database transaction was rolled back cleanly.'
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const isConfirmed = invoice.status === 'CONFIRMED';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Navigation & Action Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Breadcrumb & Title */}
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
              <button
                onClick={onBack}
                className="hover:text-stone-900 flex items-center gap-1 font-medium cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Invoices Ledger</span>
              </button>
              <span>/</span>
              <span className="font-semibold text-stone-700">Invoice Review & Verification</span>
              <span>/</span>
              <span className="font-mono text-emerald-800 font-bold">{invoice.invoiceNumber}</span>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <span>Purchase Invoice Review Screen</span>
              </h1>

              {isConfirmed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  CONFIRMED & STOCKED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-100 text-amber-800 border border-amber-300">
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  DRAFT REVIEW MODE
                </span>
              )}

              {uncertainItemsCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{uncertainItemsCount} uncertain value{uncertainItemsCount !== 1 ? 's' : ''}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>All values verified</span>
                </span>
              )}
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Original Scanned File Toggle */}
            <button
              onClick={() => setShowDocPreview(!showDocPreview)}
              className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 bg-stone-50 hover:bg-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              {invoice.mimeType.includes('pdf') ? (
                <FileText className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <FileImage className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span>{showDocPreview ? 'Hide Scanned File' : 'Inspect Scanned File'}</span>
            </button>

            {/* Save Review Draft Button */}
            {!isConfirmed && (
              <button
                onClick={handleSaveDraft}
                disabled={isSavingDraft}
                className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
                  hasUnsavedChanges
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold'
                    : 'border-stone-300 bg-white hover:bg-stone-50 text-stone-700'
                }`}
                title="Saves edits without altering inventory"
              >
                {isSavingDraft ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Draft...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Save Review Draft</span>
                    {hasUnsavedChanges && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                  </>
                )}
              </button>
            )}

            {/* Explicit Confirm Button */}
            {!isConfirmed ? (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-200" />
                <span>Confirm Invoice & Update Inventory</span>
              </button>
            ) : (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Inventory Updated on {new Date(invoice.confirmedAt || '').toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Strict Non-Mutation Architecture Assurance Notice */}
        <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-stone-500" />
            <span className="font-semibold text-stone-800">Strict Non-Mutation Safeguard:</span>
            <span>
              Inventory quantities remain <strong>100% untouched</strong> while editing fields, matching products, or
              ignoring items. Inventory is only adjusted when explicitly confirmed.
            </span>
          </div>

          <a
            href={getInvoiceDownloadUrl(invoice.id)}
            download={invoice.originalFilename}
            className="text-emerald-700 hover:underline flex items-center gap-1 text-[11px] font-medium"
          >
            <Download className="w-3 h-3" />
            <span>Download Original File</span>
          </a>
        </div>
      </div>

      {/* Alert Banner */}
      {alert && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : alert.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span className="font-medium">{alert.text}</span>
          </div>
          <button onClick={() => setAlert(null)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scanned Document Side-by-Side Preview (Collapsible) */}
      {showDocPreview && (
        <div className="bg-stone-900 rounded-xl p-4 text-white border border-stone-800 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-300">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Source Scanned Document ({invoice.originalFilename})</span>
              <span className="text-[10px] text-stone-500 font-mono">
                {(invoice.fileSize / 1024).toFixed(1)} KB · {invoice.mimeType}
              </span>
            </div>
            <button
              onClick={() => setShowDocPreview(false)}
              className="text-stone-400 hover:text-white text-xs cursor-pointer"
            >
              Close Preview
            </button>
          </div>

          <div className="max-h-96 overflow-auto bg-stone-950 p-2 rounded-lg flex items-center justify-center border border-stone-800">
            {invoice.mimeType.startsWith('image/') ? (
              <img
                src={getInvoiceDownloadUrl(invoice.id)}
                alt="Scanned invoice document"
                className="max-h-96 w-auto object-contain rounded"
              />
            ) : (
              <div className="py-12 text-center space-y-2">
                <FileText className="w-12 h-12 text-red-400 mx-auto" />
                <div className="text-xs font-semibold text-stone-200">
                  PDF Document: {invoice.originalFilename}
                </div>
                <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
                  PDF preview is available for download or via browser viewer.
                </p>
                <a
                  href={getInvoiceDownloadUrl(invoice.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold mt-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open PDF in New Tab</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INVOICE HEADER DETAILS EDITORS */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
            <span>Invoice Header & Supplier Information</span>
            <span className="text-stone-400 text-[11px] font-normal">
              (Extracted via Tesseract OCR · Click to edit any value)
            </span>
          </h2>

          <div className="text-[11px] text-stone-500 font-mono">
            Overall OCR Confidence: <strong>{invoice.ocrResult?.overallConfidence ?? 0}%</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Supplier Name Editor */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <label htmlFor="header-supplier" className="flex items-center gap-1.5">
                <span>Supplier</span>
                {invoice.ocrResult?.supplier.flaggedForReview && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded font-bold">
                    Uncertain
                  </span>
                )}
              </label>
              <span className="text-[10px] text-stone-400 font-mono">
                {invoice.ocrResult?.supplier.confidence ?? 0}% conf
              </span>
            </div>
            <input
              id="header-supplier"
              type="text"
              disabled={isConfirmed}
              value={headerState.supplier}
              onChange={(e) => handleHeaderChange('supplier', e.target.value)}
              placeholder="e.g. Green Valley Organics LLC"
              className={`w-full px-3 py-2 text-xs rounded-lg border transition-colors ${
                invoice.ocrResult?.supplier.flaggedForReview
                  ? 'border-amber-400 bg-amber-50/40 focus:bg-white focus:ring-1 focus:ring-amber-500'
                  : 'border-stone-300 focus:ring-1 focus:ring-emerald-500'
              } ${isConfirmed ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : 'bg-white'}`}
            />
            {invoice.ocrResult?.supplier.flaggedForReview && (
              <div className="text-[10px] text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>{invoice.ocrResult.supplier.reason || 'Check supplier name against scan'}</span>
              </div>
            )}
          </div>

          {/* Invoice Number Editor */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <label htmlFor="header-invnum" className="flex items-center gap-1.5">
                <span>Invoice Number</span>
                {invoice.ocrResult?.invoiceNumber.flaggedForReview && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded font-bold">
                    Uncertain
                  </span>
                )}
              </label>
              <span className="text-[10px] text-stone-400 font-mono">
                {invoice.ocrResult?.invoiceNumber.confidence ?? 0}% conf
              </span>
            </div>
            <input
              id="header-invnum"
              type="text"
              disabled={isConfirmed}
              value={headerState.invoiceNumber}
              onChange={(e) => handleHeaderChange('invoiceNumber', e.target.value)}
              placeholder="e.g. INV-2026-94812"
              className={`w-full px-3 py-2 text-xs font-mono rounded-lg border transition-colors ${
                invoice.ocrResult?.invoiceNumber.flaggedForReview
                  ? 'border-amber-400 bg-amber-50/40 focus:bg-white focus:ring-1 focus:ring-amber-500'
                  : 'border-stone-300 focus:ring-1 focus:ring-emerald-500'
              } ${isConfirmed ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : 'bg-white font-bold'}`}
            />
            {invoice.ocrResult?.invoiceNumber.flaggedForReview && (
              <div className="text-[10px] text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Low confidence on invoice number text</span>
              </div>
            )}
          </div>

          {/* Invoice Date Editor */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <label htmlFor="header-invdate" className="flex items-center gap-1.5">
                <span>Invoice Date</span>
                {invoice.ocrResult?.invoiceDate.flaggedForReview && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded font-bold">
                    Uncertain
                  </span>
                )}
              </label>
              <span className="text-[10px] text-stone-400 font-mono">
                {invoice.ocrResult?.invoiceDate.confidence ?? 0}% conf
              </span>
            </div>
            <input
              id="header-invdate"
              type="text"
              disabled={isConfirmed}
              value={headerState.invoiceDate}
              onChange={(e) => handleHeaderChange('invoiceDate', e.target.value)}
              placeholder="YYYY-MM-DD"
              className={`w-full px-3 py-2 text-xs font-mono rounded-lg border transition-colors ${
                invoice.ocrResult?.invoiceDate.flaggedForReview
                  ? 'border-amber-400 bg-amber-50/40 focus:bg-white focus:ring-1 focus:ring-amber-500'
                  : 'border-stone-300 focus:ring-1 focus:ring-emerald-500'
              } ${isConfirmed ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : 'bg-white'}`}
            />
            {invoice.ocrResult?.invoiceDate.flaggedForReview && (
              <div className="text-[10px] text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Verify date format (YYYY-MM-DD)</span>
              </div>
            )}
          </div>

          {/* Calculated Grand Total Box */}
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-600">
              <span>Active Items Total</span>
              <span className="text-[10px] text-stone-400 font-mono">{activeItems.length} active</span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono text-xl font-bold text-emerald-800 tabular-nums">
                ${activeSum.toFixed(2)}
              </span>

              {totalDifference !== 0 && (
                <span
                  className="text-[10px] font-mono text-stone-500"
                  title={`Original OCR Total: $${ocrHeaderTotal.toFixed(2)}`}
                >
                  OCR: ${ocrHeaderTotal.toFixed(2)} ({totalDifference > 0 ? `+${totalDifference}` : totalDifference})
                </span>
              )}
            </div>

            {totalDifference !== 0 && (
              <div className="text-[9.5px] text-stone-500 mt-1 leading-tight">
                {ignoredItemsCount > 0
                  ? `Reflects exclusion of ${ignoredItemsCount} ignored item(s).`
                  : 'Calculated from edited quantities and unit prices.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LINE ITEMS REVIEW GRID */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
        {/* Table Controls Bar */}
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <span>Extracted Line Items ({items.length})</span>
            </h2>

            {/* Filter buttons */}
            <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-lg text-[11px]">
              <button
                onClick={() => setItemFilter('ALL')}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  itemFilter === 'ALL'
                    ? 'bg-white shadow-2xs text-stone-900 font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All ({items.length})
              </button>

              <button
                onClick={() => setItemFilter('UNCERTAIN')}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  itemFilter === 'UNCERTAIN'
                    ? 'bg-white shadow-2xs text-amber-800 font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Uncertain ({uncertainItemsCount})
              </button>

              <button
                onClick={() => setItemFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  itemFilter === 'ACTIVE'
                    ? 'bg-white shadow-2xs text-emerald-800 font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Active ({activeItems.length})
              </button>

              <button
                onClick={() => setItemFilter('IGNORED')}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  itemFilter === 'IGNORED'
                    ? 'bg-white shadow-2xs text-stone-800 font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Ignored ({ignoredItemsCount})
              </button>

              <button
                onClick={() => setItemFilter('UNMATCHED')}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  itemFilter === 'UNMATCHED'
                    ? 'bg-white shadow-2xs text-blue-800 font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Unmatched ({unmatchedItemsCount})
              </button>
            </div>
          </div>

          {/* Search inside table */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, SKU, barcode..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100 text-stone-600 text-[10.5px] uppercase font-bold tracking-wider border-b border-stone-200">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[200px]">Product Name</th>
                <th className="py-2.5 px-3 min-w-[120px]">SKU</th>
                <th className="py-2.5 px-3 min-w-[130px]">Barcode / UPC</th>
                <th className="py-2.5 px-3 w-20 text-right">Quantity</th>
                <th className="py-2.5 px-3 w-24 text-right">Unit Price</th>
                <th className="py-2.5 px-3 w-24 text-right">Line Total</th>
                <th className="py-2.5 px-3 min-w-[170px]">Catalog Match</th>
                <th className="py-2.5 px-3 w-24 text-center">Status / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-stone-400 text-xs">
                    No items match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => {
                  const isUncertain = !it.ignored && (it.flaggedForReview || it.confidence < 75);

                  return (
                    <tr
                      key={it.id}
                      className={`transition-colors ${
                        it.ignored
                          ? 'bg-stone-100/70 text-stone-400 opacity-60'
                          : isUncertain
                          ? 'bg-amber-50/50 hover:bg-amber-50/80'
                          : 'bg-white hover:bg-stone-50/70'
                      }`}
                    >
                      {/* Row Index */}
                      <td className="py-3 px-3 text-center text-[10px] text-stone-400 font-mono font-medium">
                        {idx + 1}
                      </td>

                      {/* EDIT PRODUCT NAME */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="text"
                              disabled={isConfirmed || it.ignored}
                              value={it.productName}
                              onChange={(e) => handleItemFieldChange(it.id, 'productName', e.target.value)}
                              placeholder="Product name"
                              className={`w-full px-2.5 py-1.5 text-xs rounded-md border font-medium ${
                                it.productNameFlagged
                                  ? 'border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300'
                                  : 'border-stone-300 text-stone-900 bg-white focus:ring-1 focus:ring-emerald-500'
                              } ${it.ignored ? 'line-through text-stone-400 bg-stone-100' : ''}`}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-[9.5px]">
                            <span
                              className={`font-mono font-bold px-1.5 py-0.2 rounded ${
                                it.productNameConfidence >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : it.productNameConfidence >= 65
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {it.productNameConfidence}% OCR
                            </span>

                            {it.productNameFlagged && (
                              <span className="text-amber-800 font-semibold flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                <span>Uncertain recognition</span>
                              </span>
                            )}

                            {it.userModified && (
                              <span className="text-emerald-700 font-medium">· Edited</span>
                            )}
                          </div>

                          {it.reviewReasons.length > 0 && !it.ignored && (
                            <div className="space-y-0.5 pt-0.5">
                              {it.reviewReasons.map((r, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="text-[9px] text-amber-800 flex items-center gap-1 bg-amber-100/60 p-0.5 px-1 rounded"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                  <span>{r}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* EDIT SKU */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            disabled={isConfirmed || it.ignored}
                            value={it.sku}
                            onChange={(e) => handleItemFieldChange(it.id, 'sku', e.target.value)}
                            placeholder="SKU"
                            className={`w-full px-2 py-1 text-xs font-mono rounded-md border ${
                              it.skuFlagged || it.sku === 'Missing' || it.sku === 'SKU-UNRESOLVED'
                                ? 'border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300 font-bold'
                                : 'border-stone-300 text-stone-800 bg-white focus:ring-1 focus:ring-emerald-500'
                            } ${it.ignored ? 'line-through text-stone-400 bg-stone-100' : ''}`}
                          />
                          <div className="flex items-center gap-1 text-[9.5px]">
                            <span className="text-stone-400 font-mono">{it.skuConfidence}%</span>
                            {(it.skuFlagged || it.sku === 'Missing' || it.sku === 'SKU-UNRESOLVED') && (
                              <span className="text-amber-700 font-semibold">Verify SKU</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* EDIT BARCODE */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            disabled={isConfirmed || it.ignored}
                            value={it.barcode}
                            onChange={(e) => handleItemFieldChange(it.id, 'barcode', e.target.value)}
                            placeholder="Barcode"
                            className={`w-full px-2 py-1 text-xs font-mono rounded-md border ${
                              it.barcodeFlagged || it.barcode === 'Not detected' || it.barcode === 'Missing / Illegible'
                                ? 'border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300'
                                : 'border-stone-300 text-stone-800 bg-white focus:ring-1 focus:ring-emerald-500'
                            } ${it.ignored ? 'line-through text-stone-400 bg-stone-100' : ''}`}
                          />
                          <div className="flex items-center gap-1 text-[9.5px]">
                            <span className="text-stone-400 font-mono">{it.barcodeConfidence}%</span>
                            {(it.barcodeFlagged || it.barcode === 'Not detected') && (
                              <span className="text-amber-700 font-semibold">Missing barcode</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* EDIT QUANTITY */}
                      <td className="py-3 px-3 text-right">
                        <div className="space-y-1 inline-block text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isConfirmed || it.ignored}
                            value={it.quantity}
                            onChange={(e) => handleItemFieldChange(it.id, 'quantity', e.target.value)}
                            className={`w-20 px-2 py-1 text-xs font-mono font-bold text-right rounded-md border ${
                              it.quantityFlagged
                                ? 'border-amber-400 bg-amber-50 text-amber-950'
                                : 'border-stone-300 text-stone-900 bg-white focus:ring-1 focus:ring-emerald-500'
                            } ${it.ignored ? 'line-through text-stone-400 bg-stone-100' : ''}`}
                          />
                          <div className="text-[9.5px] text-stone-400 font-mono">{it.quantityConfidence}%</div>
                        </div>
                      </td>

                      {/* EDIT UNIT PRICE */}
                      <td className="py-3 px-3 text-right">
                        <div className="space-y-1 inline-block text-right">
                          <div className="relative">
                            <span className="absolute left-2 top-1 text-stone-400 text-xs">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isConfirmed || it.ignored}
                              value={it.unitPrice}
                              onChange={(e) => handleItemFieldChange(it.id, 'unitPrice', e.target.value)}
                              className={`w-24 pl-5 pr-2 py-1 text-xs font-mono font-medium text-right rounded-md border ${
                                it.unitPriceFlagged
                                  ? 'border-amber-400 bg-amber-50 text-amber-950'
                                  : 'border-stone-300 text-stone-900 bg-white focus:ring-1 focus:ring-emerald-500'
                              } ${it.ignored ? 'line-through text-stone-400 bg-stone-100' : ''}`}
                            />
                          </div>
                          <div className="text-[9.5px] text-stone-400 font-mono">{it.unitPriceConfidence}%</div>
                        </div>
                      </td>

                      {/* LINE TOTAL (Auto-computed & editable) */}
                      <td className="py-3 px-3 text-right">
                        <div className="space-y-1">
                          <span
                            className={`font-mono font-bold text-xs tabular-nums block ${
                              it.ignored ? 'line-through text-stone-400' : 'text-stone-900'
                            }`}
                          >
                            ${Number(it.total).toFixed(2)}
                          </span>
                          <span className="text-[9.5px] text-stone-400 font-mono">
                            {it.quantity} × ${Number(it.unitPrice).toFixed(2)}
                          </span>
                        </div>
                      </td>

                      {/* MATCH PRODUCT */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {it.matchedProductId ? (
                            <div className="p-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold truncate flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span className="truncate">{it.matchedProductName}</span>
                                </span>
                                {!isConfirmed && (
                                  <button
                                    onClick={() => handleClearMatch(it.id)}
                                    title="Unlink product match"
                                    className="text-stone-400 hover:text-rose-600 cursor-pointer p-0.5"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-emerald-700 font-mono">
                                <span>SKU: {it.matchedProductSku}</span>
                                {!isConfirmed && (
                                  <button
                                    onClick={() => handleOpenMatchingModal(it)}
                                    className="text-emerald-800 underline font-sans text-[10px] cursor-pointer"
                                  >
                                    Change
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              {!isConfirmed && !it.ignored ? (
                                <button
                                  onClick={() => handleOpenMatchingModal(it)}
                                  className="w-full py-1.5 px-2 rounded-md border border-dashed border-stone-300 hover:border-emerald-500 bg-stone-50 hover:bg-emerald-50/50 text-stone-700 hover:text-emerald-900 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Link2 className="w-3 h-3 text-stone-500" />
                                  <span>Match Catalog Product</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-stone-400 italic">
                                  {it.ignored ? 'Ignored item' : 'Unmatched'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* STATUS & ACTIONS (Ignore Item / Verify / Reset) */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          {/* Toggle Ignore Item Button */}
                          {!isConfirmed && (
                            <button
                              onClick={() => handleToggleIgnore(it.id)}
                              className={`px-2 py-1 rounded text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer transition-colors w-full justify-center ${
                                it.ignored
                                  ? 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                                  : 'bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900'
                              }`}
                              title={it.ignored ? 'Restore item to invoice' : 'Exclude item from confirmation'}
                            >
                              {it.ignored ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Restore</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Ignore</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Quick Mark as Verified */}
                          {!isConfirmed && !it.ignored && isUncertain && (
                            <button
                              onClick={() => handleMarkVerified(it.id)}
                              title="Confirm this item's data is verified"
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-2.5 h-2.5" />
                              <span>Verify</span>
                            </button>
                          )}

                          {/* Reset to OCR original */}
                          {!isConfirmed && it.userModified && (
                            <button
                              onClick={() => handleResetToOcr(it.id)}
                              title="Reset to original OCR extraction"
                              className="text-[9.5px] text-stone-400 hover:text-stone-600 flex items-center gap-0.5 cursor-pointer"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-600 gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Total Extracted Items: <strong>{items.length}</strong>
            </span>
            <span>·</span>
            <span className="text-emerald-800 font-semibold">
              Active Items: <strong>{activeItems.length}</strong>
            </span>
            <span>·</span>
            <span className="text-stone-500">
              Ignored Items: <strong>{ignoredItemsCount}</strong>
            </span>
            <span>·</span>
            <span className={uncertainItemsCount > 0 ? 'text-amber-800 font-semibold' : 'text-stone-500'}>
              Uncertain Items: <strong>{uncertainItemsCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-stone-500">Invoice Total to Confirm:</span>
            <span className="font-mono text-base font-bold text-emerald-900 tabular-nums">
              ${activeSum.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* INVOICE NOTES */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs space-y-2">
        <label htmlFor="review-notes" className="block text-xs font-semibold text-stone-700">
          Review Notes / Delivery Audit Comments
        </label>
        <textarea
          id="review-notes"
          rows={2}
          disabled={isConfirmed}
          value={headerState.notes}
          onChange={(e) => handleHeaderChange('notes', e.target.value)}
          placeholder="e.g. Scanned produce invoice reviewed against physical delivery; bulk item SKU confirmed."
          className={`w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none ${
            isConfirmed ? 'bg-stone-100 text-stone-500' : 'bg-white'
          }`}
        />
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Invoices Ledger</span>
        </button>

        <div className="flex items-center gap-3">
          {!isConfirmed && (
            <button
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              className="px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-stone-600" />
              <span>Save Draft Changes</span>
            </button>
          )}

          {!isConfirmed ? (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-200" />
              <span>Confirm Invoice & Update Inventory ({activeItems.length} items)</span>
            </button>
          ) : (
            <div className="px-4 py-2 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>Invoice Confirmed & Archived</span>
            </div>
          )}
        </div>
      </div>

      {/* PRODUCT MATCHING MODAL */}
      {matchingModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-stone-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-emerald-400" />
                  <span>Match Line Item to Product Catalog</span>
                </h3>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Item: <strong className="text-stone-200">{matchingModalItem.productName}</strong> (SKU:{' '}
                  {matchingModalItem.sku || 'None'})
                </p>
              </div>

              <button
                onClick={() => setMatchingModalItem(null)}
                className="text-stone-400 hover:text-white p-1 rounded hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Catalog Input */}
            <div className="p-4 bg-stone-50 border-b border-stone-200 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Search catalog by product name, SKU, or barcode..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <p className="text-[10.5px] text-stone-500">
                Selecting a product links this invoice line item to the inventory system. Upon confirmation, stock will
                be added to the matched product.
              </p>
            </div>

            {/* Catalog List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {loadingProducts ? (
                <div className="py-12 text-center text-xs text-stone-400">Loading catalog products...</div>
              ) : (
                (() => {
                  const filtered = catalogProducts.filter((p) => {
                    if (!productSearchQuery.trim()) return true;
                    const q = productSearchQuery.toLowerCase().trim();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.sku.toLowerCase().includes(q) ||
                      (p.barcode && p.barcode.toLowerCase().includes(q))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center space-y-2">
                        <Boxes className="w-8 h-8 text-stone-300 mx-auto" />
                        <div className="text-xs text-stone-500 font-medium">
                          No matching catalog products found for "{productSearchQuery}"
                        </div>
                        <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
                          If this item is new, you can leave it unmatched. When you confirm the invoice, a new product
                          record will automatically be created in the catalog.
                        </p>
                      </div>
                    );
                  }

                  return filtered.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => handleSelectMatchedProduct(prod)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                        matchingModalItem.matchedProductId === prod.id
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                          : 'border-stone-200 bg-white hover:border-emerald-400 hover:bg-stone-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-xs text-stone-900 flex items-center gap-2">
                          <span>{prod.name}</span>
                          <span className="font-mono text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">
                            {prod.sku}
                          </span>
                        </div>

                        <div className="text-[11px] text-stone-500 flex items-center gap-3">
                          {prod.barcode && <span>UPC: {prod.barcode}</span>}
                          {prod.categoryName && <span>Category: {prod.categoryName}</span>}
                          <span>Unit: {prod.unit}</span>
                          <span>Purchase Price: ${prod.purchasePrice.toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Select Match
                      </button>
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
              <button
                onClick={() => handleClearMatch(matchingModalItem.id)}
                className="text-stone-500 hover:text-rose-600 text-xs font-semibold cursor-pointer"
              >
                Clear / Leave Unmatched
              </button>

              <button
                onClick={() => setMatchingModalItem(null)}
                className="px-4 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10-STEP TRANSACTIONAL CONFIRMATION DIALOG MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 bg-emerald-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-800/80 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <span>10-Step Transactional Confirmation</span>
                    <span className="font-mono text-[11px] text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded">
                      {headerState.invoiceNumber}
                    </span>
                  </h3>
                  <p className="text-[11px] text-emerald-300/80">
                    Atomic database transaction · Zero duplicate products · Rollback safeguard on failure
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-stone-400 hover:text-white p-1 rounded cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-stone-200 bg-stone-50 px-4 pt-2 shrink-0 gap-2">
              <button
                onClick={() => setActiveStepTab('OVERVIEW')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-t border-x ${
                  activeStepTab === 'OVERVIEW'
                    ? 'bg-white text-emerald-900 border-stone-200 -mb-px'
                    : 'bg-transparent text-stone-600 border-transparent hover:text-stone-900'
                }`}
              >
                Stock Impact ({activeItems.length})
              </button>
              <button
                onClick={() => setActiveStepTab('UNCERTAIN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-t border-x flex items-center gap-1.5 ${
                  activeStepTab === 'UNCERTAIN'
                    ? 'bg-white text-emerald-900 border-stone-200 -mb-px'
                    : 'bg-transparent text-stone-600 border-transparent hover:text-stone-900'
                }`}
              >
                <span>Step 4: Uncertain Matches</span>
                {uncertainActiveItems.length > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                    {uncertainActiveItems.length}
                  </span>
                ) : (
                  <Check className="w-3 h-3 text-emerald-600" />
                )}
              </button>
              <button
                onClick={() => setActiveStepTab('STEPS')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-t border-x ${
                  activeStepTab === 'STEPS'
                    ? 'bg-white text-emerald-900 border-stone-200 -mb-px'
                    : 'bg-transparent text-stone-600 border-transparent hover:text-stone-900'
                }`}
              >
                10-Step Execution Protocol
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {activeStepTab === 'OVERVIEW' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Ready to confirm Purchase Invoice {headerState.invoiceNumber}</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      Executing confirmation will run an atomic database transaction through all 10 validation,
                      product matching, purchase ledger, inventory increment, and notification steps.
                    </p>
                  </div>

                  {/* Stock to be Added */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                      <span>Line Items to Stock ({activeItems.length}):</span>
                      <span className="font-mono text-stone-500 text-[11px]">
                        Supplier: {headerState.supplier} · {headerState.invoiceDate}
                      </span>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
                      {activeItems.map((it) => (
                        <div key={it.id} className="p-2.5 text-xs flex items-center justify-between hover:bg-stone-50">
                          <div>
                            <div className="font-semibold text-stone-800 flex items-center gap-2">
                              <span>{it.productName}</span>
                              {it.matchedProductName ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200 font-medium">
                                  <Link2 className="w-3 h-3 text-emerald-600" />
                                  {it.matchedProductName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200 font-medium">
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  New Catalog Product
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                              SKU: {it.sku || 'Auto-catalog'} · UPC: {it.barcode || 'None'} · Confidence: {it.confidence}%
                            </div>
                          </div>
                          <div className="font-mono font-bold text-emerald-700 text-right shrink-0">
                            +{it.quantity} units
                            <div className="text-[10px] text-stone-500 font-normal">
                              ${(it.quantity * it.unitPrice).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {ignoredItemsCount > 0 && (
                    <div className="p-2.5 bg-stone-100 border border-stone-200 rounded text-[11px] text-stone-600 flex items-center gap-2">
                      <EyeOff className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                      <span>
                        <strong>{ignoredItemsCount} ignored item(s)</strong> are excluded and will completely bypass
                        inventory updates and purchase ledger records.
                      </span>
                    </div>
                  )}

                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-stone-600 font-medium">Total Confirmed Invoice Value:</span>
                    <span className="font-mono font-bold text-base text-emerald-800 tabular-nums">
                      ${activeSum.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {activeStepTab === 'UNCERTAIN' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Requirement: User Confirmation Required for Uncertain Matches</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      To prevent inventory corruption and ensure no duplicate products are created, you must explicitly
                      review and approve all uncertain OCR extractions or new product catalog additions before
                      confirming.
                    </p>
                  </div>

                  {uncertainActiveItems.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-emerald-300 rounded-lg bg-emerald-50/50 space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <div className="text-xs font-bold text-emerald-900">All Matches Verified & Certain</div>
                      <p className="text-[11px] text-emerald-700 max-w-sm mx-auto">
                        Every active line item has high OCR confidence and is linked to a validated catalog product.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                        <span>Items Requiring Verification ({uncertainActiveItems.length}):</span>
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = new Set(uncertainActiveItems.map((u) => u.id));
                            setVerifiedItemIds(allIds);
                            setConfirmUncertainMatchesChecked(true);
                          }}
                          className="text-emerald-700 hover:underline text-[11px] font-semibold cursor-pointer"
                        >
                          Mark All Verified
                        </button>
                      </div>

                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {uncertainActiveItems.map((item) => {
                          const isItemVerified = verifiedItemIds.has(item.id);
                          return (
                            <div
                              key={item.id}
                              className={`p-3 rounded-lg border text-xs space-y-2 transition-all ${
                                isItemVerified
                                  ? 'border-emerald-300 bg-emerald-50/50'
                                  : 'border-amber-300 bg-amber-50/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-stone-900 flex items-center gap-2">
                                    <span>{item.productName}</span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-stone-200 text-stone-700">
                                      OCR: {item.confidence}%
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-stone-600 mt-0.5">
                                    {item.matchedProductName ? (
                                      <span className="text-emerald-800 font-medium">
                                        Matched to: {item.matchedProductName} (SKU: {item.matchedProductSku})
                                      </span>
                                    ) : (
                                      <span className="text-amber-800 font-medium">
                                        No existing match · Will catalog as new product (SKU: {item.sku || 'Auto-generated'})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMatchingModal(item)}
                                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-50 text-[10px] font-semibold text-stone-700 cursor-pointer"
                                  >
                                    Change Match
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVerifiedItemIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.id)) next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                      });
                                    }}
                                    className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                      isItemVerified
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                    }`}
                                  >
                                    {isItemVerified ? (
                                      <>
                                        <Check className="w-3 h-3" />
                                        <span>Verified</span>
                                      </>
                                    ) : (
                                      <span>Verify Match</span>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {item.reviewReasons.length > 0 && (
                                <div className="text-[10px] text-stone-500 bg-white/80 p-1.5 rounded border border-stone-200">
                                  <strong>Uncertainty Reasons:</strong> {item.reviewReasons.join(' · ')}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mandatory Explicit Confirmation Checkbox */}
                  {uncertainActiveItems.length > 0 && (
                    <label className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-start gap-2.5 cursor-pointer hover:bg-stone-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={confirmUncertainMatchesChecked}
                        onChange={(e) => setConfirmUncertainMatchesChecked(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-stone-900">
                          I explicitly confirm and approve all {uncertainActiveItems.length} uncertain item matches and new
                          catalog additions.
                        </span>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          Confirms that product names, SKUs, and barcodes have been inspected and no duplicate products will
                          be erroneously introduced into the catalog.
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {activeStepTab === 'STEPS' && (
                <div className="space-y-3">
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs space-y-1">
                    <div className="font-bold text-stone-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      <span>The 10-Step Confirmation Sequence</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      Executed within a single database transaction. If any step fails or encounters a conflict, the
                      entire operation automatically rolls back.
                    </p>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {[
                      { step: 1, title: 'Validate invoice', desc: 'Checks supplier, date, number format & uniqueness' },
                      { step: 2, title: 'Validate invoice items', desc: 'Verifies positive quantities, prices, and non-empty names' },
                      { step: 3, title: 'Match each item to a product', desc: 'Matches by Barcode, SKU, Name; prevents duplicates' },
                      { step: 4, title: 'Require user confirmation for uncertain matches', desc: 'Guarantees user review for low-confidence or new items' },
                      { step: 5, title: 'Create purchase invoice', desc: 'Transitions status to CONFIRMED with timestamp & ledger reference' },
                      { step: 6, title: 'Create invoice items', desc: 'Persists formal purchase invoice line item records' },
                      { step: 7, title: 'Increase inventory', desc: 'Adds purchased quantities to store product inventory balances' },
                      { step: 8, title: 'Create PURCHASE inventory transactions', desc: 'Appends immutable audit transactions to stock ledger' },
                      { step: 9, title: 'Recalculate stock status', desc: 'Re-evaluates OUT_OF_STOCK, LOW_STOCK, and IN_STOCK statuses' },
                      { step: 10, title: 'Trigger notification logic', desc: 'Emits restock notifications & inventory threshold alerts' },
                    ].map((s) => (
                      <div key={s.step} className="p-2 rounded border border-stone-200 bg-white flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[11px] flex items-center justify-center shrink-0">
                          {s.step}
                        </span>
                        <div>
                          <div className="font-semibold text-stone-800">{s.title}</div>
                          <div className="text-[10px] text-stone-500">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction Rollback Simulation Option */}
              <div className="p-3 bg-stone-100/80 rounded-lg border border-stone-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                  <span className="text-stone-700 font-medium">Verify Database Rollback Behavior:</span>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-stone-600 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulateRollbackFailure}
                    onChange={(e) => setSimulateRollbackFailure(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span>Simulate Step Failure (Test Rollback)</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {uncertainActiveItems.length > 0 && !confirmUncertainMatchesChecked && (
                  <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>Approve uncertain matches above to enable confirmation</span>
                  </span>
                )}

                <button
                  onClick={handleExplicitConfirm}
                  disabled={isConfirming || (uncertainActiveItems.length > 0 && !confirmUncertainMatchesChecked)}
                  className={`px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer ${
                    uncertainActiveItems.length > 0 && !confirmUncertainMatchesChecked
                      ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                      : simulateRollbackFailure
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isConfirming ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Database Transaction...</span>
                    </>
                  ) : simulateRollbackFailure ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Test Transaction Rollback</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm Invoice & Update Inventory</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION SUCCESS RECEIPT MODAL */}
      {confirmationResult && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-stone-200 overflow-hidden space-y-4 max-h-[92vh] flex flex-col">
            <div className="p-5 bg-emerald-600 text-white text-center space-y-2 shrink-0">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-base font-bold">Database Transaction Committed!</h3>
              <p className="text-xs text-emerald-100">
                Invoice {confirmationResult.invoice.invoiceNumber} confirmed across all 10 steps. Store inventory has
                been updated.
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                TRANSACTION STATUS: {confirmationResult.transactionStatus || 'COMMITTED'}
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Created Invoice Line Items */}
              {confirmationResult.createdInvoiceItems && confirmationResult.createdInvoiceItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-stone-800 flex items-center justify-between">
                    <span>Created Purchase Invoice Items:</span>
                    <span className="font-mono text-[11px] text-stone-500">
                      {confirmationResult.createdInvoiceItems.length} records persisted
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg text-xs">
                    {confirmationResult.createdInvoiceItems.map((item) => (
                      <div key={item.id} className="p-2 flex items-center justify-between hover:bg-stone-50">
                        <div>
                          <div className="font-semibold text-stone-900">{item.productName}</div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            SKU: {item.sku} · Item #{item.id} · Matched: {item.matchedBy}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-stone-800">{item.quantity} × ${item.unitPrice.toFixed(2)}</span>
                          <div className="text-[10px] text-emerald-700 font-bold">${item.totalPrice.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Updated Inventory Balances */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-800 flex items-center justify-between">
                  <span>Updated Inventory Balances:</span>
                  <span className="font-mono text-[11px] text-stone-500">
                    {confirmationResult.inventoryUpdates.length} product(s) stocked
                  </span>
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
                  {confirmationResult.inventoryUpdates.map((u) => (
                    <div key={u.transactionId} className="p-2.5 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-stone-900 flex items-center gap-2">
                          <span>{u.productName}</span>
                          {u.stockStatus && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                                u.stockStatus === 'IN STOCK'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : u.stockStatus === 'LOW STOCK'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {u.stockStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          SKU: {u.productSku} · Transaction #{u.transactionId}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="font-bold text-emerald-700">+{u.addedQuantity} added</div>
                        <div className="text-[10px] text-stone-500">New balance: {u.newQuantity}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Triggered Notifications */}
              {confirmationResult.notificationsTriggered && confirmationResult.notificationsTriggered.length > 0 && (
                <div className="space-y-1.5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-600" />
                    <span>Triggered Notification Logic ({confirmationResult.notificationsTriggered.length}):</span>
                  </div>
                  {confirmationResult.notificationsTriggered.map((n) => (
                    <div key={n.id} className="text-[11px] text-blue-800 pl-5">
                      • <strong>{n.type}:</strong> {n.message}
                    </div>
                  ))}
                </div>
              )}

              {confirmationResult.skippedItemsCount > 0 && (
                <div className="text-[11px] text-stone-500 italic">
                  Note: {confirmationResult.skippedItemsCount} ignored item(s) were excluded from inventory update.
                </div>
              )}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => setConfirmationResult(null)}
                className="px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-semibold cursor-pointer"
              >
                Close Receipt
              </button>

              <button
                onClick={() => {
                  setConfirmationResult(null);
                  onBack();
                }}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Return to Invoices Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
