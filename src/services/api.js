// Minimal API helper using fetch with 401 auto-logout
const apiFetch = async (path, opts = {}) => {
  // Prefer an explicit API_BASE set by config or window (used for tunnels).
  // If not present, use a relative path so requests go to the local XAMPP PHP router
  // regardless of origin (useful when frontend is served from Live Server or a dev tunnel).
  const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '../server-php/index.php/api';
  const url = base.replace(/\/+$/,'') + '/' + String(path).replace(/^\/?/, '');
  const token = localStorage.getItem('token');
  const headers = Object.assign({}, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!headers['Content-Type'] && opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  try {
    console.debug('[apiFetch] Request', opts.method || 'GET', url);
    const res = await fetch(url, Object.assign({}, opts, { headers }));

    // Read the response body as text once to avoid re-reading the stream.
    const resText = await res.text();

    if (!res.ok) {
      // handle 401 -> clear auth and redirect to login
      if (res.status === 401) {
        try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch (e) {}
        window.location.hash = '#/login';
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
      }

      // Try to parse JSON from the text body for structured error info
      let body = null;
      try { body = resText ? JSON.parse(resText) : null; } catch (e) { body = resText; }
      const err = new Error((body && body.error) ? body.error : res.statusText || 'API error');
      err.status = res.status;
      err.body = body;
      throw err;
    }

    // For successful responses, attempt to parse JSON from the text
    try {
      return resText ? JSON.parse(resText) : null;
    } catch (parseErr) {
      console.error('[apiFetch] Invalid JSON received from', url, resText.slice(0,1000));
      const e = new Error('Invalid JSON response from ' + url + ': ' + (resText && resText.slice ? resText.slice(0,500) : String(resText)));
      e.bodyText = resText;
      throw e;
    }
  } catch (err) {
    // Network or other errors
    console.error('[apiFetch] Network error', err, 'url=', url);
    const e = new Error('Network request failed to ' + url + ': ' + (err && err.message ? err.message : String(err)));
    e.original = err;
    throw e;
  }
};

const apiGet = (path) => apiFetch(path);
const apiPost = (path, payload) => apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
const apiPut = (path, payload) => apiFetch(path, { method: 'PUT', body: JSON.stringify(payload) });
const apiDelete = (path, payload) => apiFetch(path, { method: 'DELETE', body: payload ? JSON.stringify(payload) : undefined });

// expose globals for legacy code that expects apiGet/apiPost
try { window.apiFetch = apiFetch; window.apiGet = apiGet; window.apiPost = apiPost; window.apiPut = apiPut; window.apiDelete = apiDelete; } catch(e) {}

// exports for module consumers
export { apiFetch, apiGet, apiPost, apiPut, apiDelete };
