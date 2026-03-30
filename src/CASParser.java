import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import com.google.gson.*;

import java.util.*;
import java.util.regex.*;

/**
 * Pure-Java parser for CDSL Consolidated Account Statement (CAS) PDFs.
 * Requires: lib/pdfbox-app-2.0.31.jar, lib/gson.jar
 */
public class CASParser {

    // ── public entry point ────────────────────────────────────────────────────

    public static String parse(byte[] pdfBytes, String password) throws Exception {
        String raw;
        try (PDDocument doc = (password != null && !password.isEmpty())
                ? PDDocument.load(pdfBytes, password)
                : PDDocument.load(pdfBytes)) {
            PDFTextStripper ts = new PDFTextStripper();
            ts.setSortByPosition(true);
            raw = ts.getText(doc);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
            if (msg.contains("password") || msg.contains("encrypt") || msg.contains("decrypt")) {
                throw new Exception("Incorrect PDF password. CAS password is usually your PAN in uppercase.");
            }
            throw e;
        }

        // Normalise
        String text = raw
            .replaceAll("[\\u0900-\\u097F\\u200B-\\u200D\\uFEFF]+", " ")
            .replace("\u00AD", "")    // soft-hyphen removal
            .replaceAll("\r\n|\r", "\n")
            .replaceAll("[ \t]+", " ");

        // Pre-process: re-join ISIN split across lines
        text = rejoinSplitISINs(text);

        JsonObject root = new JsonObject();
        root.add("investor",       parseInvestor(text));
        root.add("summary",        parseSummary(text));
        root.add("monthlyHistory", parseMonthlyHistory(text));

        // Build scheme code→{name,amc} map from folio detail section
        Map<String, SchemeInfo> schemeMap = buildSchemeMap(text);

        // Parse SIP instalment counts per scheme ISIN
        Map<String, Integer> sipByIsin = parseSIPInstalments(text);

        JsonArray mfHoldings = parseMFHoldings(text, schemeMap, sipByIsin);
        root.add("mfHoldings", mfHoldings);
        root.add("activeSips",     buildActiveSips(mfHoldings));
        root.add("dematHoldings",  parseDematHoldings(text));

        return new GsonBuilder().setPrettyPrinting().create().toJson(root);
    }

    // ── ISIN split re-join ────────────────────────────────────────────────────
    // Handles: "INF109KC12\nW6 ..." → "INF109KC12W6 ..."

    private static final Pattern PARTIAL_ISIN_AT_EOL =
        Pattern.compile("(IN[A-Z0-9]{1,11})\n([A-Z0-9]{1,11})");

