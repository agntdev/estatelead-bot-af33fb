/** Durable lead records. The index avoids enumerating a storage keyspace. */
export type LeadStatus = "New" | "Done";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  intent: "Buying" | "Renting" | "Selling";
  note: string;
  status: LeadStatus;
  created_at: number;
}

type LeadStoreResponse<T> = { value?: T; error?: string };

interface LeadStoreStub {
  fetch(input: string, init?: { method?: string; body?: string }): Promise<Response>;
}

interface LeadStoreNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): LeadStoreStub;
}

export type LeadStoreContext = { env?: { CHAT_DO?: LeadStoreNamespace } };

export class LeadStore {
  constructor(private readonly stub: LeadStoreStub) {}

  private async request<T>(path: string, init?: { method?: string; body?: string }): Promise<T> {
    const response = await this.stub.fetch(`https://do${path}`, init);
    if (!response.ok) throw new Error("lead storage request failed");
    const payload = (await response.json()) as LeadStoreResponse<T>;
    if (payload.error) throw new Error(payload.error);
    return payload.value as T;
  }

  create(lead: Lead): Promise<void> {
    return this.request<void>("/leads", { method: "POST", body: JSON.stringify(lead) });
  }

  get(id: string): Promise<Lead | undefined> {
    return this.request<Lead | undefined>(`/leads/${encodeURIComponent(id)}`);
  }

  list(): Promise<Lead[]> {
    return this.request<Lead[]>("/leads");
  }

  updateStatus(id: string, status: LeadStatus): Promise<Lead | undefined> {
    return this.request<Lead | undefined>(`/leads/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  delete(id: string): Promise<boolean> {
    return this.request<boolean>(`/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

/** Returns the app-wide Durable Object store when running on Workers. */
export function leadStore(ctx: object): LeadStore | undefined {
  const namespace = (ctx as LeadStoreContext).env?.CHAT_DO;
  if (!namespace) return undefined;
  return new LeadStore(namespace.get(namespace.idFromName("real-estate-leads")));
}
