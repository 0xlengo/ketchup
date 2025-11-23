"use client";

import { useState, useEffect } from "react";
import { formatUnits } from "viem";

interface UserDepositCardProps {
  deposit: {
    id: string;
    vaultAddress: string;
    amount: number;
    chainId: number;
    riskScore: number;
    initialRiskScore: number;
    timestamp: number;
    txHash?: string;
  };
  address: `0x${string}`;
  currentChainId: number;
  onWithdraw: (vaultAddress: string, chainId: number, depositId?: string) => Promise<void>;
  getUserVaultBalance: (vaultAddress: string, chainId: number) => Promise<{ shares: bigint; assets: bigint; decimals: number } | null>;
}

export default function UserDepositCard({
  deposit,
  address,
  currentChainId,
  onWithdraw,
  getUserVaultBalance,
}: UserDepositCardProps) {
  const [balance, setBalance] = useState<{ shares: bigint; assets: bigint; decimals: number } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    loadBalance();
    // Actualizar balance cada 30 segundos
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, [deposit.vaultAddress, deposit.chainId]);

  const loadBalance = async () => {
    setLoadingBalance(true);
    const bal = await getUserVaultBalance(deposit.vaultAddress, deposit.chainId);
    setBalance(bal);
    setLoadingBalance(false);
  };

  const handleWithdrawClick = async () => {
    setWithdrawing(true);
    try {
      await onWithdraw(deposit.vaultAddress, deposit.chainId, deposit.id);
      // Recargar balance después del retiro
      await loadBalance();
    } finally {
      setWithdrawing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const chainName = deposit.chainId === 8453 ? 'Base' : deposit.chainId === 1 ? 'Ethereum' : `Chain ${deposit.chainId}`;
  const isCorrectChain = currentChainId === deposit.chainId;
  const hasBalance = balance && balance.assets > 0n;

  return (
    <div className="bg-white rounded-lg border-2 border-purple-200 p-4 hover:border-purple-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded">
              {chainName}
            </span>
            <span className="text-xs text-gray-500">
              {formatDate(deposit.timestamp)}
            </span>
          </div>
          
          <div className="font-mono text-sm text-gray-700 mb-2 break-all">
            Vault: {deposit.vaultAddress.slice(0, 8)}...{deposit.vaultAddress.slice(-6)}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Depositado</div>
              <div className="font-semibold text-gray-900">{deposit.amount.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Balance Actual</div>
              {loadingBalance ? (
                <div className="text-sm text-gray-400">Cargando...</div>
              ) : balance && balance.assets > 0n ? (
                <div className="font-semibold text-emerald-600">
                  {formatUnits(balance.assets, balance.decimals).slice(0, 8)}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Sin balance</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-gray-500">Riesgo inicial: </span>
              <span className={`font-semibold ${
                deposit.initialRiskScore >= 70 ? 'text-emerald-600' :
                deposit.initialRiskScore >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {deposit.initialRiskScore}/100
              </span>
            </div>
            {deposit.txHash && (
              <a
                href={`https://${deposit.chainId === 8453 ? 'basescan.org' : 'etherscan.io'}/tx/${deposit.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:text-purple-700 underline"
              >
                Ver TX
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {!isCorrectChain && (
            <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded text-center">
              Cambia a {chainName}
            </div>
          )}
          <button
            onClick={handleWithdrawClick}
            disabled={!hasBalance || withdrawing || !isCorrectChain}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
          >
            {withdrawing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Retirando...
              </>
            ) : !hasBalance ? (
              "Sin balance"
            ) : (
              "💸 Retirar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

