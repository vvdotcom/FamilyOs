// Private household images (chore photos, family photos) need the session header. Native image views can
// send headers; a browser <img> can't, so on the web the app downloads the image itself and shows a local
// object URL instead.

export class PrivateImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PrivateImageError';
  }
}

type FetchLike = (url: string, init: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob> }>;

/** Download a private image with its headers and return a URL an <img> can show. */
export async function loadWebImage(
  uri: string,
  headers: Record<string, string> | undefined,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): Promise<string> {
  const response = await fetchImpl(uri, { headers });
  if (!response.ok) throw new PrivateImageError(response.status === 404 ? 'removed' : 'unavailable', response.status);
  return createUrl(await response.blob());
}

/** What to say when a private image can't be shown. Chore photos are deleted once a parent decides. */
export function imageFailureText(error: unknown): string {
  return error instanceof PrivateImageError && error.status === 404 ? 'Photo removed after review' : 'Unavailable';
}
