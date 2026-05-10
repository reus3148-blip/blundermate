// Vercel Edge Function for saving feedback to Supabase (REST API)
import { jsonResponse, methodGuard, supabaseHeaders } from './_http.js';

export const config = {
    runtime: 'edge',
    regions: ['icn1'],
};

export default async function handler(req) {
    const rejection = methodGuard(req);
    if (rejection) return rejection;

    try {
        const body = await req.json();
        const { content } = body || {};

        if (!content || !content.trim()) {
            return jsonResponse({ error: "Feedback content is required." }, 400);
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("여기에_URL을_입력하세요")) {
            return jsonResponse({ error: "Supabase configuration is missing on the server." }, 500);
        }

        const insertUrl = `${supabaseUrl}/rest/v1/feedbacks`;
        const response = await fetch(insertUrl, {
            method: 'POST',
            headers: supabaseHeaders(supabaseKey, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ content })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Supabase Error:", errorText);
            return jsonResponse({ error: "Failed to save feedback to database." }, response.status);
        }

        return jsonResponse({ success: true });
    } catch (error) {
        console.error("Feedback API Error:", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
    }
}
