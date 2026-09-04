import { parseAbi } from "viem"

// Read-only subset of TripwireGuard.sol - enough for a read-only dashboard
// (#16's acceptance criteria). Write calls (setLimits, freeze/unfreeze) are
// #18's job.
export const GUARD_READ_ABI = parseAbi([
  "function owner() view returns (address)",
  "function avatar() view returns (address)",
  "function riskRegistry() view returns (address)",
  "function freezeAuthority() view returns (address)",
  "function frozen() view returns (bool)",
  "function perTxLimit() view returns (uint256)",
  "function rollingLimit() view returns (uint256)",
  "function windowSpent() view returns (uint256)",
])
