export const certificateRegistryAbi = [
  "function owner() view returns (address)",
  "function authorizedIssuers(address) view returns (bool)",
  "function setIssuerAuthorization(address issuer, bool authorized)",
  "function registerCertificate(string certificateId, bytes32 certificateHash, uint256 issuedAt, uint256 expirationAt)",
  "function getCertificate(string certificateId) view returns (tuple(string certificateId, bytes32 certificateHash, address issuer, uint256 issuedAt, uint256 expirationAt, bool revoked))",
  "function certificateExists(string certificateId) view returns (bool)",
  "function revokeCertificate(string certificateId)",
  "function verifyCertificate(string certificateId, bytes32 expectedHash) view returns (bool exists, bool hashMatches, bool revoked, bool expired)",
  "event CertificateRegistered(string certificateId, bytes32 certificateHash, address indexed issuer, uint256 issuedAt, uint256 expirationAt)",
  "event CertificateRevoked(string certificateId, address indexed revokedBy)",
  "event IssuerAuthorizationChanged(address indexed issuer, bool authorized)",
  "error Unauthorized()", "error InvalidCertificate()", "error CertificateAlreadyExists()", "error CertificateNotFound()", "error CertificateAlreadyRevoked()",
] as const;
