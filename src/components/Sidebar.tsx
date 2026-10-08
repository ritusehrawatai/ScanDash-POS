import React from 'react';
import {
  Activity,
  Layers,
  Terminal,
  ShoppingBag,
  Package,
  Boxes,
  FileScan,
  UploadCloud,
  BarChart3,
  BookOpen,
  Store,
  LayoutDashboard,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'pos' | 'products' | 'inventory' | 'invoices' | 'health' | 'architecture' | 'explorer' | 'setup';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  return (
    <aside className="w-64 bg-stone-900 text-stone-200 flex flex-col justify-between shrink-0 select-none">
      <div>
        <div className="p-4 border-b border-stone-800">
          <div className="flex items-center gap-2 text-stone-100 font-bold text-sm tracking-tight">
            <Store className="w-4 h-4 text-emerald-500" />
            <span>ScanDash POS</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Phase 5: Owner & Admin Dashboard Active
          </div>
        </div>

        {/* Primary Navigation - Active initialized modules */}
        <div className="p-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
            Store Management
          </div>

          {/* Owner Dashboard */}
          <button
            onClick={() => onTabChange('dashboard')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4" />
              <span>Owner Dashboard</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          {/* POS Terminal / Cart */}
          <button
            onClick={() => onTabChange('pos')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-4 h-4" />
              <span>POS Terminal (Cart)</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          {/* Product Management */}
          <button
            onClick={() => onTabChange('products')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'products'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4" />
              <span>Products & Catalog</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          {/* Inventory Management */}
          <button
            onClick={() => onTabChange('inventory')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Boxes className="w-4 h-4" />
              <span>Inventory Management</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          {/* Purchase Invoices (Admin / Owner) */}
          <button
            onClick={() => onTabChange('invoices')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'invoices'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <UploadCloud className="w-4 h-4" />
              <span>Invoices & OCR Review</span>
            </div>
            <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
              OCR
            </span>
          </button>
        </div>

        {/* System & Architecture Section */}
        <div className="p-3 pt-1 space-y-1 border-t border-stone-800/60">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
            System & Diagnostics
          </div>

          <button
            onClick={() => onTabChange('health')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'health'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4" />
              <span>Health & Live Metrics</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          <button
            onClick={() => onTabChange('architecture')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'architecture'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4" />
              <span>Architecture Pipeline</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          <button
            onClick={() => onTabChange('explorer')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'explorer'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4" />
              <span>REST API Explorer</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          <button
            onClick={() => onTabChange('setup')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'setup'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4" />
              <span>Local Dev & Setup Guide</span>
            </div>
            <span className="text-[10px] text-stone-400">Docs</span>
          </button>
        </div>

        {/* Future Modules */}
        <div className="p-3 pt-2 space-y-1 border-t border-stone-800/60">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
            Planned Modules
          </div>

          <div className="px-3 py-2 rounded-md text-xs text-stone-400 flex items-center justify-between opacity-70">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-4 h-4 text-stone-400" />
              <span>Advanced Analytics</span>
            </div>
            <span className="text-[10px] font-mono text-stone-400">Phase 6</span>
          </div>
        </div>
      </div>

      {/* Footer System Specs */}
      <div className="p-4 border-t border-stone-800 text-[11px] text-stone-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Backend</span>
          <span className="font-mono text-stone-300">Spring Boot 3.3 / Java 17</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Database</span>
          <span className="font-mono text-stone-300">PostgreSQL 15</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Frontend</span>
          <span className="font-mono text-stone-300">React 19 + TypeScript</span>
        </div>
      </div>
    </aside>
  );
};
