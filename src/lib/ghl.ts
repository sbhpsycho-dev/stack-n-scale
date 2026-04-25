const GHL_BASE = "https://services.leadconnectorhq.com";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: "2021-07-28",
  };
}

export type GHLContact = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tags?: string[];
  customField?: { id: string; value: string }[];
};

export async function createContact(data: {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  tags?: string[];
}): Promise<GHLContact> {
  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...data, locationId: process.env.GHL_LOCATION_ID }),
  });
  if (!res.ok) throw new Error(`GHL createContact: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.contact ?? json;
}

export async function getContactByEmail(email: string): Promise<GHLContact | null> {
  const res = await fetch(
    `${GHL_BASE}/contacts/?locationId=${process.env.GHL_LOCATION_ID}&query=${encodeURIComponent(email)}&limit=1`,
    { headers: headers() }
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json.contacts?.[0] ?? null;
}

export async function updateContactField(
  contactId: string,
  field: string,
  value: string
): Promise<void> {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ customFields: [{ id: field, value }] }),
  });
  if (!res.ok) throw new Error(`GHL updateContactField: ${res.status} ${await res.text()}`);
}

export async function updateContact(
  contactId: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`GHL updateContact: ${res.status} ${await res.text()}`);
}

export async function addTag(contactId: string, tag: string): Promise<void> {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tags: [tag] }),
  });
  if (!res.ok) throw new Error(`GHL addTag: ${res.status} ${await res.text()}`);
}

export async function removeTag(contactId: string, tag: string): Promise<void> {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags/`, {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ tags: [tag] }),
  });
  if (!res.ok) throw new Error(`GHL removeTag: ${res.status} ${await res.text()}`);
}
