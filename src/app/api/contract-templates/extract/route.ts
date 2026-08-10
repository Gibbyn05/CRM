import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "Kun ledere kan behandle kontraktsmaler." }, { status: 403 });

  const limited = await enforceRateLimit(req, { name: "contract-templates:extract", limit: 10, windowSeconds: 60, userId: user.id });
  if (limited) return limited;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Dokumenttolking er ikke konfigurert." }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fil mangler." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Automatisk uttrekk støtter PDF. For Word-filer kan teksten limes inn manuelt." }, { status: 415 });
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "PDF-filen kan være maksimalt 12 MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_CONTRACT_MODEL ?? "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 8000,
      input: [{
        role: "user",
        content: [
          { type: "input_file", filename: file.name, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` },
          { type: "input_text", text: "Transkriber hele kontrakten til ren tekst. Bevar overskrifter, nummerering, avsnitt, klausuler og plassering av parts- og prisfelt. Ikke oppsummer, omskriv eller gi juridiske råd. Returner bare kontraktsteksten." },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
    error?: { message?: string };
  };
  if (!response.ok) return NextResponse.json({ error: payload.error?.message ?? "Kunne ikke lese PDF-filen." }, { status: 502 });
  const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join("\n") ?? "";
  if (!text.trim()) return NextResponse.json({ error: "PDF-filen ga ingen lesbar kontraktstekst." }, { status: 422 });
  return NextResponse.json({ text: text.trim() });
}
