import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Plus,
  Package,
  X,
  Filter,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Product } from '../../types/product';
import { searchProducts, fetchProducts } from '../../api/productApi';

interface ProductSearchCatalogProps {
  onAddToCart: (product: Product) => void;
}

export const ProductSearchCatalog: React.FC<ProductSearchCatalogProps> = ({ onAddToCart }) => {
  const [query, setQuery] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProducts = async (searchQuery: string = '') => {
    setLoading(true);
    try {
      if (searchQuery.trim()) {
        const results = await searchProducts(searchQuery.trim(), true);
        setProducts(results);
      } else {
        const all = await fetchProducts(undefined, undefined, true);
        setProducts(all);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Extract unique categories
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set);
  }, [products]);

  // Filter products by selected category
  const filteredProducts = React.useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.categoryName === selectedCategory);
  }, [products, selectedCategory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return;

      // Exact barcode or SKU match
      const exactMatch = products.find(
        (p) =>
          p.barcode?.toLowerCase() === trimmed ||
          p.sku.toLowerCase() === trimmed
      );

      if (exactMatch) {
        handleProductClick(exactMatch);
        setQuery('');
      } else if (filteredProducts.length === 1) {
        handleProductClick(filteredProducts[0]);
        setQuery('');
      }
    }
  };

  const handleProductClick = (product: Product) => {
    onAddToCart(product);
    setLastAddedId(product.id);
    setTimeout(() => {
      setLastAddedId((prev) => (prev === product.id ? null : prev));
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
      {/* Top Search Bar */}
      <div className="p-4 border-b border-stone-200 bg-stone-50/50 space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode or search by Name, SKU, Barcode, Category (Press Enter to quick-add)..."
            className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent placeholder-stone-400 font-sans"
            autoFocus
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-stone-400">
              <Barcode className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Category Filter Tabs */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-md font-medium shrink-0 transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              All Items ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-md font-medium shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Catalog Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-stone-400">
            <RefreshCw className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs">Searching catalog...</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-stone-400 text-center">
            <Package className="w-8 h-8 stroke-1 mb-2 text-stone-300" />
            <p className="text-sm font-medium text-stone-600">No products found</p>
            <p className="text-xs text-stone-400 mt-1 max-w-xs">
              {query
                ? `No active products match "${query}". Try searching by name, SKU, or category.`
                : 'No active products available in catalog.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const isJustAdded = lastAddedId === product.id;
              return (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className={`relative p-3 rounded-lg border text-left transition-all flex flex-col justify-between group cursor-pointer ${
                    isJustAdded
                      ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                      : 'border-stone-200 bg-white hover:border-emerald-500 hover:shadow-xs'
                  }`}
                >
                  <div>
                    {/* Category & SKU */}
                    <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1">
                      <span className="truncate font-medium text-stone-600">
                        {product.categoryName || 'General'}
                      </span>
                      <span className="font-mono text-[10px] text-stone-400">
                        {product.sku}
                      </span>
                    </div>

                    {/* Product Name */}
                    <h4 className="text-xs font-semibold text-stone-900 group-hover:text-emerald-700 transition-colors line-clamp-2 leading-snug">
                      {product.name}
                    </h4>

                    {/* Barcode if present */}
                    {product.barcode && (
                      <div className="text-[10px] font-mono text-stone-400 mt-0.5 truncate flex items-center gap-1">
                        <Barcode className="w-3 h-3 inline text-stone-400 shrink-0" />
                        <span>{product.barcode}</span>
                      </div>
                    )}
                  </div>

                  {/* Price & Unit & Quick Add Action */}
                  <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold font-mono text-stone-900">
                        ${Number(product.sellingPrice).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        per {product.unit}
                        {product.taxRate > 0 ? ` · ${product.taxRate}% tax` : ' · No tax'}
                      </div>
                    </div>

                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                        isJustAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-stone-100 group-hover:bg-emerald-600 group-hover:text-white text-stone-600'
                      }`}
                      title="Add to cart"
                    >
                      {isJustAdded ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Catalog Footer Stats */}
      <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
        <span>
          Showing <span className="font-medium text-stone-700">{filteredProducts.length}</span> active products
        </span>
        <span className="font-mono text-[10px] text-stone-400">Click item or press Enter to add</span>
      </div>
    </div>
  );
};
