# MedVault Core (`@medvault/core`)

Shared TypeScript library for MedVault services: contract ABIs and addresses, subgraph queries, sponsor operations, wiring checks, and audit log fetching. Dependency of `@medvault/sdk`, `@medvault/mcp-server`, `@medvault/indexer`, and `@medvault/ai`.

## Install / build

```bash
npm run build -w @medvault/core
```

Monorepo workspace package — import as `@medvault/core` from sibling packages.

## Exports (`src/index.ts`)

All public symbols re-exported from:

| Module | Symbols |
|--------|---------|
| `config.ts` | `loadConfigFromEnv`, `MedVaultConfig`, `NetworkKey`, `ETHEREUM_SEPOLIA_CHAIN_ID`, `DEFAULT_RPC_URL` |
| `contracts/index.ts` | `getContract`, `getContractAddresses`, `resolveNetworkKey`, `addresses`, `ContractName`, convenience getters |
| `protocol/catalog.ts` | `PROTOCOL_CONTRACTS` |
| `subgraph/queries.ts` | `SUBGRAPH_QUERIES`, `ALLOWED_SUBGRAPH_QUERY_NAMES`, `postSubgraph` |
| `sponsor/*` | `createTrialOnChain`, `fundTrialPool`, `publishEncryptedPoolSize`, `setTrialMilestones`, `updateTrialApplicationStatus`, `deactivateTrial`, `distributePartialMilestone`, `registerAnonymousParticipantByNullifier`, `reclaimUndistributedPool`, `getSponsorVerification`, `getTrialPoolReclaimStatus`, `computeMilestoneDeadlines`, `assertSponsorCanWrite` |
| `audit/auditLogFetch.ts` | `fetchAuditLogsFromChain`, `AUDIT_ACTION_TYPES`, `actionTypeFromIndex` |
| `wiring/checkWiring.ts` | `checkWiring` |
| `errors/trialManagerRevert.ts` | `normalizeTxError`, `friendlyTrialManagerRevert` |

### Configuration

```typescript
import { loadConfigFromEnv, type MedVaultConfig, type NetworkKey } from "@medvault/core";
```

`loadConfigFromEnv()` reads:

| Env | Field | Default |
|-----|-------|---------|
| `SEPOLIA_RPC_URL` | `rpcUrl` | `https://ethereum-sepolia-rpc.publicnode.com` |
| `MEDVAULT_SUBGRAPH_URL` / `VITE_SUBGRAPH_URL` | `subgraphUrl` | `""` |
| `MEDVAULT_NETWORK` | `networkKey` | `sepolia` |
| `MEDVAULT_SPONSOR_OPEN_ACCESS` | `sponsorOpenAccess` | `false` |
| `MEDVAULT_RELAYER_URL` | `relayerUrl` | optional |
| `MCP_MAX_ETH_PER_TX` | `maxEthPerTx` | optional |
| `MCP_READ_ONLY` | `readOnly` | `false` |

`NetworkKey`: `"sepolia" | "hardhat"`.

`ETHEREUM_SEPOLIA_CHAIN_ID` = `11155111n`.  
`DEFAULT_RPC_URL` = `https://ethereum-sepolia-rpc.publicnode.com`.

### Contracts

```typescript
import {
  getContract,
  getContractAddresses,
  resolveNetworkKey,
  addresses,
  type ContractName,
} from "@medvault/core";
```

**Bundled contract names:** `AnonymousPatientRegistry`, `TrialManager`, `ConsentManager`, `EligibilityEngine`, `ConfidentialETH`, `SponsorIncentiveVault`, `DataAccessLog`, `TrialMilestoneManager`, `SponsorRegistry`, `MedVaultAutomation`, `StakingManager`, `MedVaultRegistry`, `EncryptedScoreLeaderboard`, `HonkVerifier`, `HonkVerifierEncrypted`.

**Addresses:** `packages/medvault-core/data/addresses.json` — keys `sepolia`, `hardhat`.

**ABIs:** `packages/medvault-core/data/abis/*.json` (synced via `npm run sync-abis`).

`getContract(name, signerOrProvider, networkOrChainId?)` returns an ethers `Contract`.

Convenience getters: `getTrialManager`, `getSponsorIncentiveVault`, `getTrialMilestoneManager`, `getEligibilityEngine`, `getSponsorRegistry`, `getDataAccessLog`, `getMedVaultAutomation`.

### Subgraph

```typescript
import {
  SUBGRAPH_QUERIES,
  ALLOWED_SUBGRAPH_QUERY_NAMES,
  postSubgraph,
} from "@medvault/core";
```

Seven allowlisted query documents (see [mcp-server/README.md](../../mcp-server/README.md)).

### Sponsor operations

```typescript
import {
  createTrialOnChain,
  setTrialMilestones,
  fundTrialPool,
  publishEncryptedPoolSize,
  updateTrialApplicationStatus,
  deactivateTrial,
  distributePartialMilestone,
  registerAnonymousParticipantByNullifier,
  reclaimUndistributedPool,
  getSponsorVerification,
  getTrialPoolReclaimStatus,
  computeMilestoneDeadlines,
  assertSponsorCanWrite,
} from "@medvault/core";
```

Re-exported from `src/sponsor/*` and used by MCP write tools and SDK.

**MED-3:** `registerAnonymousParticipantByNullifier` calls `vault.registerAnonymousParticipant` when the signer is the decrypt permit holder. When the patient EOA differs from the ephemeral permit holder, pass `options.identitySecret` (`identity.secretScalar`) to route via `registerAnonymousParticipantFor` (EIP-712), or use relayer `POST /relay/register-anon`.

### Audit logs

```typescript
import { fetchAuditLogsFromChain, AUDIT_ACTION_TYPES, actionTypeFromIndex } from "@medvault/core";
```

Fetches anonymized `DataAccessLog` events over RPC for given trial IDs (used by MCP and AI audit summarization).

### Wiring

```typescript
import { checkWiring, PROTOCOL_CONTRACTS } from "@medvault/core";
```

`checkWiring(provider, networkKey)` verifies cross-contract references (vault, automation, milestones, trial manager).

`PROTOCOL_CONTRACTS` — canonical catalog of roles and key functions for `medvault_list_protocol_contracts`.

### Errors

```typescript
import { normalizeTxError, friendlyTrialManagerRevert } from "@medvault/core";
```

TrialManager revert decoding helpers in `src/errors/trialManagerRevert.ts`.

## Package layout

```
packages/medvault-core/
  data/
    abis/          # JSON ABIs (generated from contracts/)
    addresses.json # Per-network deployments
  src/
    config.ts
    contracts/
    subgraph/queries.ts
    sponsor/
    audit/auditLogFetch.ts
    wiring/checkWiring.ts
    protocol/catalog.ts
    errors/
```

## Tests

`tests/resolveNetworkKey.test.ts` covers `resolveNetworkKey` (node:test).

> **Engineering gap:** this package has no `test` script in `package.json` and is not wired into CI. Add `"test": "node --import tsx --test tests/*.test.ts"` and a root/CI target as a follow-up task.

## Related

- [packages/medvault-sdk/README.md](../medvault-sdk/README.md) — public integrator facade
- [mcp-server/README.md](../../mcp-server/README.md) — MCP tools using core
- [indexer/README.md](../../indexer/README.md) — hybrid indexer
