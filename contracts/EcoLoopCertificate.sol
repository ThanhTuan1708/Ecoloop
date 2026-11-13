// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Recycling certificate NFT: one token per completed pickup lot, minted by the pickup contract
/// when the owner accepts the collector's weigh-in. Metadata and image are fully on-chain.
contract EcoLoopCertificate is ERC721 {
    using Strings for uint256;

    struct Certificate {
        uint64[4] grams; // plastic, paper, metal, glass
        uint64 completedAt;
        address collector;
        uint256 paidWei; // AVAX released from escrow to the household
    }

    address public immutable minter;
    mapping(uint256 => Certificate) private certificates;
    uint256 public totalSupply;
    uint256 public totalCertifiedGrams;

    error OnlyMinter();

    constructor() ERC721("EcoLoop Recycling Certificate", "ECOREC") {
        minter = msg.sender;
    }

    /// @dev tokenId equals the pickup lot id, so a lot can be certified only once.
    function mint(address to, uint256 lotId, uint64[4] calldata grams, address collector, uint256 paidWei) external {
        if (msg.sender != minter) revert OnlyMinter();
        certificates[lotId] = Certificate(grams, uint64(block.timestamp), collector, paidWei);
        totalSupply++;
        totalCertifiedGrams += uint256(grams[0]) + grams[1] + grams[2] + grams[3];
        _safeMint(to, lotId);
    }

    function certificate(uint256 tokenId) external view returns (Certificate memory) {
        _requireOwned(tokenId);
        return certificates[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Certificate memory c = certificates[tokenId];
        uint256 total = uint256(c.grams[0]) + c.grams[1] + c.grams[2] + c.grams[3];
        string memory id = tokenId.toString();
        string memory json = string.concat(
            '{"name":"EcoLoop Recycling Certificate #', id,
            '","description":"Verified doorstep recycling on Avalanche: weighed by the collector, accepted by the household, paid from escrow.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(_svg(id, c.grams, total))),
            '","attributes":[', _attributes(c, total), ']}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _kg(uint256 grams) private pure returns (string memory) {
        uint256 decimals = (grams % 1000) / 10;
        return string.concat((grams / 1000).toString(), ".", decimals < 10 ? "0" : "", decimals.toString());
    }

    function _attributes(Certificate memory c, uint256 total) private pure returns (string memory) {
        return string.concat(
            '{"trait_type":"Total kg","value":"', _kg(total), '"},',
            '{"trait_type":"Plastic kg","value":"', _kg(c.grams[0]), '"},',
            '{"trait_type":"Paper kg","value":"', _kg(c.grams[1]), '"},',
            '{"trait_type":"Metal kg","value":"', _kg(c.grams[2]), '"},',
            '{"trait_type":"Glass kg","value":"', _kg(c.grams[3]), '"},',
            '{"trait_type":"Collector","value":"', Strings.toHexString(c.collector), '"},',
            '{"display_type":"date","trait_type":"Completed","value":', uint256(c.completedAt).toString(), '}'
        );
    }

    function _svg(string memory id, uint64[4] memory grams, uint256 total) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" rx="28" fill="#08785e"/>',
            '<circle cx="330" cy="70" r="90" fill="#0b8a6c"/><text x="32" y="60" fill="#c8ec81" font-family="sans-serif" font-size="16" font-weight="700">ECOLOOP</text>',
            '<text x="32" y="96" fill="#fff" font-family="sans-serif" font-size="24" font-weight="800">Recycling Certificate</text>',
            '<text x="32" y="128" fill="#d6efe4" font-family="sans-serif" font-size="16">Lot #', id, ' - Avalanche</text>',
            '<text x="32" y="210" fill="#fff" font-family="sans-serif" font-size="56" font-weight="800">', _kg(total), ' kg</text>',
            '<text x="32" y="262" fill="#d6efe4" font-family="sans-serif" font-size="15">Plastic ', _kg(grams[0]), ' | Paper ', _kg(grams[1]), '</text>',
            '<text x="32" y="288" fill="#d6efe4" font-family="sans-serif" font-size="15">Metal ', _kg(grams[2]), ' | Glass ', _kg(grams[3]), '</text>',
            '<text x="32" y="360" fill="#c8ec81" font-family="sans-serif" font-size="14">Weighed, accepted and paid on-chain</text></svg>'
        );
    }
}
