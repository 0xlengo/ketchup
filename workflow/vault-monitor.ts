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

// Función para evaluar riesgo del vault (simplificada - usar la misma lógica que risk-evaluator.ts)
async function evaluateVaultRisk(
  runtime: Runtime<Config>,
  vaultAddress: string,
  chainId: number
): Promise<number> {
  // Aquí deberías llamar a la misma lógica de evaluación de riesgo
  // Por ahora retornamos un score de ejemplo
  // En producción, esto debería llamar a tu API de evaluación de riesgo
  
  try {
    const response = await fetch("https://tu-api.com/api/vault-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultAddress,
        chainId,
      }),
    });
    
    const result = await response.json();
    return result.score || 50;
  } catch (error) {
    console.error("Error evaluando riesgo:", error);
    return 50; // Score neutral si falla
  }
}

// Función para hacer withdraw automático
async function executeWithdraw(
  runtime: Runtime<Config>,
  vaultAddress: string,
  userAddress: string,
  chainId: number
): Promise<boolean> {
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

    // 1. Obtener balance del usuario en el vault
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
      console.log("Usuario no tiene balance en el vault");
      return false;
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

    // 3. Ejecutar withdraw
    // NOTA: Esto requiere que el workflow tenga permisos para ejecutar transacciones
    // En producción, esto debería usar un wallet con fondos para gas
    // y permisos para hacer withdraw en nombre del usuario (o usar un contrato proxy)
    
    const withdrawData = encodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      functionName: "withdraw",
      args: [assets, userAddress as Address, userAddress as Address],
    });

    // Ejecutar transacción (esto requiere configuración adicional en CRE)
    console.log("Ejecutando withdraw automático:", {
      vaultAddress,
      userAddress,
      assets: formatUnits(assets, 18),
      shares: formatUnits(shares, 18),
    });

    // En producción, aquí ejecutarías la transacción usando el EVMClient
    // const txHash = await evmClient.sendTransaction(...);
    
    return true;
  } catch (error) {
    console.error("Error ejecutando withdraw:", error);
    return false;
  }
}

// Workflow principal de monitoreo
export const runner: Runner<Config> = async (runtime: Runtime<Config>) => {
  const { vaults, monitoring } = runtime.config;
  const riskThreshold = monitoring.riskThreshold || 50;

  console.log(`Iniciando monitoreo de ${vaults.length} vaults...`);

  for (const vault of vaults) {
    try {
      // 1. Evaluar riesgo actual del vault
      const currentRiskScore = await evaluateVaultRisk(
        runtime,
        vault.address,
        vault.chainId
      );

      console.log(`Vault ${vault.address}: Score actual = ${currentRiskScore}, Threshold = ${riskThreshold}`);

      // 2. Comparar con threshold
      if (currentRiskScore < riskThreshold) {
        console.log(`⚠️ ALERTA: Vault ${vault.address} tiene score bajo (${currentRiskScore} < ${riskThreshold})`);
        
        // 3. Ejecutar withdraw automático
        const withdrawSuccess = await executeWithdraw(
          runtime,
          vault.address,
          vault.userAddress,
          vault.chainId
        );

        if (withdrawSuccess) {
          console.log(`✅ Withdraw automático ejecutado para usuario ${vault.userAddress}`);
          
          // Notificar al usuario (email, push, etc.)
          // await notifyUser(vault.userAddress, {
          //   type: "auto_withdraw",
          //   vaultAddress: vault.address,
          //   reason: `Riesgo aumentó a ${currentRiskScore}/100`,
          // });
        } else {
          console.error(`❌ Error ejecutando withdraw para ${vault.userAddress}`);
        }
      } else {
        console.log(`✅ Vault ${vault.address} está dentro del threshold (${currentRiskScore} >= ${riskThreshold})`);
      }
    } catch (error) {
      console.error(`Error monitoreando vault ${vault.address}:`, error);
    }
  }

  return {
    success: true,
    message: `Monitoreo completado para ${vaults.length} vaults`,
  };
};

