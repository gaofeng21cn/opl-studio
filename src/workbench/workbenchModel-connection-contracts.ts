export type ConnectionAuthorizationCapability = {
  id: string;
  label: string;
  risk?: string;
};

export type AuthorizedConnectionSummary = {
  id: string;
  displayName: string;
  providerType?: string;
  status?: string;
  securityRevision?: number;
  accountLabel?: string;
  capabilities: ConnectionAuthorizationCapability[];
};

export type ConnectionAuthorizationConsumer = {
  packageId: string;
  displayName: string;
};

export type ConnectionAccessRequest = {
  requestId: string;
  status: string;
  consumer: ConnectionAuthorizationConsumer;
  connection: AuthorizedConnectionSummary;
  capabilities: ConnectionAuthorizationCapability[];
  requestedAt?: string;
};

export type ConnectionGrant = ConnectionAccessRequest & {
  grantId: string;
  grantedAt?: string;
  staleReason?: string;
};

export type ConnectionInvocation = {
  invocationId: string;
  consumerPackageId: string;
  consumerDisplayName: string;
  connectionId: string;
  connectionDisplayName: string;
  capabilityId: string;
  capabilityLabel: string;
  startedAt?: string;
  finishedAt?: string;
  disposition: string;
};

export type AvailableRelayConnection = {
  mailboxRef: string;
  displayName: string;
  accountLabel?: string;
};

export type ConnectionAuthorizationProjection = {
  requests: ConnectionAccessRequest[];
  grants: ConnectionGrant[];
  invocations: ConnectionInvocation[];
  connections: AuthorizedConnectionSummary[];
  availableRelayConnections: AvailableRelayConnection[];
};
