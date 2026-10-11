export type DomainEvent<TPayload> = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
};
