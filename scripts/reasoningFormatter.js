// ====================================================================
//  VERITAS AI - Reasoning Formatter Module (v1.0)
//  Fungsi: Format hasil mentah AI jadi reasoning terstruktur.
//  Catatan: Modul ini di-load oleh background.js menggunakan importScripts()
// ====================================================================

function formatReasoning(aiResponse, claimText, sources = []) {
    if (!aiResponse || typeof aiResponse !== "string") {
        return {
            flag: "Error",
            output: "Respons AI kosong atau tidak valid.",
            claim: claimText
        };
    }

    const upper = aiResponse.toUpperCase();
    let flag = "🟡 UNCLEAR";
    if (upper.startsWith("FAKTA") || upper.startsWith("TRUE")) flag = "🟢 TRUE";
    else if (upper.startsWith("MISINFORMASI") || upper.startsWith("FALSE")) flag = "🔴 FALSE";
    else if (upper.startsWith("HATI-HATI") || upper.startsWith("UNCERTAIN")) flag = "🟠 WARNING";

    // Ambil reasoning baris 2-6
    const lines = aiResponse
        .split(/\n|•|-/)
        .map(line => line.trim())
        .filter(l => l.length > 10)
        .slice(0, 3);

    const reasonings = lines.map((r, i) => `${i + 1}. ${r}`).join("\n");
    const links = sources.map(s => `- ${s}`).join("\n") || "- (Belum ada sumber terdeteksi)";

    const formattedOutput = `
${flag}
**"${claimText}"**

**Reasoning:**
${reasonings}

**Links:**
${links}
    `.trim();

    return {
        flag,
        output: formattedOutput,
        claim: claimText
    };
}

// Untuk dipakai di background.js
self.formatReasoning = formatReasoning;

export function formatReasoning(rawText) {
  if (!rawText) return "⚠️ Tidak ada reasoning ditemukan.";
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  let summary = lines.find(line => line.toUpperCase().includes("KESIMPULAN"));
  return summary ? `🧠 ${summary}` : `🧩 ${lines[0]}`;
}