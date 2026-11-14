// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EcoLoop} from "./EcoLoop.sol";
import {EcoLoopCertificate} from "./EcoLoopCertificate.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Multi-material pickup marketplace with real AVAX escrow (V3).
/// - The collector locks AVAX when claiming a lot (estimate value + 20% buffer).
/// - The collector proposes the real weight; the household accepts.
/// - On acceptance the contract pays the household for the real weight, refunds the rest to the
///   collector, mints ECO points and a recycling certificate NFT.
/// - Household actions can be gas-free through the trusted ERC-2771 forwarder (EcoLoop relayer).
/// Coordinates are coarse public areas (about 1 km), never home addresses.
contract EcoLoopPickup is EcoLoop, ERC2771Context, ReentrancyGuard {
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
        uint256 deposit; // AVAX (wei) locked by the collector while the lot is claimed/proposed
        uint256 paid; // AVAX (wei) released to the household on completion
    }

    uint256 public constant ESCROW_BUFFER_BPS = 12_000; // collector locks 120% of the estimated value
    uint256 public constant TIMEOUT = 7 days;
    uint256 public constant VERSION = 4;

    EcoLoopCertificate public immutable certificate;
    /// @notice AVAX (wei) paid per kg for plastic, paper, metal, glass.
    uint256[4] public pricePerKg = [0.0005 ether, 0.0003 ether, 0.002 ether, 0.0001 ether];
    /// @notice AVAX kept for an address whose direct payment failed; claim with withdrawPending().
    mapping(address => uint256) public pendingWithdrawals;
    uint256 public totalEscrowed;
    uint256 public totalPaid;

    mapping(uint256 => Lot) private lots;
    uint256 public lotCount;

    event LotChanged(uint256 indexed id, address indexed owner, address indexed collector, PickupStatus status);
    event LotSettled(uint256 indexed id, uint256 grams, uint256 amount);
    event EscrowLocked(uint256 indexed id, address indexed collector, uint256 amount);
    event EscrowReleased(uint256 indexed id, address indexed owner, uint256 paid, uint256 refunded);
    event EscrowRefunded(uint256 indexed id, address indexed collector, uint256 amount);
    event PaymentDeferred(address indexed to, uint256 amount);
    event PricesUpdated(uint256[4] pricePerKg);

    error InsufficientDeposit(uint256 required);
    error NothingToWithdraw();

    constructor(address admin, address forwarder) EcoLoop(admin) ERC2771Context(forwarder) {
        certificate = new EcoLoopCertificate();
    }

    // ---------- views ----------
    function getLot(uint256 id) external view returns (Lot memory) { return lots[id]; }

    /// @notice AVAX value (wei) of the given weights at current prices.
    function quote(uint64[4] memory grams) public view returns (uint256 value) {
        for (uint256 i; i < 4; i++) value += uint256(grams[i]) * pricePerKg[i] / 1000;
    }

    /// @notice AVAX (wei) a collector must lock to claim the lot.
    function requiredDeposit(uint256 id) public view returns (uint256) {
        return quote(lots[id].estimated) * ESCROW_BUFFER_BPS / 10_000;
    }

    // ---------- admin ----------
    function setPrices(uint256[4] calldata prices) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i; i < 4; i++) if (prices[i] > 1 ether) revert InvalidInput();
        pricePerKg = prices;
        emit PricesUpdated(prices);
    }

    // ---------- household (gas-free through the forwarder) ----------
    function createLot(uint64[4] calldata weights, bytes32 evidence, int32 latitude, int32 longitude) external whenNotPaused returns (uint256 id) {
        checkWeights(weights);
        if (evidence == bytes32(0) || latitude < -9000 || latitude > 9000 || longitude < -18000 || longitude > 18000) revert InvalidInput();
        if (evidenceUsed[evidence]) revert DuplicateEvidence();
        evidenceUsed[evidence] = true;
        id = ++lotCount;
        Lot storage lot = lots[id];
        lot.owner = _msgSender(); lot.estimated = weights; lot.evidence = evidence;
        lot.latitude = latitude; lot.longitude = longitude;
        change(id, PickupStatus.Open);
    }

    function acceptLot(uint256 id) external whenNotPaused nonReentrant {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Proposed || lot.owner != _msgSender()) revert InvalidStatus();
        if (block.timestamp > lot.updatedAt + TIMEOUT) revert InvalidStatus();
        uint256 total = checkWeights(lot.actual);
        uint256 amount;
        for (uint256 i; i < 4; i++) amount += uint256(lot.actual[i]) * rates[i] * 1 ether / 1000;

        uint256 deposit = lot.deposit;
        uint256 value = quote(lot.actual);
        uint256 payment = value < deposit ? value : deposit;
        uint256 refund = deposit - payment;
        lot.deposit = 0;
        lot.paid = payment;
        totalEscrowed -= deposit;
        totalPaid += payment;
        change(id, PickupStatus.Completed);

        recycledGrams[lot.owner] += total;
        totalRecycledGrams += total;
        earned[lot.owner] += amount;
        _mint(lot.owner, amount);
        emit LotSettled(id, total, amount);
        emit EscrowReleased(id, lot.owner, payment, refund);

        certificate.mint(lot.owner, id, lot.actual, lot.collector, payment);
        send(lot.owner, payment);
        send(lot.collector, refund);
    }

    /// @notice Disagreeing owners can request another weighing; the escrow stays locked.
    function disputeLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.owner != _msgSender() || lot.status != PickupStatus.Proposed) revert InvalidStatus();
        delete lot.actual;
        change(id, PickupStatus.Claimed);
    }

    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.owner != _msgSender() || lot.status != PickupStatus.Open) revert InvalidStatus();
        change(id, PickupStatus.Cancelled);
    }

    /// @notice Gas-free reward redemption (same rules as redeem()).
    function redeemReward(uint256 rewardId) external whenNotPaused returns (uint256 redemptionId) {
        Reward storage r = rewards[rewardId];
        if (!r.active || r.stock == 0) revert UnavailableReward();
        r.stock--;
        address user = _msgSender();
        _burn(user, r.cost);
        redemptionId = ++redemptionCount;
        redemptionOwner[redemptionId] = user;
        redemptionReward[redemptionId] = rewardId;
        emit Redeemed(redemptionId, user, rewardId, r.cost);
    }

    // ---------- collector (pays own gas and locks AVAX) ----------
    function claimLot(uint256 id) external payable whenNotPaused nonReentrant {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Open) revert InvalidStatus();
        address collector = _msgSender();
        if (lot.owner == collector) revert SelfApproval();
        uint256 required = requiredDeposit(id);
        if (msg.value < required) revert InsufficientDeposit(required);
        lot.collector = collector;
        lot.deposit = msg.value;
        totalEscrowed += msg.value;
        change(id, PickupStatus.Claimed);
        emit EscrowLocked(id, collector, msg.value);
    }

    function proposeLot(uint256 id, uint64[4] calldata actual) external whenNotPaused {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Claimed || lot.collector != _msgSender()) revert InvalidStatus();
        checkWeights(actual);
        lot.actual = actual;
        change(id, PickupStatus.Proposed);
    }

    /// @notice A collector can release a job; owners can recover stalled jobs after 7 days, even while paused.
    /// The locked AVAX always goes back to the collector.
    function releaseLot(uint256 id) external nonReentrant {
        Lot storage lot = lots[id];
        if (lot.status != PickupStatus.Claimed && lot.status != PickupStatus.Proposed) revert InvalidStatus();
        address sender = _msgSender();
        if (sender != lot.collector && !(sender == lot.owner && block.timestamp > lot.updatedAt + TIMEOUT)) revert InvalidStatus();
        address collector = lot.collector;
        uint256 deposit = lot.deposit;
        lot.deposit = 0;
        totalEscrowed -= deposit;
        delete lot.collector; delete lot.actual;
        change(id, PickupStatus.Open);
        emit EscrowRefunded(id, collector, deposit);
        send(collector, deposit);
    }

    /// @notice Withdraw AVAX that could not be sent directly (e.g. to a contract wallet that rejected it).
    function withdrawPending() external nonReentrant {
        address to = _msgSender();
        uint256 amount = pendingWithdrawals[to];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[to] = 0;
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert InvalidStatus();
    }

    // ---------- internals ----------
    function checkWeights(uint64[4] memory weights) private pure returns (uint256 total) {
        for (uint256 i; i < 4; i++) { total += weights[i]; }
        if (total == 0 || total > MAX_GRAMS) revert InvalidInput();
    }

    function change(uint256 id, PickupStatus status) private {
        Lot storage lot = lots[id]; lot.status = status; lot.updatedAt = uint64(block.timestamp);
        emit LotChanged(id, lot.owner, lot.collector, status);
    }

    /// @dev Push payment with a gas cap; if the receiver rejects it, keep it claimable instead of blocking settlement.
    function send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount, gas: 50_000}("");
        if (!ok) { pendingWithdrawals[to] += amount; emit PaymentDeferred(to, amount); }
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) { return ERC2771Context._msgSender(); }
    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) { return ERC2771Context._msgData(); }
    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) { return ERC2771Context._contextSuffixLength(); }
}
