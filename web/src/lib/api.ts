export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Called on any 401 so the app can return to the sign-in page.
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

const OFFLINE = 'Can’t reach the Linkr server. Check your connection.';

function parse<T>(path: string, status: number, text: string): T {
  if (status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (e.g. a proxy's error page)
  }
  if (status < 200 || status >= 300) throw new ApiError(status, data?.message ?? `Request failed (${status})`);
  return data as T;
}

// JSON by default; FormData and Blobs (files) are sent as they are.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const raw = body instanceof FormData || body instanceof Blob;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body instanceof Blob) headers['content-type'] = body.type || 'application/octet-stream';
  else if (!raw) headers['content-type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  return parse<T>(path, response.status, await response.text());
}

// fetch() can't report upload progress, so uploads use XMLHttpRequest.
function upload<T>(path: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        resolve(parse<T>(path, xhr.status, xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new ApiError(0, OFFLINE));
    xhr.send(file);
  });
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload,
};
