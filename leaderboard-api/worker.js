// Solar Strike Redux — Leaderboard API
// Deploys to Cloudflare Workers. Stores top scores in KV.
// Endpoints:
//   GET  /scores         → returns top 20 entries as JSON array
//   POST /scores         → body: {name, score, completed, agent} → adds entry
//   GET  /               → human-readable docs

const MAX_STORED = 100;     // total entries kept in KV
const MAX_RETURNED = 20;    // returned by GET
const MAX_SCORE = 99_999_999;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ 'Content-Type': 'application/json', ...extra }),
  });
}

function sanitiseName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .slice(0, 12)
    .trim();
}

async function getBoard(env) {
  const raw = await env.SCORES.get('board');
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveBoard(env, board) {
  await env.SCORES.put('board', JSON.stringify(board.slice(0, MAX_STORED)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    if (url.pathname === '/scores' && request.method === 'GET') {
      const board = await getBoard(env);
      return json(board.slice(0, MAX_RETURNED));
    }

    if (url.pathname === '/scores' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'bad-json' }, 400); }

      const name = sanitiseName(body.name);
      const score = Math.max(0, Math.min(MAX_SCORE, parseInt(body.score, 10) || 0));
      const completed = !!body.completed;
      const agent = !!body.agent;

      if (!name || score <= 0) {
        return json({ error: 'invalid', detail: 'name + score required' }, 400);
      }

      const board = await getBoard(env);
      const entry = { name, score, completed, agent, at: Date.now() };
      board.push(entry);
      board.sort((a, b) => b.score - a.score);
      await saveBoard(env, board);

      const rank = board.findIndex(
        (r) => r.at === entry.at && r.name === entry.name && r.score === entry.score
      ) + 1;
      return json({ ok: true, rank, of: board.length });
    }

    if (url.pathname === '/' && request.method === 'GET') {
      const text = [
        'Solar Strike Redux — Leaderboard API',
        '',
        'GET  /scores      → top ' + MAX_RETURNED + ' scores',
        'POST /scores      → {name, score, completed} → submit',
        '',
        'Names: A-Z, 0-9, space. Max 12 chars. Auto-uppercased.',
      ].join('\n');
      return new Response(text, { headers: cors({ 'Content-Type': 'text/plain' }) });
    }

    return new Response('not found', { status: 404, headers: cors() });
  },
};
