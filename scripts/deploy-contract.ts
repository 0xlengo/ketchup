import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log("Deploying RiskOracle contract...");

  const Oracle = await ethers.getContractFactory("RiskOracle");
  const oracle = await Oracle.deploy();

  await oracle.waitForDeployment();

  const address = await oracle.getAddress();
  console.log("RiskOracle deployed at:", address);

  // Update cre.json
  const creConfigPath = path.join(__dirname, "..", "cre.json");
  const config = JSON.parse(fs.readFileSync(creConfigPath, "utf-8"));
  config.contracts.RiskOracle.address = address;
  
  // Also update ABI path if artifact exists
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RiskOracle.sol", "RiskOracle.json");
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abiPath = path.join(__dirname, "..", "contracts", "RiskOracle.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log("ABI saved to contracts/RiskOracle.json");
  }
  
  fs.writeFileSync(creConfigPath, JSON.stringify(config, null, 2));
  console.log("cre.json updated with contract address!");

  // Update workflow/config.json
  const workflowConfigPath = path.join(__dirname, "..", "workflow", "config.json");
  const workflowConfig = JSON.parse(fs.readFileSync(workflowConfigPath, "utf-8"));
  workflowConfig.chains[0].contracts.RiskOracle = address;
  workflowConfig.evm.contractAddress = address;
  fs.writeFileSync(workflowConfigPath, JSON.stringify(workflowConfig, null, 2));

  console.log("workflow/config.json updated with contract address!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

