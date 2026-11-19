// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRecyclingEco is IERC20 {
    function verifiedRecycledGrams(address user) external view returns (uint256);
    function paused() external view returns (bool);
}

/// @notice Pays out existing ECO from a funded pool on the active recycling contract.
contract EcoLoopRewards {
    using SafeERC20 for IERC20;

    uint256 private constant CHECK_IN_REWARD = 5 ether;
    uint256 private constant VIETNAM_OFFSET = 7 hours;
    IRecyclingEco public immutable eco;
    mapping(address => mapping(uint256 => bool)) private checkedIn;
    mapping(address => mapping(uint8 => bool)) private missionClaimed;

    struct Mission {
        uint256 targetGrams;
        uint256 amount;
        bool claimed;
    }

    struct Status {
        uint256 day;
        uint256 checkInAmount;
        bool checkInClaimed;
        uint256 recycledGrams;
        uint256 available;
        bool paused;
        Mission[2] missions;
    }

    event CheckedIn(address indexed user, uint256 indexed day, uint256 amount);
    event MissionRewardClaimed(address indexed user, uint8 indexed mission, uint256 amount);
    error CheckInDayChanged();
    error EcoRewardAlreadyClaimed();
    error EcoMissionIncomplete();
    error UnknownEcoMission();
    error EcoRewardsUnderfunded();
    error EnforcedPause();
    error CheckInRequiresVerifiedRecycling();

    constructor(IRecyclingEco token) {
        require(address(token).code.length > 0);
        eco = token;
    }

    function currentDay() public view returns (uint256) {
        return (block.timestamp + VIETNAM_OFFSET) / 1 days;
    }

    function rewardStatus(address user) external view returns (Status memory status) {
        status.day = currentDay();
        status.checkInAmount = CHECK_IN_REWARD;
        status.checkInClaimed = checkedIn[user][status.day];
        status.recycledGrams = eco.verifiedRecycledGrams(user);
        status.available = eco.balanceOf(address(this));
        status.paused = eco.paused();
        for (uint8 id = 0; id < status.missions.length; id++) {
            (uint256 target, uint256 amount) = missionTerms(id);
            status.missions[id] = Mission(target, amount, missionClaimed[user][id]);
        }
    }

    function claimCheckIn(uint256 day) external {
        if (day != currentDay()) revert CheckInDayChanged();
        if (checkedIn[msg.sender][day]) revert EcoRewardAlreadyClaimed();
        // Anti-Sybil: only wallets with at least one lot settled by a verified station can check in.
        if (eco.verifiedRecycledGrams(msg.sender) == 0) revert CheckInRequiresVerifiedRecycling();
        checkedIn[msg.sender][day] = true;
        pay(CHECK_IN_REWARD);
        emit CheckedIn(msg.sender, day, CHECK_IN_REWARD);
    }

    function claimMission(uint8 id) external {
        (uint256 target, uint256 amount) = missionTerms(id);
        if (missionClaimed[msg.sender][id]) revert EcoRewardAlreadyClaimed();
        if (eco.verifiedRecycledGrams(msg.sender) < target) revert EcoMissionIncomplete();
        missionClaimed[msg.sender][id] = true;
        pay(amount);
        emit MissionRewardClaimed(msg.sender, id, amount);
    }

    function missionTerms(uint8 id) private pure returns (uint256 target, uint256 amount) {
        if (id == 0) return (1000, 20 ether);
        if (id == 1) return (5000, 50 ether);
        revert UnknownEcoMission();
    }

    function pay(uint256 amount) private {
        if (eco.paused()) revert EnforcedPause();
        if (eco.balanceOf(address(this)) < amount) revert EcoRewardsUnderfunded();
        IERC20(address(eco)).safeTransfer(msg.sender, amount);
    }
}
