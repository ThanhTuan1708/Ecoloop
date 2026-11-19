// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EcoLoopCertificate} from "./EcoLoopCertificate.sol";
import {ITeleporterMessenger, TeleporterFeeInfo, TeleporterMessageInput} from "./interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "./interfaces/ITeleporterReceiver.sol";

/// @notice Avalanche Interchain Messaging (ICM / Teleporter) bridge for EcoLoop EPR Recycling Certificates.
/// Dispatches verified ECOREC recycling proofs from Avalanche Fuji C-Chain (or an EcoLoop Green L1)
/// to partner ESG compliance Avalanche L1s without centralized bridges.
contract EcoLoopTeleporterBridge is AccessControl, ITeleporterReceiver {
    /// @notice Canonical Teleporter Messenger deployed on Avalanche Fuji & Mainnet.
    address public constant CANONICAL_TELEPORTER = 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf;
    uint256 public constant DEFAULT_GAS_LIMIT = 250_000;

    struct ImpactAttestation {
        uint256 lotId;
        address household;
        address collector;
        uint64[4] grams; // plastic, paper, metal, glass
        uint64 completedAt;
        uint256 paidEco;
    }

    ITeleporterMessenger public immutable teleporterMessenger;
    EcoLoopCertificate public immutable certificate;

    /// @notice Trusted remote EcoLoopTeleporterBridge contract per Avalanche Blockchain ID.
    mapping(bytes32 => address) public trustedRemotes;
    /// @notice Prevents attesting the same certificate twice to the same destination Avalanche L1.
    mapping(bytes32 => mapping(uint256 => bytes32)) public outboundMessageIds;
    /// @notice Replay protection for inbound Teleporter messages per (sourceBlockchainID, lotId).
    mapping(bytes32 => mapping(uint256 => ImpactAttestation)) private inboundAttestations;
    mapping(bytes32 => mapping(uint256 => bool)) public hasInboundAttestation;

    mapping(bytes32 => uint256) public remoteCertifiedGramsByChain;
    uint256 public totalOutboundAttestations;
    uint256 public totalInboundAttestations;
    uint256 public totalRemoteCertifiedGrams;

    event TrustedRemoteConfigured(bytes32 indexed blockchainID, address indexed remoteBridge);
    event ImpactAttestationSent(
        bytes32 indexed messageID,
        bytes32 indexed destinationBlockchainID,
        uint256 indexed lotId,
        address household,
        uint256 totalGrams
    );
    event ImpactAttestationReceived(
        bytes32 indexed sourceBlockchainID,
        uint256 indexed lotId,
        address indexed household,
        uint256 totalGrams,
        uint256 paidEco
    );

    error InvalidConfiguration();
    error UnauthorizedTeleporter(address caller);
    error UntrustedRemoteBridge(bytes32 sourceBlockchainID, address sender);
    error NotCertificateHolder(uint256 lotId, address caller);
    error AttestationAlreadyBridged(bytes32 blockchainID, uint256 lotId);

    /// @param certificate_ ECOREC contract on the source chain. Pass address(0) on a destination
    /// Avalanche L1 that only receives attestations (receive-only registry, bridgeCertificate disabled).
    constructor(address admin, address messenger, EcoLoopCertificate certificate_) {
        if (admin == address(0) || messenger == address(0)) {
            revert InvalidConfiguration();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        teleporterMessenger = ITeleporterMessenger(messenger);
        certificate = certificate_;
    }

    function setTrustedRemote(bytes32 blockchainID, address remoteBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (blockchainID == bytes32(0) || remoteBridge == address(0)) revert InvalidConfiguration();
        trustedRemotes[blockchainID] = remoteBridge;
        emit TrustedRemoteConfigured(blockchainID, remoteBridge);
    }

    /// @notice Sends a verified ECOREC recycling proof across Avalanche chains via Teleporter ICM.
    function bridgeCertificate(
        bytes32 destinationBlockchainID,
        uint256 lotId,
        uint256 requiredGasLimit
    ) external returns (bytes32 messageID) {
        if (address(certificate) == address(0)) revert InvalidConfiguration();
        address destination = trustedRemotes[destinationBlockchainID];
        if (destination == address(0)) revert InvalidConfiguration();
        if (outboundMessageIds[destinationBlockchainID][lotId] != bytes32(0)) {
            revert AttestationAlreadyBridged(destinationBlockchainID, lotId);
        }

        address holder = certificate.ownerOf(lotId);
        if (holder != _msgSender() && !hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            revert NotCertificateHolder(lotId, _msgSender());
        }

        EcoLoopCertificate.Certificate memory cert = certificate.certificate(lotId);
        ImpactAttestation memory payload = ImpactAttestation({
            lotId: lotId,
            household: holder,
            collector: cert.collector,
            grams: cert.grams,
            completedAt: cert.completedAt,
            paidEco: cert.paidEco
        });

        uint256 gasLimit = requiredGasLimit == 0 ? DEFAULT_GAS_LIMIT : requiredGasLimit;
        address[] memory allowedRelayers = new address[](0);

        messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destination,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: gasLimit,
                allowedRelayerAddresses: allowedRelayers,
                message: abi.encode(payload)
            })
        );

        outboundMessageIds[destinationBlockchainID][lotId] = messageID;
        totalOutboundAttestations++;

        uint256 totalGrams = uint256(cert.grams[0]) + cert.grams[1] + cert.grams[2] + cert.grams[3];
        emit ImpactAttestationSent(messageID, destinationBlockchainID, lotId, holder, totalGrams);
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external override {
        if (msg.sender != address(teleporterMessenger)) revert UnauthorizedTeleporter(msg.sender);
        if (trustedRemotes[sourceBlockchainID] != originSenderAddress) {
            revert UntrustedRemoteBridge(sourceBlockchainID, originSenderAddress);
        }

        ImpactAttestation memory att = abi.decode(message, (ImpactAttestation));
        if (hasInboundAttestation[sourceBlockchainID][att.lotId]) {
            revert AttestationAlreadyBridged(sourceBlockchainID, att.lotId);
        }

        hasInboundAttestation[sourceBlockchainID][att.lotId] = true;
        inboundAttestations[sourceBlockchainID][att.lotId] = att;

        uint256 totalGrams = uint256(att.grams[0]) + att.grams[1] + att.grams[2] + att.grams[3];
        remoteCertifiedGramsByChain[sourceBlockchainID] += totalGrams;
        totalRemoteCertifiedGrams += totalGrams;
        totalInboundAttestations++;

        emit ImpactAttestationReceived(sourceBlockchainID, att.lotId, att.household, totalGrams, att.paidEco);
    }

    function getInboundAttestation(
        bytes32 sourceBlockchainID,
        uint256 lotId
    ) external view returns (ImpactAttestation memory) {
        return inboundAttestations[sourceBlockchainID][lotId];
    }
}
