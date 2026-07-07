// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VintagePassport
/// @notice ヴィンテージ品の鑑定書をNFT化する。鑑定データはミント後 **書き換え不可**。
///         実データ(画像・鑑定書JSON)はIPFS、チェーンにはハッシュと要約属性のみを持つ。
///         転送履歴 = 標準ERC-721の Transfer イベント。
contract VintagePassport is ERC721URIStorage, Ownable {
    struct Appraisal {
        bytes32 appraisalHash; // 鑑定書JSONのSHA-256
        bytes32 criteriaHash; // 判定基準表のSHA-256
        string estimatedEra; // 例 "1974-1976"
        uint8 confidence; // 0-100
        uint64 appraisedAt; // unix time
    }

    mapping(uint256 => Appraisal) public appraisals;

    uint256 private _nextTokenId;

    event AppraisalMinted(
        uint256 indexed tokenId,
        bytes32 appraisalHash,
        string estimatedEra
    );

    constructor()
        ERC721("Vintage Passport", "VPASS")
        Ownable(msg.sender)
    {}

    /// @notice 鑑定書付きでミントする。ミント権限はデプロイヤー(カストディアルウォレット)のみ。
    /// @param to 受取アドレス
    /// @param tokenURI_ ipfs://<鑑定書JSONのCID>
    /// @param a 鑑定データ(ミント後書き換え不可)
    /// @return tokenId 発行された tokenId
    function mintWithAppraisal(
        address to,
        string calldata tokenURI_,
        Appraisal calldata a
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        appraisals[tokenId] = a;
        emit AppraisalMinted(tokenId, a.appraisalHash, a.estimatedEra);
    }

    /// @notice 発行済みトークン総数
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // setter は意図的に作らない(鑑定データの改ざん不可を担保)。
}
