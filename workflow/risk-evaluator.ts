import { cre, Runner, type Runtime, prepareReportRequest, getNetwork, type HTTPSendRequester, ok, text, consensusMedianAggregation } from "@chainlink/cre-sdk";
import { encodeFunctionData, zeroAddress, type Address } from "viem";

type Config = {
  schedule: string;
  evm: {
    chainSelectorName: string;
    contractAddress: string;
  };
};

// ABI del contrato RiskOracle
const RISK_ORACLE_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "score", type: "uint256" },
      { internalType: "string", name: "reason", type: "string" }
    ],
    name: "updateRiskScore",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Función para obtener datos de precio
const fetchPriceData = (sendRequester: HTTPSendRequester) => {
  const response = sendRequester
    .sendRequest({ 
      url: "https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=usd",
      method: "GET" 
    })
    .result();

  if (!ok(response)) {
    throw new Error(`Price API failed with status: ${response.statusCode}`);
  }

  return JSON.parse(text(response));
};

// Función para obtener datos de TVL
const fetchTVLData = (sendRequester: HTTPSendRequester) => {
  const response = sendRequester
    .sendRequest({ 
      url: "https://api.llama.fi/tvl/xusd",
      method: "GET" 
    })
    .result();

  if (!ok(response)) {
    return 0;
  }

  const tvlText = text(response);
  return tvlText ? Number.parseFloat(tvlText) : 0;
};

// Calcular score de riesgo basado en los datos
const calculateRiskScore = (priceData: any, tvlData: number): { score: number; reason: string } => {
  let score = 50; // Score base
  const reasons: string[] = [];

  // Evaluar estabilidad de precio
  if (priceData && priceData.usd) {
    const price = priceData.usd.usd || 1;
    if (Math.abs(price - 1) < 0.01) {
      score += 20;
      reasons.push("precio estable");
    } else {
      score -= 30;
      reasons.push("precio desviado");
    }
  }

  // Evaluar TVL
  if (tvlData > 1000000) {
    score += 20;
    reasons.push("TVL alto");
  } else if (tvlData < 100000) {
    score -= 20;
    reasons.push("TVL bajo");
  } else {
    score += 10;
    reasons.push("TVL moderado");
  }

  // Asegurar que el score esté entre 0 y 100
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reason: reasons.join(", ") || "evaluación basada en datos disponibles"
  };
};

const onCronTrigger = async (runtime: Runtime<Config>) => {
  runtime.log("Iniciando evaluación de riesgo DeFi...");

  const { chainSelectorName, contractAddress } = runtime.config.evm;

  // Obtener datos usando HTTP con consenso
  const httpCapability = new cre.capabilities.HTTPClient();
  
  const priceData = await httpCapability
    .sendRequest(runtime, fetchPriceData, consensusMedianAggregation())(runtime.config)
    .result();

  const tvlData = await httpCapability
    .sendRequest(runtime, fetchTVLData, consensusMedianAggregation())(runtime.config)
    .result();

  runtime.log(`Datos obtenidos - Precio: ${JSON.stringify(priceData)}, TVL: ${tvlData}`);

  // Calcular score de riesgo
  const { score, reason } = calculateRiskScore(priceData, tvlData);
  
  runtime.log(`Score calculado: ${score}, Razón: ${reason}`);

  // Preparar escritura al contrato (solo si hay dirección válida)
  if (contractAddress && contractAddress !== "0x0000000000000000000000000000000000000000") {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Network not found: ${chainSelectorName}`);
    }

    const writeData = encodeFunctionData({
      abi: RISK_ORACLE_ABI,
      functionName: "updateRiskScore",
      args: [BigInt(score), reason],
    });

    const report = runtime.report(prepareReportRequest(writeData)).result();
    
    runtime.log(`Report enviado al contrato: ${contractAddress}`);
    runtime.log(`Score ${score} actualizado en blockchain`);
  } else {
    runtime.log(`Contrato no configurado, saltando escritura on-chain`);
  }

  return { score, reason };
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
