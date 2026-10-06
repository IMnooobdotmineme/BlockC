// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Stores certificate commitments, not recipient personal information.
contract CertificateRegistry {
    struct Certificate {
        string certificateId;
        bytes32 certificateHash;
        address issuer;
        uint256 issuedAt;
        uint256 expirationAt;
        bool revoked;
    }

    address public immutable owner;
    mapping(address => bool) public authorizedIssuers;
    mapping(bytes32 => Certificate) private certificates;

    error Unauthorized();
    error InvalidCertificate();
    error CertificateAlreadyExists();
    error CertificateNotFound();
    error CertificateAlreadyRevoked();

    event CertificateRegistered(string certificateId, bytes32 certificateHash, address indexed issuer, uint256 issuedAt, uint256 expirationAt);
    event CertificateRevoked(string certificateId, address indexed revokedBy);
    event IssuerAuthorizationChanged(address indexed issuer, bool authorized);

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;
    }

    function setIssuerAuthorization(address issuer, bool authorized) external {
        if (msg.sender != owner) revert Unauthorized();
        if (issuer == address(0)) revert InvalidCertificate();
        authorizedIssuers[issuer] = authorized;
        emit IssuerAuthorizationChanged(issuer, authorized);
    }

    function registerCertificate(string calldata certificateId, bytes32 certificateHash, uint256 issuedAt, uint256 expirationAt) external {
        if (msg.sender != owner && !authorizedIssuers[msg.sender]) revert Unauthorized();
        bytes memory id = bytes(certificateId);
        if (id.length == 0 || id.length > 64 || certificateHash == bytes32(0) || issuedAt == 0 || expirationAt <= issuedAt) revert InvalidCertificate();
        bytes32 key = keccak256(id);
        if (certificates[key].issuer != address(0)) revert CertificateAlreadyExists();
        certificates[key] = Certificate(certificateId, certificateHash, msg.sender, issuedAt, expirationAt, false);
        emit CertificateRegistered(certificateId, certificateHash, msg.sender, issuedAt, expirationAt);
    }

    function certificateExists(string calldata certificateId) public view returns (bool) {
        return certificates[keccak256(bytes(certificateId))].issuer != address(0);
    }

    function getCertificate(string calldata certificateId) external view returns (Certificate memory) {
        Certificate memory certificate = certificates[keccak256(bytes(certificateId))];
        if (certificate.issuer == address(0)) revert CertificateNotFound();
        return certificate;
    }

    function revokeCertificate(string calldata certificateId) external {
        Certificate storage certificate = certificates[keccak256(bytes(certificateId))];
        if (certificate.issuer == address(0)) revert CertificateNotFound();
        if (msg.sender != owner && (msg.sender != certificate.issuer || !authorizedIssuers[msg.sender])) revert Unauthorized();
        if (certificate.revoked) revert CertificateAlreadyRevoked();
        certificate.revoked = true;
        emit CertificateRevoked(certificateId, msg.sender);
    }

    function verifyCertificate(string calldata certificateId, bytes32 expectedHash) external view returns (bool exists, bool hashMatches, bool revoked, bool expired) {
        Certificate memory certificate = certificates[keccak256(bytes(certificateId))];
        exists = certificate.issuer != address(0);
        if (!exists) return (false, false, false, false);
        hashMatches = certificate.certificateHash == expectedHash;
        revoked = certificate.revoked;
        expired = block.timestamp >= certificate.expirationAt;
    }
}
