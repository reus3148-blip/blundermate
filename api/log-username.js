// Vercel Edge Function: log entered chess.com usernames to Supabase username_logs.
// Fire-and-forget — UX에 영향 주지 않도록 클라이언트는 await/에러 무시.
export const config = {
    runtime: 'edge',
};

const ALLOWED_SOURCES = new Set(['onboarding', 'search', 'cached']);
const MAX_USERNAME_LEN = 64;

export default async function handler(req) {
    const corsHeaders = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await req.json();
        const rawUsername = typeof body?.username === 'string' ? body.username.trim() : '';
        const source = typeof body?.source === 'string' ? body.source : '';

        if (!rawUsername || !ALLOWED_SOURCES.has(source)) {
            return new Response(JSON.stringify({ error: 'invalid payload' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const username = rawUsername.slice(0, MAX_USERNAME_LEN);

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ error: 'config missing' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const insertUrl = `${supabaseUrl}/rest/v1/username_logs`;
        const response = await fetch(insertUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ username, source })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('username_logs insert failed:', errorText);
            return new Response(JSON.stringify({ error: 'insert failed' }), {
                status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('log-username error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
