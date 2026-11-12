// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EcoLoop} from "./EcoLoop.sol";

/// @notice Multi-material pickup ledger. Coordinates are coarse public areas, never home addresses.
/// The collector's proposal and the owner's acceptance are separate on-chain consents.
contract EcoLoopPickup is EcoLoop {
    enum PickupStatus { None, Open, Claimed, Proposed, Completed, Cancelled }
    struct Lot {
        address owner;
        address collector;
        uint64[4] estimated;
        uint64[4] actual;
        bytes32 evidence;
        int32 latitude; // degrees * 100: approximately 1 km precision
        int32 longitude;
        uint64 updatedAt;
        PickupStatus status;
    }
    mapping(uint256 => Lot) private lots;
    uint256 public lotCount;
    event LotChanged(uint256 indexed id, address indexed owner, address indexed collector, PickupStatus status);
    event LotSettled(uint256 indexed id, uint256 grams, uint256 amount);

    constructor(address admin) EcoLoop(admin) {}

    function getLot(uint256 id) external view returns (Lot memory) { return lots[id]; }
    function checkWeights(uint64[4] memory weights) private pure returns (uint256 total) {
        for (uint256 i; i < 4; i++) { total += weights[i]; }
        if (total == 0 || total > MAX_GRAMS) revert InvalidInput();
    }
    function createLot(uint64[4] calldata weights, bytes32 evidence, int32 latitude, int32 longitude) external whenNotPaused returns (uint256 id) {
        checkWeights(weights);
        if (evidence == bytes32(0) || latitude < -9000 || latitude > 9000 || longitude < -18000 || longitude > 18000) revert InvalidInput();
        if (evidenceUsed[evidence]) revert DuplicateEvidence();
        evidenceUsed[evidence] = true;
        id = ++lotCount;
        Lot storage lot = lots[id];
        lot.owner = msg.sender; lot.estimated = weights; lot.evidence = evidence;
        lot.latitude = latitude; lot.longitude = longitude;
        change(id, PickupStatus.Open);
    }
    function claimLot(uint256 id) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Open) revert InvalidStatus();
        if (lot.owner == msg.sender) revert SelfApproval();
        lot.collector = msg.sender;
        change(id, PickupStatus.Claimed);
    }
    function proposeLot(uint256 id, uint64[4] calldata actual) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Claimed || lot.collector != msg.sender) revert InvalidStatus();
        checkWeights(actual);
        lot.actual = actual;
        change(id, PickupStatus.Proposed);
    }
    function acceptLot(uint256 id) external whenNotPaused {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Proposed || lot.owner != msg.sender) revert InvalidStatus();
        if (block.timestamp > lot.updatedAt + 7 days || !hasRole(COLLECTOR_ROLE, lot.collector)) revert InvalidStatus();
        uint256 total = checkWeights(lot.actual);
        uint256 amount;
        for (uint256 i; i < 4; i++) amount += uint256(lot.actual[i]) * rates[i] * 1 ether / 1000;
        change(id, PickupStatus.Completed);
        recycledGrams[lot.owner] += total;
        totalRecycledGrams += total;
        earned[lot.owner] += amount;
        _mint(lot.owner, amount);
        emit LotSettled(id, total, amount);
    }
    // Disagreeing owners can request another weighing; the previous proposal cannot be accepted.
    function disputeLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.owner != msg.sender || lot.status != PickupStatus.Proposed) revert InvalidStatus();
        delete lot.actual;
        change(id, PickupStatus.Claimed);
    }
    // A collector can release a job. Owners can recover stalled jobs after 7 days, even while paused.
    function releaseLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Claimed && lot.status != PickupStatus.Proposed) revert InvalidStatus();
        if (msg.sender != lot.collector && !(msg.sender == lot.owner && block.timestamp > lot.updatedAt + 7 days)) revert InvalidStatus();
        delete lot.collector; delete lot.actual;
        change(id, PickupStatus.Open);
    }
    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.owner != msg.sender || lot.status != PickupStatus.Open) revert InvalidStatus();
        change(id, PickupStatus.Cancelled);
    }
    function change(uint256 id, PickupStatus status) private {
        Lot storage lot = lots[id]; lot.status = status; lot.updatedAt = uint64(block.timestamp);
        emit LotChanged(id, lot.owner, lot.collector, status);
    }
}
