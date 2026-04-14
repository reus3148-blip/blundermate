// Vercel Edge Function for saving feedback to Supabase (REST API)
export const config = {
    runtime: 'edge',
};

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
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
            status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    try {
        const body = await req.json();
        const { content } = body || {};

        if (!content || !content.trim()) {
            return new Response(JSON.stringify({ error: "Feedback content is required." }), { 
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("여기에_URL을_입력하세요")) {
            return new Response(JSON.stringify({ error: "Supabase configuration is missing on the server." }), { 
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Supabase PostgREST REST API
        // Endpoint: /rest/v1/{table_name}
        const insertUrl = `${supabaseUrl}/rest/v1/feedbacks`;
        
        const response = await fetch(insertUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal' // don't need to return the inserted data
            },
            body: JSON.stringify({ content: content })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Supabase Error:", errorText);
            return new Response(JSON.stringify({ error: "Failed to save feedback to database." }), { 
                status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Feedback API Error:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
}
