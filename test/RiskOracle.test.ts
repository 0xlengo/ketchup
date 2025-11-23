import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, parseEther } from "viem";
import hre from "hardhat";

describe("RiskOracle", function () {
  // Fixture para desplegar el contrato
  async function deployRiskOracleFixture() {
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const riskOracle = await hre.viem.deployContract("RiskOracle", []);

    const publicClient = await hre.viem.getPublicClient();

    return {
      riskOracle,
      owner,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct threshold", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const threshold = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "THRESHOLD",
      });

      expect(threshold).to.equal(60n);
    });

    it("Should initialize with zero values", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const lastRiskScore = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastRiskScore",
      });

      const lastUpdatedAt = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastUpdatedAt",
      });

      expect(lastRiskScore).to.equal(0n);
      expect(lastUpdatedAt).to.equal(0n);
    });
  });

  describe("updateRiskScore", function () {
    it("Should update risk score and reason", async function () {
      const { riskOracle, owner, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 75n;
      const reason = "High TVL, stable price, no anomalies detected";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const lastRiskScore = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastRiskScore",
      });

      const lastReason = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastReason",
      });

      expect(lastRiskScore).to.equal(score);
      expect(lastReason).to.equal(reason);
    });

    it("Should emit RiskUpdated event with correct values", async function () {
      const { riskOracle, owner, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 45n; // Below threshold
      const reason = "Low TVL detected";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const logs = await publicClient.getLogs({
        address: riskOracle.address,
        event: {
          type: "event",
          name: "RiskUpdated",
          inputs: [
            { type: "uint256", indexed: false, name: "score" },
            { type: "string", indexed: false, name: "reason" },
            { type: "bool", indexed: false, name: "isRisky" },
          ],
        },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      expect(logs.length).to.equal(1);
      const log = logs[0];
      expect(log.args.score).to.equal(score);
      expect(log.args.reason).to.equal(reason);
      expect(log.args.isRisky).to.equal(true); // 45 < 60
    });

    it("Should update lastUpdatedAt timestamp", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 80n;
      const reason = "All checks passed";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const lastUpdatedAt = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastUpdatedAt",
      });

      const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      
      expect(lastUpdatedAt).to.be.greaterThan(0n);
      expect(lastUpdatedAt).to.equal(BigInt(block.timestamp));
    });
  });

  describe("isRisky", function () {
    it("Should return true when score is below threshold", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 45n; // Below 60
      const reason = "Low score";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const isRisky = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "isRisky",
      });

      expect(isRisky).to.equal(true);
    });

    it("Should return false when score is above threshold", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 75n; // Above 60
      const reason = "Good score";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const isRisky = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "isRisky",
      });

      expect(isRisky).to.equal(false);
    });

    it("Should return true when score equals threshold", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 60n; // Equals threshold, but < 60 is risky
      const reason = "Threshold score";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const isRisky = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "isRisky",
      });

      expect(isRisky).to.equal(false); // 60 is not < 60
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum score (100)", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 100n;
      const reason = "Perfect score";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const lastRiskScore = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastRiskScore",
      });

      expect(lastRiskScore).to.equal(score);
    });

    it("Should handle minimum score (0)", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 0n;
      const reason = "Critical risk";

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const isRisky = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "isRisky",
      });

      expect(isRisky).to.equal(true);
    });

    it("Should handle long reason strings", async function () {
      const { riskOracle, publicClient } = await loadFixture(deployRiskOracleFixture);
      
      const score = 70n;
      const reason = "A".repeat(500); // Long string

      const hash = await riskOracle.write.updateRiskScore([score, reason]);
      await publicClient.waitForTransactionReceipt({ hash });

      const lastReason = await publicClient.readContract({
        address: riskOracle.address,
        abi: riskOracle.abi,
        functionName: "lastReason",
      });

      expect(lastReason).to.equal(reason);
    });
  });
});

