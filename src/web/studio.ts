import { api } from './api.ts';
import { prepareImage } from './image.ts';

export const BASES = ['purchase_receipt', 'brand_boutique', 'provider_certificate', 'expert_consensus', 'seller_claim', 'unverified'] as const;
export const LICENCES = ['own', 'consented', 'licensed', 'public_domain', 'unknown'] as const;
export const STAFF_ROLES = ['owner', 'lead_authenticator', 'appraiser'];
export const ADMIN_ROLES = ['owner', 'lead_authenticator'];

/** Re-encode (strips EXIF/GPS) and upload one reference photo with its metadata. */
export async function uploadReference(file: File, fields: Record<string, string | number | undefined>): Promise<{ id: string; status: string }> {
  const p = await prepareImage(file);
  const fd = new FormData();
  fd.append('file', new File([p.blob], 'ref.jpg', { type: 'image/jpeg' }));
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') fd.append(k, String(v));
  return api.post('/api/assets', fd);
}

export const assetImg = (id: string) => `/api/assets/${id}/image`;

/**
 * After an upload, ask the AI to draw "look here" points and, for a date-code photo, to read the code.
 * Best effort: when AI is not configured (501) or fails, the photo is simply posted without them.
 */
export async function annotateAfterUpload(assetId: string, part?: string | null): Promise<void> {
  await api.post(`/api/assets/${assetId}/points/suggest`).catch(() => {});
  if (part === 'date_code') await api.post(`/api/assets/${assetId}/datecode-analysis`, {}).catch(() => {});
}
