// Vercel Edge Function: log entered chess.com usernames to Supabase username_logs.
// Fire-and-forget — UX에 영향 주지 않도록 클라이언트는 await/에러 무시.
import { normalizePlatform } from './_platform.js';
import { jsonResponse, methodGuard, supabaseHeaders } from './_http.js';

export const config = {
    runtime: 'edge',
    regions: ['icn1'],
};

const ALLOWED_SOURCES = new Set(['onboarding', 'search', 'cached']);
const MAX_USERNAME_LEN = 64;

export default async function handler(req) {
    const rejection = methodGuard(req);
    if (rejection) return rejection;

    try {
        const body = await req.json();
        const rawUsername = typeof body?.username === 'string' ? body.username.trim() : '';
        const source = typeof body?.source === 'string' ? body.source : '';
        const platform = normalizePlatform(body?.platform);

        if (!rawUsername || !ALLOWED_SOURCES.has(source)) {
            return jsonResponse({ error: 'invalid payload' }, 400);
        }

        const username = rawUsername.slice(0, MAX_USERNAME_LEN);

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return jsonResponse({ error: 'config missing' }, 500);
        }

        const insertUrl = `${supabaseUrl}/rest/v1/username_logs`;
        const response = await fetch(insertUrl, {
            method: 'POST',
            headers: supabaseHeaders(supabaseKey, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ username, source, platform })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('username_logs insert failed:', errorText);
            return jsonResponse({ error: 'insert failed' }, response.status);
        }

        return jsonResponse({ success: true });
    } catch (error) {
        console.error('log-username error:', error);
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}
