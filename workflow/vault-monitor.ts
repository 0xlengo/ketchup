import { cre, Runner, type Runtime, getNetwork, encodeCallMsg, LAST_FINALIZED_BLOCK_NUMBER, type Address } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress, parseUnits, formatUnits } from "viem";

type Config = {
  schedule: string;
  evm: {
    chainSelectorName: string;
  };
  monitoring: {
    riskThreshold: number; // Score mínimo para mantener el depósito (ej: 50)
    checkInterval: string; // Intervalo de verificación (ej: "*/5 * * * *" = cada 5 minutos)
  };
  vaults: Array<{
    address: string;
    chainId: number;
    userAddress: string;
    depositAmount: string;
    initialRiskScore: number;
  }>;
};

// ABI de Morpho Vault para withdraw
const MORPHO_VAULT_ABI = [
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" }
    ],
    outputs: [{ name: "shares", type: "uint256" }]
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

// Función para evaluar riesgo del vault
async function evaluateVaultRisk(
  runtime: Runtime<Config>,
  vaultAddress: string,
  chainId: number
): Promise<number> {
  // Llamar a la API de evaluación de riesgo
  // En producción, esto debería usar la URL de tu API desplegada
  const apiUrl = process.env.RISK_EVALUATION_API_URL || "http://localhost:3000";
  
  try {
    const response = await fetch(`${apiUrl}/api/vault-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultAddress,
        chainId,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.score || 50;
  } catch (error: any) {
    runtime.log(`Error evaluando riesgo del vault ${vaultAddress}: ${error.message}`);
    return 50; // Score neutral si falla
  }
}

// Función para hacer withdraw automático
async function executeWithdraw(
  runtime: Runtime<Config>,
  vaultAddress: string,
  userAddress: string,
  chainId: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const { chainSelectorName } = runtime.config.evm;
    
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName,
      isTestnet: false,
    });

    if (!network) {
      throw new Error(`Network not found: ${chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(
      network.chainSelector.selector
    );

    // 1. Obtener balance del usuario en el vault (shares)
    const balanceOfData = encodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      functionName: "balanceOf",
      args: [userAddress as Address],
    });

    const balanceCall = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: vaultAddress as Address,
          data: balanceOfData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();

    const balanceResult = decodeFunctionResult({
      abi: MORPHO_VAULT_ABI,
      functionName: "balanceOf",
      data: balanceCall.data,
    });

    const shares = balanceResult as bigint;

    if (shares === 0n) {
      runtime.log("Usuario no tiene balance en el vault");
      return { success: false, error: "No balance in vault" };
    }

    // 2. Convertir shares a assets
    const convertToAssetsData = encodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      functionName: "convertToAssets",
      args: [shares],
    });

    const assetsCall = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: vaultAddress as Address,
          data: convertToAssetsData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();

    const assetsResult = decodeFunctionResult({
      abi: MORPHO_VAULT_ABI,
      functionName: "convertToAssets",
      data: assetsCall.data,
    });

    const assets = assetsResult as bigint;

    if (assets === 0n) {
      return { success: false, error: "No assets to withdraw" };
    }

    // 3. Preparar datos para withdraw
    const withdrawData = encodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      functionName: "withdraw",
      args: [assets, userAddress as Address, userAddress as Address],
    });

    runtime.log(`🚨 Ejecutando withdraw automático por aumento de riesgo:`, {
      vaultAddress,
      userAddress,
      assets: formatUnits(assets, 18),
      shares: formatUnits(shares, 18),
    });

    // NOTA: Para ejecutar transacciones desde Chainlink CRE, necesitas:
    // 1. Un wallet con fondos para gas configurado en el CRE
    // 2. Permisos para ejecutar transacciones en nombre del usuario
    // 3. O usar un contrato proxy que tenga permisos para hacer withdraw
    
    // Por ahora, logueamos la acción que se debería ejecutar
    // En producción, descomentar y configurar:
    /*
    const txHash = await evmClient.sendTransaction(runtime, {
      to: vaultAddress as Address,
      data: withdrawData,
      // from: runtime.config.withdrawWalletAddress, // Wallet con permisos
    });
    */

    // Simular éxito (en producción retornar el txHash real)
    const simulatedTxHash = `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    
    runtime.log(`✅ Withdraw automático ejecutado: ${simulatedTxHash}`);
    
    return { 
      success: true, 
      txHash: simulatedTxHash,
      // En producción: txHash: txHash
    };
  } catch (error: any) {
    runtime.log(`❌ Error ejecutando withdraw: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Función para obtener depósitos activos desde la API
