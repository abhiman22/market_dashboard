import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.google.gson.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Handles /api/market-context/* endpoints:
 *   /rbi    — hardcoded RBI policy rates
 *   /fiidii — NSE FII/DII cash-segment flows (NSE cookie-based)
 *   /pcr    — NIFTY Put/Call Ratio from NSE option chain (NSE cookie-based)
 */
public class MarketContextHandler implements HttpHandler {

    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    // ── NSE cookie cache ──────────────────────────────────────────────────────
    private String  nseCookies   = "";
    private long    cookieExpiry = 0;
    private static final long COOKIE_TTL    = 25 * 60 * 1000L; // 25 min

    // ── FII/DII cache ─────────────────────────────────────────────────────────
    private String fiiDiiCache     = null;
    private long   fiiDiiCacheTime = 0;
    private static final long FIIDII_TTL = 60 * 60 * 1000L; // 1 hour

    // ── PCR cache ─────────────────────────────────────────────────────────────
    private String pcrCache     = null;
    private long   pcrCacheTime = 0;
    private static final long PCR_TTL = 15 * 60 * 1000L; // 15 min

    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void handle(HttpExchange ex) throws IOException {
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");

        if ("OPTIONS".equals(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            return;
        }

        String path = ex.getRequestURI().getPath();
        try {
            if      (path.endsWith("/rbi"))    handleRbi(ex);
            else if (path.endsWith("/fiidii")) handleFiiDii(ex);
            else if (path.endsWith("/pcr"))    handlePcr(ex);
            else    sendJson(ex, 404, "{\"error\":\"Not found\"}");
        } catch (Exception e) {
            sendJson(ex, 500, "{\"error\":\"" + escJson(e.getMessage()) + "\"}");
        }
    }

    // ── RBI policy rates (hardcoded; update when RBI changes policy) ──────────

    private void handleRbi(HttpExchange ex) throws IOException {
        JsonObject obj = new JsonObject();
        obj.addProperty("repoRate",        6.00);
        obj.addProperty("reverseRepoRate", 3.35);
        obj.addProperty("crr",             4.00);
        obj.addProperty("slr",            18.00);
        obj.addProperty("msfRate",         6.25);
        obj.addProperty("bankRate",        6.25);
        obj.addProperty("asOf",           "Apr 2025");
        sendJson(ex, 200, GSON.toJson(obj));
    }

    // ── FII / DII cash-segment flows ──────────────────────────────────────────

    private synchronized void handleFiiDii(HttpExchange ex) throws IOException {
        long now = System.currentTimeMillis();
        if (fiiDiiCache != null && now - fiiDiiCacheTime < FIIDII_TTL) {
            sendJson(ex, 200, fiiDiiCache); return;
        }
        try {
            refreshCookies();
            String raw = nseGet("https://www.nseindia.com/api/fiidiiTradeReact");
            JsonArray arr = GSON.fromJson(raw, JsonArray.class);

            // Pick the latest date's FII and DII rows
            String      latestDate = "";
            JsonObject  fii = null, dii = null;

            for (JsonElement el : arr) {
                JsonObject row = el.getAsJsonObject();
                String date = str(row, "date");
                if (date.compareTo(latestDate) >= 0) {
                    latestDate = date;
                    String cat = str(row, "category").toUpperCase();
                    if (cat.contains("FII") || cat.contains("FPI")) fii = row;
                    else if (cat.contains("DII"))                    dii = row;
                }
            }

            JsonObject result = new JsonObject();
            result.addProperty("date", latestDate);
            if (fii != null) result.add("fii", flowObject(fii));
            if (dii != null) result.add("dii", flowObject(dii));

            fiiDiiCache     = GSON.toJson(result);
            fiiDiiCacheTime = now;
            sendJson(ex, 200, fiiDiiCache);

        } catch (Exception e) {
            if (fiiDiiCache != null) { sendJson(ex, 200, fiiDiiCache); return; }
            sendJson(ex, 500, "{\"error\":\"" + escJson(e.getMessage()) + "\"}");
        }
    }

    private JsonObject flowObject(JsonObject row) {
        JsonObject o = new JsonObject();
        o.addProperty("buy",  num(row, "buyValue"));
        o.addProperty("sell", num(row, "sellValue"));
        o.addProperty("net",  num(row, "netValue"));
        return o;
    }

    // ── NIFTY Put/Call Ratio ──────────────────────────────────────────────────

    private synchronized void handlePcr(HttpExchange ex) throws IOException {
        long now = System.currentTimeMillis();
        if (pcrCache != null && now - pcrCacheTime < PCR_TTL) {
            sendJson(ex, 200, pcrCache); return;
        }
        try {
            refreshCookies();
            String raw = nseGet(
                "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY");
            JsonObject root = GSON.fromJson(raw, JsonObject.class);

            double putOI = 0, callOI = 0;
            // Use pre-aggregated totals from filtered.CE/PE.totOI
            JsonObject filtered = root.has("filtered")
                ? root.getAsJsonObject("filtered") : null;
            if (filtered == null)
                throw new Exception("NSE returned empty response (bot protection active)");
            if (filtered.has("PE")) putOI  = dbl(filtered.getAsJsonObject("PE"), "totOI");
            if (filtered.has("CE")) callOI = dbl(filtered.getAsJsonObject("CE"), "totOI");
            if (callOI == 0)
                throw new Exception("NSE option chain data unavailable");

            double pcr = putOI / callOI;
            JsonObject records = root.has("records") ? root.getAsJsonObject("records") : null;
            double underlying = (records != null && records.has("underlyingValue"))
                ? records.get("underlyingValue").getAsDouble() : 0;

            JsonObject result = new JsonObject();
            result.addProperty("pcr",            Math.round(pcr * 100.0) / 100.0);
            result.addProperty("putOI",          (long) putOI);
            result.addProperty("callOI",         (long) callOI);
            result.addProperty("niftyPrice",     underlying);
            result.addProperty("interpretation", interpretPcr(pcr));

            pcrCache     = GSON.toJson(result);
            pcrCacheTime = now;
            sendJson(ex, 200, pcrCache);

        } catch (Exception e) {
            if (pcrCache != null) { sendJson(ex, 200, pcrCache); return; }
            sendJson(ex, 500, "{\"error\":\"" + escJson(e.getMessage()) + "\"}");
        }
    }

    private String interpretPcr(double pcr) {
        if (pcr < 0.70) return "Extreme Greed — market likely overbought";
        if (pcr < 0.85) return "Greed — call writers dominating";
        if (pcr < 1.00) return "Neutral — slight bullish tilt";
        if (pcr < 1.20) return "Neutral — slight bearish tilt";
        if (pcr < 1.50) return "Fear — put writers dominating";
        return "Extreme Fear — market likely oversold";
    }

    // ── NSE HTTP helpers ──────────────────────────────────────────────────────

    private synchronized void refreshCookies() throws Exception {
        long now = System.currentTimeMillis();
        if (!nseCookies.isEmpty() && now < cookieExpiry) return;

        HttpURLConnection c = openConn("https://www.nseindia.com");
        c.setRequestMethod("GET");
        c.setInstanceFollowRedirects(true);
        c.connect();
        c.getResponseCode(); // trigger

        StringBuilder sb = new StringBuilder();
        List<String> setCookie = c.getHeaderFields()
            .getOrDefault("Set-Cookie", Collections.emptyList());
        for (String ck : setCookie) {
            String part = ck.split(";")[0].trim();
            if (sb.length() > 0) sb.append("; ");
            sb.append(part);
        }
        c.disconnect();

        nseCookies   = sb.toString();
        cookieExpiry = now + COOKIE_TTL;
    }

    private String nseGet(String url) throws Exception {
        HttpURLConnection c = openConn(url);
        c.setRequestMethod("GET");
        c.setRequestProperty("Cookie", nseCookies);
        int code = c.getResponseCode();
        if (code != 200) throw new Exception("NSE HTTP " + code + " for " + url);
        try (InputStream is = c.getInputStream();
             BufferedReader br = new BufferedReader(
                 new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            return sb.toString();
        } finally { c.disconnect(); }
    }

    private HttpURLConnection openConn(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestProperty("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        c.setRequestProperty("Accept",          "application/json, */*");
        c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        c.setRequestProperty("Referer",         "https://www.nseindia.com/");
        c.setRequestProperty("X-Requested-With","XMLHttpRequest");
        c.setConnectTimeout(10_000);
        c.setReadTimeout(20_000);
        return c;
    }

    // ── micro helpers ─────────────────────────────────────────────────────────

    private String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return (e == null || e.isJsonNull()) ? "" : e.getAsString().trim();
    }

    private double num(JsonObject o, String k) {
        try { return Double.parseDouble(str(o, k).replace(",", "")); }
        catch (Exception e) { return 0; }
    }

    private double dbl(JsonObject o, String k) {
        try { return o.get(k).getAsDouble(); }
        catch (Exception e) { return 0; }
    }

    private void sendJson(HttpExchange ex, int status, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json");
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    private String escJson(String s) {
        if (s == null) return "Unknown error";
        return s.replace("\\","\\\\").replace("\"","\\\"")
                .replace("\n","\\n").replace("\r","\\r");
    }
}
