// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @notice Trusted forwarder for gas-free household actions. A household signs an EIP-712 request;
/// the EcoLoop relayer submits it and pays the AVAX gas. The target contract sees the household as sender.
contract EcoLoopForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("EcoLoopForwarder") {}
}
