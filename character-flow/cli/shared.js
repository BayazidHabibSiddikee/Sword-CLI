export function createSharedClient(provider) {
  const endpoint = new URL(provider.url);
  if (!endpoint.pathname.endsWith('/v1/chat/completions')) throw new Error('Shared sessions require a swordcli endpoint');
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) throw new Error('Remote backend requires HTTPS');
  endpoint.pathname = endpoint.pathname.replace(/\/v1\/chat\/completions$/, '/api/sword');
  const base = endpoint.href;
  async function call(method, route, body) {
    const response = await fetch(`${base}${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Shared backend HTTP ${response.status}; for 409 reload the session before retrying; for 404 restart the updated backend`);
    let text = ''; const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      text += decoder.decode(chunk, { stream: true });
      if (text.length > 2000000) throw new Error('Shared response too large');
    }
    const payload = JSON.parse(text + decoder.decode());
    if (!payload.success || !payload.data) throw new Error('Invalid shared backend response');
    return payload.data;
  }
  function route(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid session id');
    return `/sessions/${id}`;
  }
  function session(data) {
    if (!data.session || !Array.isArray(data.session.messages) || !Number.isSafeInteger(data.session.revision)) throw new Error('Invalid shared session');
    return data.session;
  }
  return {
    createSession: async input => session(await call('POST', '/sessions', input)),
    getSession: async id => session(await call('GET', route(id))),
    saveMessages: async (id, messages, revision) => session(await call('PUT', `${route(id)}/messages`, { messages, revision })),
    context: async (id, query) => {
      const result = await call('GET', `${route(id)}/context?q=${encodeURIComponent(query.slice(0, 200))}`);
      if (typeof result.context !== 'string' || result.context.length > 14000) throw new Error('Invalid shared context');
      return result.context;
    }
  };
}

// Retain a suffix of complete user turns, so no tool result loses its call.
export function recentContext(messages, budget = 60000) {
  const history = messages.filter(message => !['system', 'developer'].includes(message.role));
  let start = history.length, size = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    size += JSON.stringify(history[i]).length;
    if (size > budget) break;
    if (history[i].role === 'user') start = i;
  }
  if (history.length && start === history.length) throw new Error('Latest turn too large for context; start a new shared session');
  return history.slice(start);
}
