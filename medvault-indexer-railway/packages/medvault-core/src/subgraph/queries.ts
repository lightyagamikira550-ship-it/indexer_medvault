/** Allowlisted GraphQL operations for MCP (name -> query document). */
export const SUBGRAPH_QUERIES: Record<string, string> = {
  GetSponsorData: `
  query GetSponsorData($sponsor: Bytes!) {
    trials(where: { sponsor: $sponsor }) {
      id
      name
      active
      phase
      location
      compensation
      endTime
      eligibilityResults {
        id
        patient
        computedAt
        txHash
      }
      consents {
        id
        patient
        granted
        validEpoch
        expiresAt
      }
      applications {
        id
        patient
        status
        updatedAt
        message
        txHash
      }
      anonymousSubmissions {
        id
        nullifier
        status
        submittedAt
      }
    }
  }`,
  GetSponsorStats: `
  query GetSponsorStats($sponsor: Bytes!) {
    sponsor(id: $sponsor) {
      id
      name
      verified
      trials {
        id
        name
        active
        applications { id status }
        eligibilityResults { id }
      }
    }
  }`,
  GetSponsorTrialIds: `
  query GetSponsorTrialIds($sponsor: Bytes!) {
    trials(where: { sponsor: $sponsor }) {
      id
    }
  }`,
  GetSubgraphAuditLogs: `
  query GetSubgraphAuditLogs($trialIds: [BigInt!]!, $first: Int!) {
    auditLogs(
      where: { trialId_in: $trialIds }
      orderBy: timestamp
      orderDirection: desc
      first: $first
    ) {
      id
      action
      actionType
      trialId
      patientHash
      timestamp
      performer
      transactionHash
    }
  }`,
  GetTrialsBySponsor: `
  query GetTrialsBySponsor($sponsor: Bytes!) {
    trials(where: { sponsor: $sponsor }, orderBy: createdAt, orderDirection: desc) {
      id
      name
      phase
      location
      active
      endTime
      createdAt
      compensation
    }
  }`,
  GetActiveTrials: `
  query GetActiveTrials($skip: Int, $first: Int) {
    trials(
      where: { active: true }
      orderBy: createdAt
      orderDirection: desc
      skip: $skip
      first: $first
    ) {
      id
      name
      phase
      location
      compensation
      active
      endTime
      sponsor { id name }
    }
  }`,
  GetPendingRequests: `
  query GetPendingRequests {
    sponsorshipRequests(where: { status: "Pending" }) {
      id
      status
      requestedAt
    }
  }`,
};

export const ALLOWED_SUBGRAPH_QUERY_NAMES = Object.keys(SUBGRAPH_QUERIES);

export async function postSubgraph<T = unknown>(
  subgraphUrl: string,
  queryName: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const document = SUBGRAPH_QUERIES[queryName];
  if (!document) {
    throw new Error(
      `Subgraph query "${queryName}" is not allowlisted. Allowed: ${ALLOWED_SUBGRAPH_QUERY_NAMES.join(", ")}`
    );
  }
  if (!subgraphUrl) {
    throw new Error("MEDVAULT_SUBGRAPH_URL is not set");
  }
  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: document, variables: variables ?? {} }),
  });
  if (!response.ok) {
    throw new Error(`Subgraph HTTP ${response.status}: ${response.statusText}`);
  }
  const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }
  return result.data as T;
}
