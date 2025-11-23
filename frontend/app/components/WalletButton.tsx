"use client";

import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { mainnet, base } from "viem/chains";

interface WalletButtonProps {
  onConnect?: (address: `0x${string}`) => void;
  onDisconnect?: () => void;
}

export default function WalletButton({ onConnect, onDisconnect }: WalletButtonProps) {
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [balance, setBalance] = useState<string>("0");
  const [chainId, setChainId] = useState<number>(1);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Verificar si ya hay una wallet conectada al cargar
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      checkConnection();
      
      // Escuchar cambios de cuenta
      if (window.ethereum.on) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        
        return () => {
          if (window.ethereum?.removeListener) {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
          }
        };
      }
    }
  }, []);

  // Actualizar balance cuando cambia la dirección o chain
  useEffect(() => {
    if (address && window.ethereum) {
      updateBalance();
      const interval = setInterval(updateBalance, 10000); // Actualizar cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [address, chainId]);

  const checkConnection = async () => {
    if (!window.ethereum) return;
    
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0] as `0x${string}`);
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainId as string, 16));
        onConnect?.(accounts[0] as `0x${string}`);
      }
    } catch (error) {
      console.error("Error verificando conexión:", error);
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      // Wallet desconectada
      setAddress(undefined);
      setBalance("0");
      onDisconnect?.();
    } else {
      setAddress(accounts[0] as `0x${string}`);
      onConnect?.(accounts[0] as `0x${string}`);
    }
  };

  const handleChainChanged = (chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    setChainId(newChainId);
    // Recargar la página para evitar problemas de estado
    window.location.reload();
  };

  const updateBalance = async () => {
    if (!address || !window.ethereum) return;

    try {
      const balanceHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      const balanceWei = BigInt(balanceHex as string);
      const balanceEth = formatUnits(balanceWei, 18);
      setBalance(parseFloat(balanceEth).toFixed(4));
    } catch (error) {
      console.error("Error obteniendo balance:", error);
    }
  };

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert("Por favor instala MetaMask u otro wallet compatible");
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        const addr = accounts[0] as `0x${string}`;
        setAddress(addr);
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex as string, 16));
        onConnect?.(addr);
      }
    } catch (error: any) {
      console.error("Error conectando wallet:", error);
      if (error.code === 4001) {
        alert("Conexión rechazada por el usuario");
      } else {
        alert("Error al conectar wallet");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAddress(undefined);
    setBalance("0");
    setShowMenu(false);
    onDisconnect?.();
  };

  const getChainName = () => {
    if (chainId === 1) return "Ethereum";
    if (chainId === 8453) return "Base";
    if (chainId === 137) return "Polygon";
    if (chainId === 42161) return "Arbitrum";
    return `Chain ${chainId}`;
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!address) {
    return (
      <button
        onClick={connectWallet}
        disabled={isConnecting}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isConnecting ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Conectando...
          </>
        ) : (
          <>
            🔗 Conectar Wallet
          </>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-200 transition-colors flex items-center gap-2"
      >
        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
        {formatAddress(address)}
        <svg
          className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <>
          {/* Overlay para cerrar el menú */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          ></div>
          
          {/* Menú desplegable */}
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Conectado como</span>
                <button
                  onClick={disconnectWallet}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Desconectar
                </button>
              </div>
              <div className="font-mono text-sm font-semibold text-gray-900 break-all">
                {address}
              </div>
            </div>

            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Balance</span>
                <span className="text-xs text-gray-500">{getChainName()}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{balance}</span>
                <span className="text-sm text-gray-600">
                  {chainId === 1 ? "ETH" : chainId === 8453 ? "ETH" : "ETH"}
                </span>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>Red</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 font-medium">
                  {getChainName()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Chain ID</span>
                <span className="font-mono">{chainId}</span>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <a
                href={`https://${chainId === 1 ? '' : chainId === 8453 ? 'basescan.org' : 'etherscan.io'}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                Ver en Explorer
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

