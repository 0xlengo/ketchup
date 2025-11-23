import { defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

export default defineConfig({
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 1337,
    },
    sepolia: {
      type: "http",
      url: (() => {
        const infuraKey = process.env.INFURA_KEY;
        if (!infuraKey || infuraKey === "your_infura_key_here") {
          console.warn("⚠️  INFURA_KEY no configurada o es placeholder. Usando RPC público de Sepolia.");
          return "https://rpc.sepolia.org";
        }
        return `https://sepolia.infura.io/v3/${infuraKey}`;
      })(),
      accounts: (() => {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey || privateKey === "your_private_key_here") {
          console.warn("⚠️  PRIVATE_KEY no configurada. No se pueden desplegar contratos.");
          return [];
        }
        // Asegurar que la clave privada tenga el prefijo 0x si no lo tiene
        return privateKey.startsWith("0x") ? [privateKey] : [`0x${privateKey}`];
      })(),
      chainId: 11155111,
    },
  },
});

