import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const KEY = process.env.GROQ_API_KEY!.trim();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function proposeUrls(name: string): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You know where credit card issuers publish their card pages. Given a card name, return the most likely URLs on the ISSUER'S OWN site for that card's product page. Order them most to least likely. Never return blogs, aggregators, or search pages.",
        },
        { role: "user", content: `Official product page URLs for the "${name}" credit card.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sources",
          strict: true,
          schema: {
            type: "object",
            properties: {
              urls: { type: "array", items: { type: "string" } },
            },
            required: ["urls"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const body = await res.json();
  if (res.status !== 200) {
    console.log("  proposal failed", res.status, JSON.stringify(body).slice(0, 200));
    return [];
  }
  return JSON.parse(body.choices[0].message.content).urls as string[];
}

const SIGNALS = [/\d\s*[x×]\b/i, /\d+(\.\d+)?\s*%/, /annual fee/i, /cash back|points?|miles?/i];

async function tryCard(name: string) {
  console.log(`\n=== ${name}`);
  const urls = await proposeUrls(name);
  console.log("  proposed:", urls);

  for (const url of urls.slice(0, 4)) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.log(`  ${res.status} ${url}`);
        continue;
      }
      const text = toText(await res.text());
      const hits = SIGNALS.filter((re) => re.test(text)).length;
      console.log(`  200 signals=${hits}/4 text=${text.length} ${url}`);
      if (hits >= 3) {
        console.log(`  >>> USABLE`);
        break;
      }
    } catch (err) {
      console.log(`  ERR ${url} -> ${(err as Error).message}`);
    }
  }
}

async function main() {
  for (const name of [
    "Chase Freedom Flex",
    "Amex Blue Cash Preferred",
    "Citi Custom Cash",
    "HDFC Regalia Gold",
    "Axis Bank ACE",
  ]) {
    await tryCard(name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