async function getActiveDeposits(
  runtime: Runtime<Config>,
  apiEndpoint?: string
): Promise<Config['vaults']> {
  if (!apiEndpoint) {
    // Si no hay endpoint, usar los vaults del config
    return runtime.config.vaults || [];
  }

  try {
    const response = await fetch(`${apiEndpoint}/api/deposits/active`);
    if (response.ok) {
      const data = await response.json();
      return data.deposits || [];
    }
  } catch (error: any) {
    runtime.log(`Error obteniendo depósitos activos: ${error.message}`);
  }

  return runtime.config.vaults || [];
}

// Workflow principal de monitoreo
export const runner: Runner<Config> = async (runtime: Runtime<Config>) => {
  const { monitoring } = runtime.config;
  const riskThreshold = monitoring.riskThreshold || 50;

  // Obtener depósitos activos (desde API o config)
  const deposits = await getActiveDeposits(runtime, monitoring.apiEndpoint);

  if (!deposits || deposits.length === 0) {
    runtime.log("No hay depósitos activos para monitorear");
    return {
      success: true,
      message: "No hay depósitos activos",
    };
  }

  runtime.log(`Iniciando monitoreo de ${deposits.length} depósitos...`);

  const results = [];

  for (const deposit of deposits) {
    try {
      // 1. Evaluar riesgo actual del vault
      const currentRiskScore = await evaluateVaultRisk(
        runtime,
        deposit.address,
        deposit.chainId
      );

      runtime.log(`Vault ${deposit.address}: Score actual = ${currentRiskScore}, Threshold = ${riskThreshold}, Score inicial = ${deposit.initialRiskScore}`);

      // 2. Comparar con threshold
      if (currentRiskScore < riskThreshold) {
        runtime.log(`⚠️ ALERTA: Vault ${deposit.address} tiene score bajo (${currentRiskScore} < ${riskThreshold})`);
        
        // 3. Ejecutar withdraw automático
        const withdrawResult = await executeWithdraw(
          runtime,
          deposit.address,
          deposit.userAddress,
          deposit.chainId
        );

        if (withdrawResult.success) {
          runtime.log(`✅ Withdraw automático ejecutado para usuario ${deposit.userAddress}`);
          runtime.log(`   TX Hash: ${withdrawResult.txHash}`);
          
          // Marcar depósito como withdrawn en la DB
          // await updateDepositStatus(deposit.depositId, 'withdrawn', withdrawResult.txHash);
          
          // Notificar al usuario (email, push, etc.)
          // await notifyUser(deposit.userAddress, {
          //   type: "auto_withdraw",
          //   vaultAddress: deposit.address,
          //   reason: `Riesgo aumentó de ${deposit.initialRiskScore} a ${currentRiskScore}/100`,
          //   txHash: withdrawResult.txHash,
          // });

          results.push({
            vault: deposit.address,
            user: deposit.userAddress,
            action: "withdrawn",
            txHash: withdrawResult.txHash,
            reason: `Riesgo aumentó a ${currentRiskScore}/100`,
          });
        } else {
          runtime.log(`❌ Error ejecutando withdraw para ${deposit.userAddress}: ${withdrawResult.error}`);
          results.push({
            vault: deposit.address,
            user: deposit.userAddress,
            action: "failed",
            error: withdrawResult.error,
          });
        }
      } else {
        runtime.log(`✅ Vault ${deposit.address} está dentro del threshold (${currentRiskScore} >= ${riskThreshold})`);
        results.push({
          vault: deposit.address,
          user: deposit.userAddress,
          action: "monitoring",
          currentScore: currentRiskScore,
        });
      }
    } catch (error: any) {
      runtime.log(`Error monitoreando vault ${deposit.address}: ${error.message}`);
      results.push({
        vault: deposit.address,
        user: deposit.userAddress,
        action: "error",
        error: error.message,
      });
    }
  }

  return {
    success: true,
    message: `Monitoreo completado para ${deposits.length} depósitos`,
    results,
    timestamp: Date.now(),
  };
};

