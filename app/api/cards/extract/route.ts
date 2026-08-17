import { NextResponse } from "next/server";
import { extractCardFromText, pdfToText } from "@/lib/extract";
import { GroqNotConfiguredError, GroqRateLimitError, GroqSchemaError } from "@/lib/groq";
import { lookupCardTerms } from "@/lib/lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Searching the web and then extracting is two model calls back to back.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = await readInput(request);

    // Looking a card up by name searches the web for its terms first, then runs
    // the very same extractor over what came back. The web is the only new part;
    // the rules are still produced under a strict schema and still reviewed by
    // you before anything is written.
    if (input.name) {
      const { terms, sources } = await lookupCardTerms(input.name);
      const card = await extractCardFromText(terms, sources[0] ?? "", input.name);
      return NextResponse.json({
        card: {
          ...card,
          sources,
          uncertainties: [
            "These rules came from a web search rather than a document you supplied. Check the rates and caps against the issuer's page before saving.",
            ...card.uncertainties,
          ],
        },
      });
    }

    if (!input.text.trim()) {
      return NextResponse.json(
        { error: "No readable text found. If the PDF is a scan, paste the terms instead." },
        { status: 400 },
      );
    }

    const card = await extractCardFromText(input.text, input.sourceUrl);
    return NextResponse.json({ card });
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json(
        { error: "Reading card terms needs a Groq API key in .env.local." },
        { status: 503 },
      );
    }
    if (err instanceof GroqRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof GroqSchemaError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Could not read that card's terms.";
    console.error("extract failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Input = { text: string; sourceUrl: string; name: string };

async function readInput(request: Request): Promise<Input> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const sourceUrl = String(form.get("sourceUrl") ?? "");
    const file = form.get("file");
    if (file instanceof File) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { text: await pdfToText(bytes), sourceUrl, name: "" };
    }
    return { text: String(form.get("text") ?? ""), sourceUrl, name: "" };
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    sourceUrl?: string;
    name?: string;
  };
  return { text: body.text ?? "", sourceUrl: body.sourceUrl ?? "", name: body.name?.trim() ?? "" };
}
