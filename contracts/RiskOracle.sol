// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RiskOracle {
    uint256 public lastRiskScore;
    string public lastReason;
    uint256 public lastUpdatedAt;
    uint256 public constant THRESHOLD = 60; // <60 = risky

    event RiskUpdated(uint256 score, string reason, bool isRisky);

    function updateRiskScore(uint256 score, string calldata reason) external {
        lastRiskScore = score;
        lastReason = reason;
        lastUpdatedAt = block.timestamp;
        bool risky = score < THRESHOLD;
        emit RiskUpdated(score, reason, risky);
    }

    function isRisky() public view returns (bool) {
        return lastRiskScore < THRESHOLD;
    }
}