    private static String rejoinSplitISINs(String text) {
        Matcher m = PARTIAL_ISIN_AT_EOL.matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String combined = m.group(1) + m.group(2);
            if (combined.length() == 12) {
                m.appendReplacement(sb, combined + " ");
            } else {
                m.appendReplacement(sb, m.group(0));
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

    // ── investor info ─────────────────────────────────────────────────────────

    private static JsonObject parseInvestor(String text) {
        JsonObject obj = new JsonObject();

        // "In the single name of\nABHIMAN JAIN ( PAN :AZWPJ4598F )"
        Matcher m = Pattern.compile(
            "In the single name of\\s+([A-Z][A-Z ]+?)\\s*\\(\\s*PAN\\s*:?\\s*([A-Z0-9]{10})\\s*\\)",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) {
            obj.addProperty("name", m.group(1).trim());
            obj.addProperty("pan",  m.group(2));
        } else {
            // Fallback: "ABHIMAN JAIN PAN: AZWPJ4598F"
            m = Pattern.compile("([A-Z][A-Z ]+?)\\s+PAN:\\s*([A-Z0-9]{10})").matcher(text);
            if (m.find()) {
                obj.addProperty("name", m.group(1).trim());
                obj.addProperty("pan",  m.group(2));
            }
        }

        m = Pattern.compile("Mobile No\\s*:\\s*(\\d+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("mobile", m.group(1));

        m = Pattern.compile("Email Id\\s*:\\s*([\\w.+%-]+@[\\w.-]+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("email", m.group(1).toLowerCase());

        // Period: "01-02-2026 TO 28-02-2026" or "01-Feb-2026 to 28-Feb-2026"
        m = Pattern.compile(
            "(\\d{2}-(?:\\d{2}|[A-Za-z]{3})-\\d{4})\\s+[Tt][Oo]\\s+(\\d{2}-(?:\\d{2}|[A-Za-z]{3})-\\d{4})")
            .matcher(text);
        if (m.find()) {
            obj.addProperty("periodFrom", m.group(1));
            obj.addProperty("periodTo",   m.group(2));
        }
        return obj;
    }

    // ── portfolio summary ─────────────────────────────────────────────────────

    private static JsonObject parseSummary(String text) {
        JsonObject obj = new JsonObject();

        Matcher m = Pattern.compile("Total Portfolio Value[^\\d]+(\\d[\\d,]+\\.\\d{2})",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("totalValue", parseNum(m.group(1)));

        m = Pattern.compile("Equity\\s+(\\d[\\d,]+\\.\\d{2})\\s+\\d", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("equityValue", parseNum(m.group(1)));

        m = Pattern.compile("Mutual Fund Folios\\s+(\\d[\\d,]+\\.\\d{2})\\s+\\d",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("mfFolioValue", parseNum(m.group(1)));

        m = Pattern.compile("Mutual Funds Held in Demat Form\\s+(\\d[\\d,]+\\.\\d{2})\\s+\\d",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) obj.addProperty("mfDematValue", parseNum(m.group(1)));

        // Grand Total invested + current from MF summary footer
        m = Pattern.compile("Grand Total\\s+(\\d[\\d,]+\\.\\d{2})\\s+(\\d[\\d,]+\\.\\d{2})",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) {
            obj.addProperty("totalInvested",     parseNum(m.group(1)));
            obj.addProperty("totalCurrentValue", parseNum(m.group(2)));
        }
        return obj;
    }

    // ── monthly history ───────────────────────────────────────────────────────

    private static final String[] MONTHS =
        {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};

    private static JsonArray parseMonthlyHistory(String text) {
        JsonArray arr = new JsonArray();

        // Header is garbled in CDSL CAS — detect by first month entry directly
        int start = -1;
        Matcher anchor = Pattern.compile(
            "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{4}\\s+[\\d,]+\\.\\d{2}",
            Pattern.CASE_INSENSITIVE).matcher(text);
        if (anchor.find()) start = anchor.start();
        if (start < 0) return arr;
        int end = Math.min(start + 2500, text.length());
        String section = text.substring(start, end);

        // First line (no change col): "Mar 2025  73,24,847.73"
        // Subsequent lines: "Apr 2025  76,50,194.35  3,25,346.62  4.44"
        Pattern firstPat = Pattern.compile(
            "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{4})\\s+([\\d,]+\\.\\d{2})\\s*$",
            Pattern.MULTILINE | Pattern.CASE_INSENSITIVE);
        Pattern restPat = Pattern.compile(
            "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{4})\\s+([\\d,]+\\.\\d{2})\\s+([+-]?[\\d,]+\\.\\d{2})\\s+([+-]?[\\d.]+)",
            Pattern.CASE_INSENSITIVE);

        // First try full pattern (with change)
        Set<String> added = new LinkedHashSet<>();
        Matcher m = restPat.matcher(section);
        while (m.find()) {
            String key = m.group(1) + " " + m.group(2);
            if (added.contains(key)) continue;
            added.add(key);
            JsonObject row = new JsonObject();
            row.addProperty("month",     key);
            row.addProperty("value",     parseNum(m.group(3)));
            row.addProperty("change",    parseNum(m.group(4)));
            row.addProperty("changePct", Double.parseDouble(m.group(5)));
            arr.add(row);
        }
        // Then first-month (no change)
        m = firstPat.matcher(section);
        while (m.find()) {
            String key = m.group(1) + " " + m.group(2);
            if (added.contains(key)) continue;
            added.add(key);
            JsonObject row = new JsonObject();
            row.addProperty("month", key);
            row.addProperty("value", parseNum(m.group(3)));
            row.addProperty("change", 0.0);
            row.addProperty("changePct", 0.0);
            arr.add(row);
        }
        // Sort by calendar order
        arr = sortHistory(arr);
        return arr;
    }

    private static JsonArray sortHistory(JsonArray arr) {
        List<JsonObject> list = new ArrayList<>();
        for (JsonElement e : arr) list.add(e.getAsJsonObject());
        list.sort((a, b) -> {
            int ya = Integer.parseInt(a.get("month").getAsString().split(" ")[1]);
            int yb = Integer.parseInt(b.get("month").getAsString().split(" ")[1]);
            if (ya != yb) return ya - yb;
            int ma = monthIndex(a.get("month").getAsString().split(" ")[0]);
            int mb = monthIndex(b.get("month").getAsString().split(" ")[0]);
            return ma - mb;
        });
        JsonArray out = new JsonArray();
        list.forEach(out::add);
        return out;
    }

    private static int monthIndex(String m) {
        for (int i = 0; i < MONTHS.length; i++)
            if (MONTHS[i].equalsIgnoreCase(m)) return i;
        return 0;
    }

    // ── scheme map: code → {name, amc, isin} ─────────────────────────────────
    // Parse the folio detail section (pages 3-12 typically)

    private static class SchemeInfo {
        String name, amc, isin, code;
        SchemeInfo(String code, String name, String amc, String isin) {
            this.code = code; this.name = name; this.amc = amc; this.isin = isin;
        }
    }

    private static final Pattern AMC_PAT =
        Pattern.compile("AMC Name\\s*:\\s*(.+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCHEME_CODE_PAT =
        Pattern.compile("Scheme Name\\s*:\\s*(.+?)\\s+Scheme Code\\s*:\\s*(\\S+)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern ISIN_UCC_PAT =
        Pattern.compile("ISIN\\s*:\\s*(IN[A-Z0-9]{10})\\s+UCC",
            Pattern.CASE_INSENSITIVE);

    private static Map<String, SchemeInfo> buildSchemeMap(String text) {
        Map<String, SchemeInfo> map = new LinkedHashMap<>();
        // Find the folio details section (before MF transactions section)
        int end = text.indexOf("MUTUAL FUND UNITS HELD WITH MF");
        if (end < 0) end = text.length();
        String section = text.substring(0, end);

        String[] lines = section.split("\n");
        String curAmc = "";
        String curName = "";
        String curCode = "";
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            Matcher m = AMC_PAT.matcher(line);
            if (m.find()) { curAmc = m.group(1).trim(); continue; }

            // "Scheme Name : XYZ Fund Scheme Code : ABC"
            // Sometimes scheme name spans multiple lines - look ahead
            if (line.startsWith("Scheme Name") && line.contains("Scheme Code")) {
                m = Pattern.compile("Scheme Name\\s*:\\s*(.+?)\\s+Scheme Code\\s*:\\s*(\\S+)",
                    Pattern.CASE_INSENSITIVE).matcher(line);
                if (m.find()) {
                    curName = m.group(1).trim().replaceAll("\\s+", " ");
                    curCode = m.group(2).trim();
                }
            } else if (line.startsWith("Scheme Name")) {
                // Scheme name continues on next line(s)
                StringBuilder sb = new StringBuilder(line.replaceFirst("Scheme Name\\s*:\\s*", "").trim());
                int j = i + 1;
                while (j < lines.length) {
                    String nxt = lines[j].trim();
                    if (nxt.contains("Scheme Code")) {
                        Matcher cm = Pattern.compile("Scheme Code\\s*:\\s*(\\S+)").matcher(nxt);
                        if (cm.find()) curCode = cm.group(1).trim();
                        // The part before "Scheme Code" is part of the name
                        int idx = nxt.indexOf("Scheme Code");
                        sb.append(" ").append(nxt.substring(0, idx).trim());
                        i = j;
                        break;
                    }
                    sb.append(" ").append(nxt);
                    j++;
                    if (j - i > 5) break; // safety
                }
                curName = sb.toString().trim().replaceAll("\\s+", " ");
            }

            // ISIN line completes the block
            m = ISIN_UCC_PAT.matcher(line);
            if (m.find() && !curCode.isEmpty()) {
                String isin = m.group(1);
                map.put(curCode, new SchemeInfo(curCode, curName, curAmc, isin));
                map.put(isin,    new SchemeInfo(curCode, curName, curAmc, isin)); // also index by ISIN
                curCode = "";
            }
        }
        return map;
    }

    // ── SIP instalment counts ─────────────────────────────────────────────────
    // Returns map of ISIN → instalment count (current instalment number)

    private static Map<String, Integer> parseSIPInstalments(String text) {
        Map<String, Integer> sipByIsin = new LinkedHashMap<>();

        // Section headers are garbled in CDSL CAS — scan full text for SIP blocks
        String section = text;

        // Current ISIN being processed
        String curIsin = "";
        Pattern isinLinePat = Pattern.compile("ISIN\\s*:\\s*(IN[A-Z0-9]{10})");
        // SIP line: "Systematic Investment (N/..." or "Online Systematic Investment (N/..."
        Pattern sipPat = Pattern.compile(
            "[Ss]ystematic\\s+Investment\\s+\\(\\s*(\\d+)\\s*/");

        for (String line : section.split("\n")) {
            Matcher m = isinLinePat.matcher(line);
            if (m.find()) {
                curIsin = m.group(1);
                continue;
            }
            if (!curIsin.isEmpty()) {
                m = sipPat.matcher(line);
                if (m.find()) {
                    int n = Integer.parseInt(m.group(1));
                    // Keep max instalments seen for this ISIN
                    sipByIsin.merge(curIsin, n, Math::max);
                }
            }
        }
        return sipByIsin;
    }

    // ── MF holdings summary table ─────────────────────────────────────────────

    private static final Pattern ISIN_ROW_PAT = Pattern.compile(
        "(INF[A-Z0-9]{9})\\s+(\\S+)\\s+(-?[\\d,]+\\.\\d{2,4})\\s+(-?[\\d,]+\\.\\d{2,4})" +
        "\\s+(-?[\\d,]+\\.\\d{2})\\s+(-?[\\d,]+\\.\\d{2})\\s+(-?[\\d,]+\\.\\d{2})\\s+(-?[\\d.]+)");

    private static JsonArray parseMFHoldings(String text,
                                              Map<String, SchemeInfo> schemeMap,
                                              Map<String, Integer> sipByIsin) {
        JsonArray arr = new JsonArray();

        // Section headers are garbled in CDSL CAS — detect start by first ISIN_ROW_PAT match
        int start = 0;
        // Skip the folio detail section (ISIN rows with "ISIN :" prefix) by anchoring after Grand Total
        // Actually just scan full text — ISIN_ROW_PAT is unique to summary table
        int end = text.length();
        String section = text.substring(start, end);

        // Accumulate scheme name lines
        List<String> nameLines = new ArrayList<>();
        String[] lines = section.split("\n");

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            Matcher m = ISIN_ROW_PAT.matcher(line);
            if (m.find()) {
                String isin     = m.group(1);
                String folio    = m.group(2);
                double units    = parseNum(m.group(3));
                double nav      = parseNum(m.group(4));
                double invested = parseNum(m.group(5));
                double value    = parseNum(m.group(6));
                double pnl      = parseNum(m.group(7));
                double pnlPct   = Double.parseDouble(m.group(8).replace(",", ""));

                // Scheme name: look up by ISIN, fall back to accumulated name lines
                String code = "", name = "", amc = "";
                SchemeInfo info = schemeMap.get(isin);
                if (info != null) {
                    code = info.code;
                    name = info.name;
                    amc  = info.amc;
                } else {
                    // Build name from accumulated lines (strip junk)
                    String raw = String.join(" ", nameLines)
                        .replaceAll("(?i)closing|cumulative|unreali.*|ISIN.*|Fo.*lio.*|bal.*|nav.*|amount.*|valuation.*", "")
                        .replaceAll("\\s+", " ").trim();
                    // Try to extract code: "32Z - ..." or "EFDG - ..."
                    Matcher cm = Pattern.compile("([A-Z0-9]{2,6}\\s*-\\s*)(.+)").matcher(raw);
                    if (cm.find()) {
                        code = cm.group(1).replace("-","").trim();
                        name = cm.group(2).trim();
                    } else {
                        name = raw;
                    }
                    amc = guessAMC(name);
                }

                int sipN = sipByIsin.getOrDefault(isin, 0);
                double cagr = (sipN > 0 && invested > 0) ? computeCAGR(invested, value, sipN) : 0;

                JsonObject row = new JsonObject();
                row.addProperty("code",     code);
                row.addProperty("name",     name);
                row.addProperty("amc",      amc);
                row.addProperty("isin",     isin);
                row.addProperty("folio",    folio);
                row.addProperty("units",    round4(units));
                row.addProperty("nav",      round4(nav));
                row.addProperty("invested", round2(invested));
                row.addProperty("value",    round2(value));
                row.addProperty("pnl",      round2(pnl));
                row.addProperty("pnlPct",   round2(pnlPct));
                row.addProperty("sipInstalments", sipN);
                if (sipN > 0) row.addProperty("estimatedCAGR", round2(cagr * 100));
                arr.add(row);

                nameLines.clear();
            } else {
                // Not a data line — accumulate as potential scheme name
                if (!line.isEmpty() && !line.startsWith("Page ")) {
                    nameLines.add(line);
                }
            }
        }
        return arr;
    }

    // ── active SIPs ───────────────────────────────────────────────────────────

    private static JsonArray buildActiveSips(JsonArray holdings) {
        JsonArray arr = new JsonArray();
        for (JsonElement el : holdings) {
            JsonObject row = el.getAsJsonObject();
            int n = row.has("sipInstalments") ? row.get("sipInstalments").getAsInt() : 0;
            if (n > 0) {
                JsonObject sip = new JsonObject();
                sip.addProperty("scheme",      row.get("name").getAsString());
                sip.addProperty("amc",         row.get("amc").getAsString());
                sip.addProperty("isin",        row.get("isin").getAsString());
                sip.addProperty("instalments", n);
                sip.addProperty("currentValue", row.get("value").getAsDouble());
                sip.addProperty("invested",     row.get("invested").getAsDouble());
                if (row.has("estimatedCAGR"))
                    sip.addProperty("estimatedCAGR", row.get("estimatedCAGR").getAsDouble());
                arr.add(sip);
            }
        }
        return arr;
    }

    // ── demat holdings (equity + MF in demat) ────────────────────────────────

    private static JsonArray parseDematHoldings(String text) {
        JsonArray arr = new JsonArray();

        // Detect demat section by presence of "-- -- --" (balance table separator)
        int dstart = text.indexOf("-- -- --");
        if (dstart < 0) return arr;
        // Start searching a few lines before first occurrence
        int start = Math.max(0, text.lastIndexOf("\n", dstart) - 500);
        // End: stop at first line that has no more "-- --" patterns (load structures section)
        int end = text.indexOf("Load Structures", dstart);
        if (end < 0) end = text.length();
        String section = text.substring(start, end);

        // Lines: ISIN NAME_PART1\nNAME_PART2 QTY -- -- -- FREE_QTY PRICE VALUE
        // OR (single line): ISIN NAME QTY -- -- -- FREE_QTY PRICE VALUE
        Pattern entryPat = Pattern.compile(
            "^(IN[EF][A-Z0-9]{9})\\s+(.+)$", Pattern.MULTILINE);

        // Numbers: QTY -- -- -- FREE_QTY PRICE VALUE
        Pattern numPat = Pattern.compile(
            "([\\d.]+)\\s+--\\s+--\\s+--\\s+([\\d.]+)\\s+([\\d,]+\\.\\d+)\\s+([\\d,]+\\.\\d{2})");

        String[] lines = section.split("\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            Matcher m = entryPat.matcher(line);
            if (!m.find()) continue;

            String isin = m.group(1);
            String namePart = m.group(2).trim();

            // Check if numbers are on this line
            Matcher nm = numPat.matcher(line);
            String fullName = namePart;
            double qty = 0, freeQty = 0, price = 0, value = 0;

            if (nm.find()) {
                qty     = Double.parseDouble(nm.group(1));
                freeQty = Double.parseDouble(nm.group(2));
                price   = parseNum(nm.group(3));
                value   = parseNum(nm.group(4));
                // Name is everything before the numbers
                fullName = line.substring(isin.length()).replaceAll(
                    "[\\d.]+" + "\\s+--\\s+--\\s+--.*", "").trim();
            } else {
                // Numbers likely on next line
                if (i + 1 < lines.length) {
                    String next = lines[i + 1].trim();
                    nm = numPat.matcher(next);
                    if (nm.find()) {
                        fullName = (namePart + " " + next.replaceAll(
                            "[\\d.]+" + "\\s+--\\s+--\\s+--.*", "").trim()).trim();
                        qty     = Double.parseDouble(nm.group(1));
                        freeQty = Double.parseDouble(nm.group(2));
                        price   = parseNum(nm.group(3));
                        value   = parseNum(nm.group(4));
                        i++; // skip next line
                    }
                }
                if (qty == 0) continue; // couldn't parse
            }

            // Clean name: remove trailing junk like "# EQUITY SHARES" etc.
            fullName = fullName.replaceAll("\\s*#.*", "").trim();

            boolean isEquity = isin.startsWith("INE");
            JsonObject row = new JsonObject();
            row.addProperty("isin",    isin);
            row.addProperty("name",    fullName);
            row.addProperty("type",    isEquity ? "Equity" : "MF-Demat");
            row.addProperty("qty",     qty);
            row.addProperty("freeQty", freeQty);
            row.addProperty("price",   round2(price));
            row.addProperty("value",   round2(value));
            arr.add(row);
        }
        return arr;
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static double computeCAGR(double invested, double value, int n) {
        if (invested <= 0 || n <= 0) return 0;
        double years = n / 24.0; // midpoint: avg holding = n/2 months
        return Math.pow(value / invested, 1.0 / years) - 1.0;
    }

    private static double parseNum(String s) {
        return Double.parseDouble(s.replace(",", ""));
    }

    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }

    private static String guessAMC(String name) {
        String n = name.toLowerCase();
        if (n.contains("hdfc"))                          return "HDFC Mutual Fund";
        if (n.contains("sbi"))                           return "SBI Mutual Fund";
        if (n.contains("icici"))                         return "ICICI Prudential";
        if (n.contains("axis"))                          return "Axis Mutual Fund";
        if (n.contains("kotak"))                         return "Kotak Mutual Fund";
        if (n.contains("nippon"))                        return "Nippon India";
        if (n.contains("mirae"))                         return "Mirae Asset";
        if (n.contains("parag parikh") || n.contains("ppfas")) return "PPFAS";
        if (n.contains("dsp"))                           return "DSP Mutual Fund";
        if (n.contains("franklin"))                      return "Franklin Templeton";
        if (n.contains("tata"))                          return "Tata Mutual Fund";
        if (n.contains("uti"))                           return "UTI Mutual Fund";
        if (n.contains("aditya") || n.contains("birla")) return "Aditya Birla Sun Life";
        if (n.contains("invesco"))                       return "Invesco";
        if (n.contains("sundaram"))                      return "Sundaram";
        if (n.contains("canara"))                        return "Canara Robeco";
        if (n.contains("idfc") || n.contains("bandhan")) return "Bandhan";
        if (n.contains("whiteoak"))                      return "WhiteOak Capital";
        if (n.contains("motilal"))                       return "Motilal Oswal";
        if (n.contains("pgim"))                          return "PGIM India";
        if (n.contains("quant"))                         return "Quant";
        if (n.contains("groww"))                         return "Groww";
        return "Other";
    }
}
