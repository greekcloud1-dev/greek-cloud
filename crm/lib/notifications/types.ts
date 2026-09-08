export interface OutboundNotification {
  title: string;
  body: string;
  actionUrl?: string;
  idempotencyKey: string;
}

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

export interface IntegrationReadiness {
  configured: boolean;
  missing: string[];
}
