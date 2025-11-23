"use client";

import { useState, useEffect } from "react";
import { parseUnits, createWalletClient, custom, http, createPublicClient, formatUnits, encodeFunctionData } from "viem";
import { mainnet, base } from "viem/chains";
import TemperatureGauge from "./components/TemperatureGauge";
import WalletButton from "./components/WalletButton";
import UserDepositCard from "./components/UserDepositCard";
import WithdrawButton from "./components/WithdrawButton";
import { MORPHO_VAULT_ABI, ERC20_ABI } from "./utils/morpho-vault";
import { useNotifications } from "./components/Notification";

// Extender Window para incluir ethereum (definición completa en WalletButton.tsx)

// Forzar renderizado dinámico (no pre-renderizar en build)
export const dynamic = 'force-dynamic';

interface Vault {
  id: string;
  name: string;
  address?: string;
  protocol: string;
  tvl?: number;
  apy?: number;
  description?: string;
  asset?: string;
  minDeposit?: number;
  chain?: string;
  chainId?: number;
  image?: string;
}

interface VaultRisk {
  score: number;
  reason: string;
  factors?: any;
  timestamp?: number;
  loading?: boolean;
  error?: string;
}

// Mapeo de chainId a nombre de cadena
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  137: "Polygon",
  42161: "Arbitrum",
};


