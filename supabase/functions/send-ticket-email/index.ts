import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

interface WebhookPayload {
  ticket_id: string;
  subject: string;
  category: string;
  user_id: string;
}

serve(async (req ) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const payload: WebhookPayload = await req.json();
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // Wir laden nur den Benutzernamen (der existiert sicher)
    const { data: userData } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("supabaseId", payload.user_id)
      .single();

    const userDisplayName = userData?.username || "Unbekannter User";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return new Response("Missing RESEND_API_KEY", { status: 500 });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "RankedDarts Support <support@rankeddarts.de>",
        to: ["support@rankeddarts.de"],
        subject: `Neues Support-Ticket: ${payload.subject}`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.6;">
            <h2>Neues Support-Ticket</h2>
            <p><strong>Von:</strong> ${userDisplayName} (ID: ${payload.user_id} )</p>
            <p><strong>Betreff:</strong> ${payload.subject}</p>
            <p><strong>Kategorie:</strong> ${payload.category}</p>
            <p><a href="https://rankeddarts.de/admin">Zum Admin-Panel</a></p>
          </div>
        `,
      } ),
    });

    return new Response(JSON.stringify({ message: "Email sent" }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
