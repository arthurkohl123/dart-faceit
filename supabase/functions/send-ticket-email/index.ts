import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

interface WebhookPayload {
  ticket_id: string;
  subject: string;
  category: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const payload: WebhookPayload = await req.json();

    // Initialize Supabase client for fetching user details
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch user email to include in the notification
    const { data: userData, error: userError } = await supabaseClient
      .from("profiles")
      .select("username, email")
      .eq("supabaseId", payload.user_id)
      .single();

    if (userError) {
      console.error("Error fetching user details:", userError);
    }

    const userIdentifier = userData ? `${userData.username} (${userData.email || payload.user_id})` : payload.user_id;

    // Use Resend to send the email
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RankedDarts Support <support@rankeddarts.de>", // Ensure this domain is verified in Resend
        to: ["support@rankeddarts.de"], // The fixed internal support email
        subject: `Neues Support-Ticket: ${payload.subject} (#${payload.ticket_id.substring(0, 8)})`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #10b981;">Neues Support-Ticket erstellt</h2>
            <p>Hallo Support-Team,</p>
            <p>ein neues Ticket wurde auf RankedDarts eröffnet:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${payload.ticket_id}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Betreff:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${payload.subject}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Kategorie:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${payload.category}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Eröffnet von:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${userIdentifier}</td>
              </tr>
            </table>
            <p style="margin-top: 20px;">
              <a href="https://rankeddarts.de/admin" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Zum Admin-Panel</a>
            </p>
            <p style="font-size: 0.8em; color: #777; margin-top: 30px;">
              Dies ist eine automatisch generierte Benachrichtigung von RankedDarts.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }

    return new Response(JSON.stringify({ message: "Email sent successfully", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});