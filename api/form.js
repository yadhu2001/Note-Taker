import { put, head } from "@vercel/blob";

const FORM_PATH = "form/form.json";

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  // Vercel often pre-parses JSON into req.body
  if (req.body && typeof req.body === "object") return req.body;

  // fallback: read raw
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeState(state) {
  // minimal validation/normalization
  if (!state || typeof state !== "object") return { sections: [] };
  if (!Array.isArray(state.sections)) return { sections: [] };

  // keep only expected shape (avoid junk)
  const clean = {
    sections: state.sections.map((s) => ({
      id: String(s.id || ""),
      title: String(s.title || ""),
      questions: Array.isArray(s.questions)
        ? s.questions.map((q) => ({
            id: String(q.id || ""),
            type: String(q.type || "text"),
            label: String(q.label || ""),
            required: !!q.required,
            options: Array.isArray(q.options)
              ? q.options.map((o) => ({
                  id: String(o.id || ""),
                  text: String(o.text || ""),
                  followUp: o.followUp ? String(o.followUp) : "none",
                  subOptions: Array.isArray(o.subOptions)
                    ? o.subOptions.map((so) => ({ text: String(so.text || "") }))
                    : []
                }))
              : []
          }))
        : []
    }))
  };

  return clean;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const meta = await head(FORM_PATH);
      const r = await fetch(meta.url, { cache: "no-store" });
      if (!r.ok) return sendJson(res, 200, { sections: [] });
      const data = await r.json();
      return sendJson(res, 200, normalizeState(data));
    } catch {
      // if blob doesn't exist yet
      return sendJson(res, 200, { sections: [] });
    }
  }

  if (req.method === "POST") {
    // ✅ PASSWORD REMOVED — anyone can save
    const body = await readJsonBody(req);
    if (!body) return sendJson(res, 400, { ok: false, message: "Invalid JSON" });

    const cleaned = normalizeState(body);

    const blob = await put(FORM_PATH, JSON.stringify(cleaned), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });

    return sendJson(res, 200, { ok: true, url: blob.url });
  }

  return sendJson(res, 405, { ok: false, message: "Method Not Allowed" });
}


// Thank You