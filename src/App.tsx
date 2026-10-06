/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { PosTerminal } from './components/PosTerminal/PosTerminal';
import { ProductList } from './components/ProductManagement/ProductList';
import { InventoryList } from './components/InventoryManagement/InventoryList';
import { HealthDashboard } from './components/HealthDashboard';
import { ArchitectureView } from './components/ArchitectureView';
import { ApiExplorer } from './components/ApiExplorer';
import { DevSetupGuide } from './components/DevSetupGuide';
import { fetchHealthStatus, HealthCheckResult } from './api/healthApi';
import { HealthStatus } from './types/health';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [healthData, setHealthData] = useState<HealthStatus | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [rawJson, setRawJson] = useState<string>('{}');
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const performHealthCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res: HealthCheckResult = await fetchHealthStatus();
      setLatencyMs(res.latencyMs);
      setRawJson(res.rawJson);
      setError(res.error);
      if (res.data) {
        setHealthData(res.data);
      }
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    performHealthCheck();
    // Auto-poll health status every 30 seconds
    const interval = setInterval(performHealthCheck, 30000);
    return () => clearInterval(interval);
  }, [performHealthCheck]);

  const isHealthy = !error && healthData?.status === 'UP';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-100 font-sans text-stone-900 antialiased">
      {/* POS Navigation Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
        {/* Header Bar */}
        <Header
          onRefresh={performHealthCheck}
          isRefreshing={loading}
          isHealthy={isHealthy}
          latencyMs={latencyMs}
          lastChecked={lastChecked}
        />

        {/* Dynamic Views */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'pos' && <PosTerminal />}

            {activeTab === 'products' && <ProductList />}

            {activeTab === 'inventory' && <InventoryList />}

            {activeTab === 'health' && (
              <HealthDashboard
                data={healthData}
                loading={loading}
                latencyMs={latencyMs}
                rawJson={rawJson}
                error={error}
                onRefresh={performHealthCheck}
                lastChecked={lastChecked}
              />
            )}

            {activeTab === 'architecture' && <ArchitectureView />}

            {activeTab === 'explorer' && <ApiExplorer />}

            {activeTab === 'setup' && <DevSetupGuide />}
          </div>
        </main>
      </div>
    </div>
  );
}
