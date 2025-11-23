"use client";

import { useState, useEffect } from "react";
import { formatUnits } from "viem";

interface WithdrawButtonProps {
  vaultAddress: string;
  chainId: number;
  currentChainId: number;
  onWithdraw: (vaultAddress: string, chainId: number, depositId?: string) => Promise<void>;
  getUserVaultBalance: (vaultAddress: string, chainId: number) => Promise<{ shares: bigint; assets: bigint; decimals: number } | null>;
  vaultBalances: Record<string, { shares: bigint; assets: bigint; decimals: number }>;
  loadingBalances: Record<string, boolean>;
  setVaultBalances: React.Dispatch<React.SetStateAction<Record<string, { shares: bigint; assets: bigint; decimals: number }>>>;
  setLoadingBalances: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  withdrawing?: boolean;
}

export default function WithdrawButton({
  vaultAddress,
  chainId,
  currentChainId,
  onWithdraw,
  getUserVaultBalance,
  vaultBalances,
  loadingBalances,
  setVaultBalances,
  setLoadingBalances,
  withdrawing: externalWithdrawing = false,
}: WithdrawButtonProps) {
  const [localWithdrawing, setLocalWithdrawing] = useState(false);
  const withdrawing = externalWithdrawing || localWithdrawing;
  const balanceKey = `${vaultAddress}-${chainId}`;
  const balance = vaultBalances[balanceKey];
  const isLoading = loadingBalances[balanceKey] || false;

  useEffect(() => {
    // Cargar balance inicial
    if (!balance && !isLoading) {
      loadBalance();
    }
    // Actualizar balance cada 30 segundos
    const interval = setInterval(() => {
      if (!withdrawing) {
        loadBalance();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [vaultAddress, chainId, withdrawing]);

  const loadBalance = async () => {
    if (isLoading) return;
    setLoadingBalances((prev) => ({ ...prev, [balanceKey]: true }));
    try {
      const bal = await getUserVaultBalance(vaultAddress, chainId);
      if (bal) {
        setVaultBalances((prev) => ({ ...prev, [balanceKey]: bal }));
      }
    } catch (error) {
      console.error("Error cargando balance:", error);
    } finally {
      setLoadingBalances((prev) => ({ ...prev, [balanceKey]: false }));
    }
  };

  const handleWithdrawClick = async () => {
    setLocalWithdrawing(true);
    try {
      await onWithdraw(vaultAddress, chainId);
      // Esperar un momento y luego recargar balance
      setTimeout(async () => {
        await loadBalance();
      }, 2000);
    } finally {
      setLocalWithdrawing(false);
    }
  };

  const hasBalance = balance && balance.assets > 0n;
  const isCorrectChain = currentChainId === chainId;

  // No mostrar el botón si no hay balance
  if (!hasBalance && !isLoading) {
    return null;
  }

  return (
    <button
      onClick={handleWithdrawClick}
      disabled={!hasBalance || withdrawing || !isCorrectChain || isLoading}
      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      title={
        !isCorrectChain
          ? `Cambia a ${chainId === 8453 ? 'Base' : 'Ethereum'} para retirar`
          : hasBalance
          ? `Retirar ${balance ? formatUnits(balance.assets, balance.decimals).slice(0, 6) : ''}`
          : "Sin balance"
      }
    >
      {withdrawing ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Retirando...</span>
        </>
      ) : isLoading ? (
        <span className="text-xs">Cargando...</span>
      ) : (
        <>
          <span>💸</span>
          <span>Retirar</span>
          {hasBalance && balance && (
            <span className="text-xs opacity-90">
              ({formatUnits(balance.assets, balance.decimals).slice(0, 6)})
            </span>
          )}
        </>
      )}
    </button>
  );
}