export default function Home() {
  const { showNotification, NotificationContainer } = useNotifications();
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [isConnected, setIsConnected] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<number>(1);

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [filteredVaults, setFilteredVaults] = useState<Vault[]>([]);
  const [vaultRisks, setVaultRisks] = useState<Record<string, VaultRisk>>({});
  const [loading, setLoading] = useState(false);
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [vaultsError, setVaultsError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>("1"); // Por defecto Ethereum
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [userDeposits, setUserDeposits] = useState<any[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [showDepositsSection, setShowDepositsSection] = useState(false);
  const [vaultBalances, setVaultBalances] = useState<Record<string, { shares: bigint; assets: bigint; decimals: number }>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing' | 'success' | 'error'>('idle');
  const [withdrawingVaults, setWithdrawingVaults] = useState<Record<string, boolean>>({});

  // Escuchar cambios de red
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum && isConnected) {
      const handleChainChanged = (chainIdHex: string) => {
        const newChainId = parseInt(chainIdHex, 16);
        setCurrentChainId(newChainId);
      };

      window.ethereum.on?.('chainChanged', handleChainChanged);

      return () => {
        window.ethereum?.removeListener?.('chainChanged', handleChainChanged);
      };
    }
  }, [isConnected]);

  // Cargar vaults desde la API de Morpho al montar el componente
  const loadVaults = async () => {
    setLoadingVaults(true);
    setVaultsError("");
    try {
      const response = await fetch("/api/morpho-vaults", {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Error al obtener vaults: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.vaults && Array.isArray(data.vaults) && data.vaults.length > 0) {
        // Los vaults ya vienen con chain y chainId desde la API
        setVaults(data.vaults);
        setFilteredVaults(data.vaults);
      } else {
        throw new Error("No se encontraron vaults en la respuesta de la API");
      }
    } catch (error: any) {
      console.error("Error cargando vaults:", error);
      setVaultsError(error.message || "Error al cargar vaults de Morpho");
      setVaults([]);
      setFilteredVaults([]);
    } finally {
      setLoadingVaults(false);
    }
  };

  // Filtrar vaults por cadena
  useEffect(() => {
    if (selectedChain === "all") {
      setFilteredVaults(vaults);
    } else {
      const chainId = Number(selectedChain);
      setFilteredVaults(vaults.filter(v => v.chainId === chainId));
    }
  }, [selectedChain, vaults]);

  const evaluateVault = async (vault: Vault) => {
    setVaultRisks((prev) => ({
      ...prev,
      [vault.id]: { ...prev[vault.id], loading: true, error: undefined },
    }));

    try {
      const response = await fetch("/api/vault-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAddress: vault.address,
          vaultName: vault.name,
          protocol: vault.protocol,
          tvl: vault.tvl,
          apy: vault.apy,
          chainId: vault.chainId || 1,
          whitelisted: (vault as any).whitelisted || vault.description?.includes("Whitelisted"),
          curatorAddress: (vault as any).curatorAddress,
          hasRedWarning: (vault as any).hasRedWarning,
          hasYellowWarning: (vault as any).hasYellowWarning,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setVaultRisks((prev) => ({
          ...prev,
          [vault.id]: {
            score: 0,
            reason: result.error,
            loading: false,
            error: result.error,
          },
        }));
      } else {
        setVaultRisks((prev) => ({
          ...prev,
          [vault.id]: {
            score: result.score,
            reason: result.reason,
            factors: result.factors,
            timestamp: result.timestamp,
            loading: false,
          },
        }));
      }
    } catch (error: any) {
      setVaultRisks((prev) => ({
        ...prev,
        [vault.id]: {
          score: 0,
          reason: "Error al evaluar",
          loading: false,
          error: error.message,
        },
      }));
    }
  };

  const evaluateAllVaults = async () => {
    if (filteredVaults.length === 0) {
      await loadVaults();
      if (filteredVaults.length === 0) {
        return;
      }
    }
    
    setLoading(true);
    for (const vault of filteredVaults) {
      await evaluateVault(vault);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setLoading(false);
  };

  // Cargar vaults al montar el componente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadVaults();
    }
  }, []);

  // Removido: No analizar automáticamente, solo cuando el usuario presione "Analizar Todos"

  useEffect(() => {
    if (typeof window !== 'undefined' && autoRefresh) {
      const interval = setInterval(() => {
        evaluateAllVaults();
      }, 60000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const getRiskStatus = (score: number) => {
    if (score >= 70) return { label: "Bajo Riesgo", color: "green", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" };
    if (score >= 50) return { label: "Moderado", color: "yellow", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-800" };
    return { label: "Alto Riesgo", color: "red", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-800" };
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  };

  // Obtener cadenas únicas de los vaults
  const availableChains = Array.from(new Set(vaults.map(v => v.chainId).filter((id): id is number => id !== undefined && id !== null)));

  // Handlers para el componente WalletButton
  const handleWalletConnect = (walletAddress: `0x${string}`) => {
    setAddress(walletAddress);
    setIsConnected(true);
    // Obtener chainId actual
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_chainId' }).then((chainIdHex: string) => {
        setCurrentChainId(parseInt(chainIdHex, 16));
      });
    }
    // Cargar depósitos del usuario
    loadUserDeposits(walletAddress);
  };

  const handleWalletDisconnect = () => {
    setAddress(undefined);
    setIsConnected(false);
    setCurrentChainId(1);
    setUserDeposits([]);
    setShowDepositsSection(false);
  };

  // Cargar depósitos activos del usuario
  const loadUserDeposits = async (userAddress: `0x${string}`) => {
    setLoadingDeposits(true);
    try {
      const response = await fetch(`/api/deposits/user?userAddress=${userAddress}`);
      if (response.ok) {
        const data = await response.json();
        setUserDeposits(data.deposits || []);
      }
    } catch (error) {
      console.error("Error cargando depósitos:", error);
    } finally {
      setLoadingDeposits(false);
    }
  };

  // Obtener balance actual del usuario en un vault
  const getUserVaultBalance = async (vaultAddress: string, chainId: number): Promise<{ shares: bigint; assets: bigint; decimals: number } | null> => {
    if (!address || !window.ethereum) return null;

    try {
      const chain = chainId === 8453 ? base : mainnet;
      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      // Obtener shares del usuario
      const shares = await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: MORPHO_VAULT_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (shares === 0n) {
        return { shares: 0n, assets: 0n, decimals: 18 };
      }

      // Convertir shares a assets
      const assets = await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: MORPHO_VAULT_ABI,
        functionName: "convertToAssets",
        args: [shares],
      });

      // Obtener decimals del asset
      const assetAddress = await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: MORPHO_VAULT_ABI,
        functionName: "asset",
      });

      const decimals = await publicClient.readContract({
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18);

      return { shares, assets, decimals };
    } catch (error) {
      console.error("Error obteniendo balance del vault:", error);
      return null;
    }
  };

  // Función para retirar fondos
  const handleWithdraw = async (vaultAddress: string, chainId: number, depositId?: string) => {
    if (!isConnected || !address) {
      showNotification("Por favor conecta tu wallet primero", "warning");
      return;
    }

    try {
      // Verificar y cambiar de red si es necesario
      if (currentChainId !== chainId) {
        showNotification(
          `Cambiando a ${chainId === 8453 ? 'Base' : 'Ethereum'}...`,
          "info"
        );
        const switched = await switchToChain(chainId);
        if (!switched) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Obtener balance actual
      const balance = await getUserVaultBalance(vaultAddress, chainId);
      if (!balance || balance.assets === 0n) {
        showNotification("No tienes fondos para retirar en este vault", "warning");
        return;
      }

      const chain = chainId === 8453 ? base : mainnet;
      const walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum!),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      // Ejecutar retiro (retirar todos los assets)
      const withdrawHash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: MORPHO_VAULT_ABI,
        functionName: "withdraw",
        args: [balance.assets, address, address], // assets, receiver, owner
        account: address,
      });

      // Esperar confirmación
      const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

      if (receipt.status === 'success') {
        showNotification(
          `Retiro exitoso! TX: ${withdrawHash.slice(0, 10)}...`,
          "success",
          8000
        );

        // Actualizar lista de depósitos
        if (address) {
          await loadUserDeposits(address);
        }
      } else {
        showNotification("Error: La transacción falló", "error");
      }
    } catch (error: any) {
      console.error("Error al retirar:", error);
      if (error.message?.includes("user rejected") || error.message?.includes("User rejected")) {
        showNotification("Transacción cancelada por el usuario", "warning");
      } else {
        showNotification(
          `Error al retirar: ${error.message || "Error desconocido"}`,
          "error",
          8000
        );
      }
    }
  };

  // Función auxiliar para conectar wallet (usada en el modal)
  const connectWallet = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.ethereum) {
      showNotification("Por favor instala MetaMask u otro wallet compatible", "error");
      return false;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        handleWalletConnect(accounts[0] as `0x${string}`);
        // Obtener chainId actual
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setCurrentChainId(parseInt(chainIdHex as string, 16));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error("Error conectando wallet:", error);
      if (error.code === 4001) {
        showNotification("Conexión rechazada por el usuario", "warning");
      } else {
        showNotification("Error al conectar wallet", "error");
      }
      return false;
    }
  };

  // Función para cambiar de red automáticamente
  const switchToChain = async (targetChainId: number): Promise<boolean> => {
    if (!window.ethereum) {
      showNotification("Wallet no disponible", "error");
      return false;
    }

    try {
      // Intentar cambiar de red
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
      
      setCurrentChainId(targetChainId);
      return true;
    } catch (switchError: any) {
      // Si la red no está agregada, intentar agregarla
      if (switchError.code === 4902) {
        try {
          const chainConfig = targetChainId === 8453 ? {
            chainId: `0x${targetChainId.toString(16)}`,
            chainName: 'Base',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org'],
          } : {
            chainId: `0x${targetChainId.toString(16)}`,
            chainName: 'Ethereum Mainnet',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://eth.llamarpc.com'],
            blockExplorerUrls: ['https://etherscan.io'],
          };

          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [chainConfig],
          });

          setCurrentChainId(targetChainId);
          return true;
        } catch (addError) {
          console.error("Error agregando red:", addError);
          showNotification(
            `Error al agregar la red. Por favor cambia manualmente a ${targetChainId === 8453 ? 'Base' : 'Ethereum'} en tu wallet`,
            "error"
          );
          return false;
        }
      } else {
        console.error("Error cambiando de red:", switchError);
        showNotification(
          `Por favor cambia manualmente a ${targetChainId === 8453 ? 'Base' : 'Ethereum'} en tu wallet`,
          "error"
        );
        return false;
      }
    }
  };

  // Función para manejar depósito
  const handleDeposit = (vault: Vault, riskScore: number) => {
    // Mostrar el modal directamente - el modal manejará la conexión de wallet
    setSelectedVault(vault);
    setDepositAmount("");
    setShowDepositModal(true);
  };

  // Función para confirmar depósito (ahora deposita directamente)
  const confirmDeposit = async () => {
    if (!selectedVault || !depositAmount || parseFloat(depositAmount) <= 0) {
      showNotification("Por favor ingresa una cantidad válida", "warning");
      return;
    }

    // Verificar que la wallet esté conectada
    if (!isConnected || !address) {
      showNotification("Por favor conecta tu wallet primero", "warning");
      setShowDepositModal(false);
      await connectWallet();
      return;
    }

    if (!selectedVault.address) {
      showNotification("Error: No se encontró la dirección del vault", "error");
      return;
    }

    setDepositStep('idle');

    try {
      const vaultAddress = selectedVault.address as `0x${string}`;
      const targetChainId = selectedVault.chainId || 1;
      const chain = targetChainId === 8453 ? base : mainnet;
      
      if (!window.ethereum) {
        showNotification("Wallet no disponible", "error");
        return;
      }

      // Verificar y cambiar de red si es necesario
      if (currentChainId !== targetChainId) {
        showNotification(
          `Cambiando a ${targetChainId === 8453 ? 'Base' : 'Ethereum'}...`,
          "info"
        );
        const switched = await switchToChain(targetChainId);
        if (!switched) {
          setDepositStep('error');
          return; // El usuario canceló o hubo error
        }
        // Esperar un momento para que la red se actualice
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      // Obtener el asset del vault para determinar si es ETH o ERC20
      const assetAddress = await publicClient.readContract({
        address: vaultAddress,
        abi: MORPHO_VAULT_ABI,
        functionName: "asset",
      });

      const decimals = await publicClient.readContract({
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18); // Default a 18 si falla

      const amountInWei = parseUnits(depositAmount, decimals);

      // Verificar balance del usuario
      const userBalance = await publicClient.readContract({
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (userBalance < amountInWei) {
        showNotification(
          `Balance insuficiente. Tienes ${formatUnits(userBalance, decimals)} tokens`,
          "error"
        );
        setDepositStep('error');
        return;
      }

      // Si es un token ERC20 (no ETH nativo), necesitamos hacer approve primero
      const isETH = assetAddress === "0x0000000000000000000000000000000000000000" || 
                    assetAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
      
      if (!isETH) {
        // Verificar allowance
        const allowance = await publicClient.readContract({
          address: assetAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, vaultAddress],
        });

        if (allowance < amountInWei) {
          // Hacer approve
          const approveHash = await walletClient.writeContract({
            address: assetAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [vaultAddress, amountInWei],
            account: address,
          });

          // Esperar confirmación del approve
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      // Hacer el depósito - PASO 2
      setDepositStep('depositing');
      showNotification("Paso 2/2: Depositando en el vault...", "info");
      
      let depositHash: `0x${string}`;
      
      if (isETH) {
        // Depósito de ETH nativo - usar sendTransaction en lugar de writeContract para ETH
        depositHash = await walletClient.sendTransaction({
          to: vaultAddress,
          value: amountInWei,
          account: address,
          data: encodeFunctionData({
            abi: MORPHO_VAULT_ABI,
            functionName: "deposit",
            args: [amountInWei, address],
          }),
        });
      } else {
        // Depósito de token ERC20
        depositHash = await walletClient.writeContract({
          address: vaultAddress,
          abi: MORPHO_VAULT_ABI,
          functionName: "deposit",
          args: [amountInWei, address],
          account: address,
        });
      }

      // Esperar confirmación
      showNotification("Esperando confirmación del depósito...", "info");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });

      if (receipt.status === 'success') {
        setDepositStep('success');
        
        // Registrar el depósito en nuestro sistema para monitoreo automático
        const registerResponse = await fetch("/api/register-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaultAddress: selectedVault.address,
            userAddress: address,
            amount: depositAmount,
            riskScore: vaultRisks[selectedVault.id]?.score || 50,
            chainId: selectedVault.chainId || 1,
            txHash: depositHash,
          }),
        });

        if (registerResponse.ok) {
          const data = await registerResponse.json();
          showNotification(
            `✅ Depósito exitoso! TX: ${depositHash.slice(0, 10)}... Será monitoreado automáticamente.`,
            "success",
            8000
          );
          // Recargar depósitos del usuario
          if (address) {
            await loadUserDeposits(address);
            setShowDepositsSection(true); // Mostrar sección de depósitos
          }
          // Actualizar balance del vault inmediatamente
          if (selectedVault.address) {
            const balanceKey = `${selectedVault.address}-${selectedVault.chainId || 1}`;
            // Esperar un momento para que el balance se actualice en la blockchain
            setTimeout(async () => {
              const newBalance = await getUserVaultBalance(selectedVault.address!, selectedVault.chainId || 1);
              if (newBalance) {
                setVaultBalances((prev) => ({ ...prev, [balanceKey]: newBalance }));
              }
            }, 2000);
          }
        } else {
          showNotification(
            `✅ Depósito exitoso! TX: ${depositHash.slice(0, 10)}... No se pudo registrar para monitoreo.`,
            "warning",
            8000
          );
        }

        // Cerrar modal después de un breve delay
        setTimeout(() => {
          setShowDepositModal(false);
          setDepositAmount("");
          setDepositStep('idle');
        }, 2000);
      } else {
        setDepositStep('error');
        showNotification("Error: La transacción falló", "error");
      }
    } catch (error: any) {
      console.error("Error al depositar:", error);
      setDepositStep('error');
      if (error.message?.includes("user rejected") || error.message?.includes("User rejected")) {
        showNotification("Transacción cancelada por el usuario", "warning");
      } else if (error.message?.includes("chain") || error.message?.includes("Chain")) {
        showNotification(
          `Error de red: ${error.message}. Por favor verifica que estés en la red correcta.`,
          "error",
          8000
        );
      } else {
        showNotification(
          `Error al depositar: ${error.message || "Error desconocido"}`,
          "error",
          8000
        );
      }
    }
  };

  return (
    <>
      <NotificationContainer />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Mejorado */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                DeFi Risk Oracle
              </h1>
              <p className="text-gray-600 text-lg max-w-2xl mb-4">
                Evaluación de riesgo en tiempo real usando Chainlink Data Feeds (on-chain) y OpenAI. 
                Compara y analiza vaults de yield con evaluación de riesgo impulsada por IA.
              </p>
              
              {/* Información sobre la evaluación */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Utiliza Chainlink Data Feeds para precios on-chain (descentralizado y confiable)</li>
                  <li>• Datos de TVL desde DeFiLlama</li>
                  <li>• Evaluación con OpenAI GPT-4o-mini (si está configurado)</li>
                  <li>• Score de 0-100: &lt;50 Riesgoso, 50-70 Moderado, &gt;70 Seguro</li>
                  <li>• Los datos se actualizan en cada ejecución</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {/* Componente de Wallet */}
              <div className="flex items-center justify-end">
                <WalletButton 
                  onConnect={handleWalletConnect}
                  onDisconnect={handleWalletDisconnect}
                />
              </div>
              
              {/* Botón para ver depósitos */}
              {isConnected && address && (
                <button
                  onClick={() => {
                    setShowDepositsSection(!showDepositsSection);
                    if (!showDepositsSection && address) {
                      loadUserDeposits(address);
                    }
                  }}
                  className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold hover:bg-purple-200 transition-colors flex items-center gap-2"
                >
                  {showDepositsSection ? "👁️ Ocultar" : "💰 Mis Depósitos"}
                  {userDeposits.length > 0 && (
                    <span className="px-2 py-0.5 bg-purple-200 rounded-full text-xs">
                      {userDeposits.length}
                    </span>
                  )}
                </button>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={loadVaults}
                  disabled={loadingVaults}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingVaults ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Cargando...
                    </>
                  ) : (
                    "📥 Cargar Vaults"
                  )}
                </button>
                <button
                  onClick={evaluateAllVaults}
                  disabled={loading || filteredVaults.length === 0}
                  className="px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-semibold hover:from-gray-800 hover:to-gray-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analizando...
                    </>
                  ) : (
                    "🔄 Analizar Todos"
                  )}
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-lg ${
                    autoRefresh
                      ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-700 hover:to-green-700"
                      : "bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {autoRefresh ? "⏸️ Auto ON" : "▶️ Auto OFF"}
                </button>
              </div>
              
              {/* Filtro por cadena */}
              {vaults.length > 0 && (
                <div className="flex items-center gap-3 mt-2">
                  <label className="text-sm font-medium text-gray-700">Filtrar por cadena:</label>
                  <select
                    value={selectedChain}
                    onChange={(e) => setSelectedChain(e.target.value)}
                    className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="all">Todas las cadenas</option>
                    {availableChains.map((chainId) => (
                      <option key={chainId} value={chainId.toString()}>
                        {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                      </option>
                    ))}
                  </select>
                  {selectedChain !== "all" && (
                    <span className="text-sm text-gray-600">
                      ({filteredVaults.length} vault{filteredVaults.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mensaje de error o carga */}
        {loadingVaults && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl text-center">
            <div className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-blue-800 font-medium">Cargando vaults desde la API de Morpho...</span>
            </div>
          </div>
        )}

        {vaultsError && !loadingVaults && (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Error al cargar vaults</h3>
                <p className="text-red-800 text-sm mb-3">{vaultsError}</p>
                <button
                  onClick={loadVaults}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        )}

        {!loadingVaults && !vaultsError && filteredVaults.length === 0 && (
          <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
            <p className="text-yellow-800 font-medium">
              {selectedChain === "all" 
                ? "No se encontraron vaults. Haz clic en \"Cargar Vaults\" para obtenerlos desde la API de Morpho."
                : `No se encontraron vaults en ${CHAIN_NAMES[Number(selectedChain)] || selectedChain}. Intenta con otra cadena.`
              }
            </p>
          </div>
        )}

        {/* Lista de Vaults (Estilo Morpho) */}
        {filteredVaults.length > 0 && (
          <div className="space-y-3">
            {filteredVaults.map((vault) => {
              const risk = vaultRisks[vault.id];
              const isLoading = risk?.loading || false;
              const riskStatus = risk?.score !== undefined ? getRiskStatus(risk.score) : null;

              return (
                <div
                  key={vault.id}
                  className={`bg-white rounded-xl border ${
                    riskStatus?.border || "border-gray-200"
                  } transition-all duration-200 hover:shadow-md hover:border-gray-300`}
                >
                  <div className="p-4 flex items-center gap-4">
                    {/* Icono/Imagen */}
                    <div className="flex-shrink-0">
                      {vault.image ? (
                        <img
                          src={vault.image}
                          alt={vault.name}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-12 h-12 bg-gradient-to-br from-gray-900 to-gray-700 rounded-lg flex items-center justify-center font-bold text-white text-sm ${vault.image ? 'hidden' : 'flex'}`}
                      >
                        {vault.asset || vault.name.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Información principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {vault.address ? (
                          <a
                            href={`https://app.morpho.org/${vault.chainId === 8453 ? 'base' : 'ethereum'}/vault/${vault.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base font-semibold text-gray-900 truncate hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                            title={`Ver vault en Morpho: ${vault.name}`}
                          >
                            {vault.name}
                          </a>
                        ) : (
                          <h3 className="text-base font-semibold text-gray-900 truncate">{vault.name}</h3>
                        )}
                        {vault.chain && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                            {vault.chain}
                          </span>
                        )}
                        {riskStatus && (
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskStatus.badge}`}>
                            {riskStatus.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {vault.apy && (
                          <span className="font-medium text-emerald-600">{vault.apy.toFixed(2)}% APY</span>
                        )}
                        {vault.tvl && (
                          <span>{formatCurrency(vault.tvl)} TVL</span>
                        )}
                        {risk && !isLoading && (
                          <span className={`font-medium ${riskStatus?.text || "text-gray-600"}`}>
                            Score: {risk.score}/100
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Medidor de temperatura */}
                    <div className="flex-shrink-0">
                      {risk?.score !== undefined && !isLoading ? (
                        <TemperatureGauge score={risk.score} size="sm" showLabel={false} showScore={false} />
                      ) : isLoading ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-gray-900"></div>
                      ) : (
                        <button
                          onClick={() => evaluateVault(vault)}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Analizar
                        </button>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {risk && !isLoading ? (
                        risk.score < 50 ? (
                          <button
                            disabled
                            className="px-4 py-2 bg-gray-200 text-gray-500 rounded-lg text-sm font-semibold cursor-not-allowed"
                          >
                            Bloqueado
                          </button>
                        ) : (
                          <>
                            {risk.score >= 50 && risk.score < 70 ? (
                              <button
                                onClick={() => handleDeposit(vault, risk.score)}
                                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
                              >
                                Depositar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeposit(vault, risk.score)}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                              >
                                Depositar
                              </button>
                            )}
                            {/* Botón de Retirar - solo si el usuario tiene balance */}
                            {isConnected && address && vault.address && (
                              <WithdrawButton
                                vaultAddress={vault.address}
                                chainId={vault.chainId || 1}
                                currentChainId={currentChainId}
                                onWithdraw={handleWithdraw}
                                getUserVaultBalance={getUserVaultBalance}
                                vaultBalances={vaultBalances}
                                loadingBalances={loadingBalances}
                                setVaultBalances={setVaultBalances}
                                setLoadingBalances={setLoadingBalances}
                              />
                            )}
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Depósito */}
        {showDepositModal && selectedVault && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Depositar en {selectedVault.name}</h2>
                <button
                  onClick={() => {
                    if (depositStep === 'idle' || depositStep === 'error' || depositStep === 'success') {
                      setShowDepositModal(false);
                      setDepositAmount("");
                      setDepositStep('idle');
                    }
                  }}
                  disabled={depositStep === 'approving' || depositStep === 'depositing'}
                  className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ×
                </button>
              </div>

              {/* Indicador de progreso */}
              {(depositStep === 'approving' || depositStep === 'depositing') && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <div>
                      <div className="font-semibold text-blue-900">
                        {depositStep === 'approving' ? 'Paso 1/2: Aprobando gasto...' : 'Paso 2/2: Depositando...'}
                      </div>
                      <div className="text-sm text-blue-700">
                        {depositStep === 'approving' 
                          ? 'Confirma la transacción en tu wallet para aprobar el gasto del token'
                          : 'Confirma la transacción en tu wallet para completar el depósito'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {depositStep === 'success' && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <div className="font-semibold text-emerald-900">Depósito exitoso!</div>
                      <div className="text-sm text-emerald-700">El modal se cerrará automáticamente...</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">APY:</span>
                    <span className="font-semibold text-emerald-600">
                      {selectedVault.apy ? `${selectedVault.apy.toFixed(2)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">TVL:</span>
                    <span className="font-semibold">
                      {selectedVault.tvl ? formatCurrency(selectedVault.tvl) : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Score de Riesgo:</span>
                    <span className={`font-semibold ${
                      vaultRisks[selectedVault.id]?.score 
                        ? vaultRisks[selectedVault.id].score >= 70 
                          ? "text-emerald-600" 
                          : vaultRisks[selectedVault.id].score >= 50 
                          ? "text-amber-600" 
                          : "text-red-600"
                        : "text-gray-600"
                    }`}>
                      {vaultRisks[selectedVault.id]?.score || "N/A"}/100
                    </span>
                  </div>
                </div>

                {!isConnected ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 mb-3">
                      ⚠️ Necesitas conectar tu wallet para continuar
                    </p>
                    <button
                      onClick={async () => {
                        const connected = await connectWallet();
                        if (!connected) {
                          setShowDepositModal(false);
                        }
                      }}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Conectar Wallet
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-600">Wallet conectada:</span>
                        <span className="text-sm font-mono text-gray-900">
                          {address?.slice(0, 6)}...{address?.slice(-4)}
                        </span>
                      </div>
                    </div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cantidad a depositar ({selectedVault.asset || "tokens"})
                    </label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-800">
                  ℹ️ Tu depósito será monitoreado automáticamente. Si el riesgo aumenta, se ejecutará un retiro automático para proteger tus fondos.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeposit}
                  disabled={
                    !isConnected || 
                    !depositAmount || 
                    parseFloat(depositAmount) <= 0 ||
                    depositStep === 'approving' ||
                    depositStep === 'depositing'
                  }
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {depositStep === 'approving' ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Aprobando...
                    </>
                  ) : depositStep === 'depositing' ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Depositando...
                    </>
                  ) : depositStep === 'success' ? (
                    "✅ Completado"
                  ) : !isConnected ? (
                    "Conecta Wallet"
                  ) : (
                    "Depositar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Info mejorado */}
        <div className="mt-16 bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-8">Understanding Risk Levels</h3>
          
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="p-6 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border-2 border-emerald-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-emerald-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-emerald-900 text-lg">Low Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 70-100. Funds with excellent security and stability.</p>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-amber-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-amber-900 text-lg">Moderate Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 50-69. Funds with acceptable risk levels. Proceed with caution.</p>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-200 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 bg-rose-500 rounded-full shadow-lg"></div>
                <span className="font-bold text-rose-900 text-lg">High Risk</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">Score 0-49. Funds with significant risk. Not recommended for deposits.</p>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-4">Cómo funciona la evaluación de riesgo:</h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-2">📊 Factores evaluados:</p>
                <ul className="space-y-1 list-disc list-inside ml-2">
                  <li>TVL del vault y su estabilidad</li>
                  <li>Caída de TVL en las últimas horas</li>
                  <li>Número de depositantes</li>
                  <li>APY y su razonabilidad</li>
                  <li>Estado whitelisted</li>
                  <li>Confiabilidad del curator</li>
                  <li>Warnings del sistema Morpho</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-2">🔒 Fuentes de datos:</p>
                <ul className="space-y-1 list-disc list-inside ml-2">
                  <li>Chainlink Data Feeds (on-chain)</li>
                  <li>API de Morpho (GraphQL)</li>
                  <li>DeFiLlama para TVL del ecosistema</li>
                  <li>OpenAI GPT-4o-mini para análisis avanzado</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
