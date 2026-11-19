// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

struct TeleporterFeeInfo {
    address feeTokenAddress;
    uint256 amount;
}

struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

/// @notice Canonical Avalanche Interchain Messaging (ICM / Teleporter) Messenger interface
/// deployed at 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf on Avalanche Fuji & Mainnet.
interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput) external returns (bytes32 messageID);
}
