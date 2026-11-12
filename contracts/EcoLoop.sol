// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Testnet recycling ledger and ECO reward token. Physical verification remains trusted.
contract EcoLoop is ERC20, AccessControl, Pausable {
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    uint256 public constant MAX_GRAMS = 1_000_000; // 1 tonne per request
    enum Status { None, Pending, Approved, Rejected }
    struct Submission {
        address user;
        uint8 material;
        uint64 estimatedGrams;
        uint64 verifiedGrams;
        bytes32 evidenceHash;
        Status status;
        uint64 createdAt;
    }
    struct Reward { string name; uint256 cost; uint256 stock; bool active; }
    mapping(uint256 => Submission) public submissions;
    mapping(uint256 => Reward) public rewards;
    mapping(bytes32 => bool) public evidenceUsed;
    mapping(address => uint256) public recycledGrams;
    mapping(address => uint256) public earned;
    mapping(uint256 => address) public redemptionOwner;
    mapping(uint256 => uint256) public redemptionReward;
    mapping(uint256 => bool) public redemptionFulfilled;
    uint256 public submissionCount;
    uint256 public rewardCount;
    uint256 public redemptionCount;
    uint256 public totalRecycledGrams;
    // ECO per kg: plastic, paper, metal, glass. Snapshot-free fixed policy for this MVP.
    uint256[4] public rates = [20, 10, 40, 8];
    event Submitted(uint256 indexed id, address indexed user, uint8 material, uint256 grams, bytes32 evidenceHash);
    event Approved(uint256 indexed id, address indexed collector, uint256 verifiedGrams, uint256 amount);
    event Rejected(uint256 indexed id, address indexed collector);
    event Redeemed(uint256 indexed id, address indexed user, uint256 indexed rewardId, uint256 cost);
    event RewardConfigured(uint256 indexed id, string name, uint256 cost, uint256 stock, bool active);
    event RewardFulfilled(uint256 indexed id, address indexed collector, address indexed recipient);
    error InvalidInput();
    error InvalidStatus();
    error DuplicateEvidence();
    error SelfApproval();
    error UnavailableReward();

    constructor(address admin) ERC20("EcoLoop", "ECO") {
        if (admin == address(0)) revert InvalidInput();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COLLECTOR_ROLE, admin);
        _addReward("Coffee voucher", 100 ether, 50);
        _addReward("Canvas tote bag", 200 ether, 30);
        _addReward("Green shopping voucher", 300 ether, 20);
    }
    function submit(uint8 material, uint64 grams, bytes32 evidenceHash) external whenNotPaused returns (uint256 id) {
        if (material > 3 || grams == 0 || grams > MAX_GRAMS || evidenceHash == bytes32(0)) revert InvalidInput();
        if (evidenceUsed[evidenceHash]) revert DuplicateEvidence();
        evidenceUsed[evidenceHash] = true;
        id = ++submissionCount;
        submissions[id] = Submission(msg.sender, material, grams, 0, evidenceHash, Status.Pending, uint64(block.timestamp));
        emit Submitted(id, msg.sender, material, grams, evidenceHash);
    }
    function approve(uint256 id, uint64 grams) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        Submission storage s = submissions[id];
        if (s.status != Status.Pending) revert InvalidStatus();
        if (s.user == msg.sender) revert SelfApproval();
        if (grams == 0 || grams > MAX_GRAMS) revert InvalidInput();
        s.status = Status.Approved;
        s.verifiedGrams = grams;
        uint256 amount = uint256(grams) * rates[s.material] * 1 ether / 1000;
        recycledGrams[s.user] += grams;
        totalRecycledGrams += grams;
        earned[s.user] += amount;
        _mint(s.user, amount);
        emit Approved(id, msg.sender, grams, amount);
    }
    function reject(uint256 id) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        if (submissions[id].status != Status.Pending) revert InvalidStatus();
        submissions[id].status = Status.Rejected;
        emit Rejected(id, msg.sender);
    }
    function addReward(string calldata name_, uint256 cost, uint256 stock) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addReward(name_, cost, stock);
    }
    function _addReward(string memory name_, uint256 cost, uint256 stock) private {
        if (bytes(name_).length == 0 || bytes(name_).length > 120 || cost == 0) revert InvalidInput();
        uint256 id = ++rewardCount;
        rewards[id] = Reward(name_, cost, stock, true);
        emit RewardConfigured(id, name_, cost, stock, true);
    }
    function configureReward(uint256 id, uint256 cost, uint256 stock, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (id == 0 || id > rewardCount || cost == 0) revert InvalidInput();
        Reward storage r = rewards[id];
        r.cost = cost; r.stock = stock; r.active = active;
        emit RewardConfigured(id, r.name, cost, stock, active);
    }
    function redeem(uint256 id) external whenNotPaused returns (uint256 redemptionId) {
        Reward storage r = rewards[id];
        if (!r.active || r.stock == 0) revert UnavailableReward();
        r.stock--;
        _burn(msg.sender, r.cost);
        redemptionId = ++redemptionCount;
        redemptionOwner[redemptionId] = msg.sender;
        redemptionReward[redemptionId] = id;
        emit Redeemed(redemptionId, msg.sender, id, r.cost);
    }
    function setPaused(bool value) external onlyRole(DEFAULT_ADMIN_ROLE) { if (value) _pause(); else _unpause(); }
    /// @notice Collector checks recipient's wallet at handover. Cannot deliver a receipt twice.
    function fulfillRedemption(uint256 id) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        address recipient = redemptionOwner[id];
        if (recipient == address(0) || redemptionFulfilled[id]) revert InvalidStatus();
        redemptionFulfilled[id] = true;
        emit RewardFulfilled(id, msg.sender, recipient);
    }
}
