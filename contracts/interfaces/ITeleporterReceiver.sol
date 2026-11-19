// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Canonical Avalanche Interchain Messaging (ICM / Teleporter) Receiver interface.
interface ITeleporterReceiver {
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}
