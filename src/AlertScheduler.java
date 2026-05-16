import com.google.gson.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * Background scheduler that fires push alerts:
 *   1. Nifty / Sensex drops more than 1% from session open — checked every 5 min
 *   2. Market close summary — sent at 3:31 PM IST on weekdays
 *   3. Weekly RSI oversold scan (RSI 20–30) — sent at 3:35 PM IST on weekdays
 */
public class AlertScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // Alert 1
    private static final String[] DROP_SYMBOLS = {"^NSEI",    "^BSESN"};
    private static final String[] DROP_NAMES   = {"Nifty 50", "Sensex"};

    // Alert 2
    private static final String[] SUMMARY_SYMBOLS = {"^NSEI", "^BSESN",    "^NSEBANK",   "^CNXIT"};
    private static final String[] SUMMARY_NAMES   = {"Nifty", "Sensex",    "Bank Nifty", "IT"};

    // Alert 3 — weekly RSI scan (indices + major Indian equities)
    private static final String[] RSI_SYMBOLS = {
        "^NSEI",       "^BSESN",       "^NSEBANK",    "^CNXIT",
        "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS",     "KOTAKBANK.NS", "AXISBANK.NS",
        "TCS.NS",      "INFY.NS",      "HCLTECH.NS",  "WIPRO.NS",     "TECHM.NS",
        "RELIANCE.NS", "NTPC.NS",      "POWERGRID.NS","ONGC.NS",      "COALINDIA.NS",
        "MARUTI.NS",   "M&M.NS",       "TATAMOTORS.NS","BAJAJ-AUTO.NS","HEROMOTOCO.NS",
        "HINDUNILVR.NS","NESTLEIND.NS","BRITANNIA.NS", "ITC.NS",       "DABUR.NS",
        "SUNPHARMA.NS","DRREDDY.NS",   "CIPLA.NS",    "DIVISLAB.NS",  "APOLLOHOSP.NS"
    };

    private static final Map<String, String> RSI_DISPLAY_NAMES = Map.of(
        "^NSEI",    "Nifty 50",
        "^BSESN",   "Sensex",
        "^NSEBANK", "Bank Nifty",
        "^CNXIT",   "Nifty IT"
    );

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "alert-scheduler");
        t.setDaemon(true);
        return t;
    });

    private final java.net.http.HttpClient http = java.net.http.HttpClient.newHttpClient();
    private static final Gson gson = new Gson();

    // Session state — reset each trading day
    private final Map<String, Double> sessionOpenPrice    = new ConcurrentHashMap<>();
    private final Set<String>         dropAlertSent       = ConcurrentHashMap.newKeySet();
    private volatile String           lastSessionDate      = "";
    private volatile String           lastCloseSummaryDate = "";
    private volatile String           lastRsiAlertDate     = "";

    // ── Lifecycle ────────────────────────────────────────────────────────────

    public void start() {
        // Drop alert: every 5 minutes (1-minute initial delay to let server warm up)
        scheduler.scheduleAtFixedRate(this::checkDropAlert, 1, 5, TimeUnit.MINUTES);
        // Close summary + RSI scan: checked every minute to catch exact minute
        scheduler.scheduleAtFixedRate(this::checkCloseSummary, 1, 1, TimeUnit.MINUTES);
        scheduler.scheduleAtFixedRate(this::checkRsiAlert,     1, 1, TimeUnit.MINUTES);
        System.out.println("[alerts] Scheduler started — monitoring Nifty, Sensex & weekly RSI.");
    }

    /** For manual testing via /api/push/test endpoint — bypasses market hours check. */
    public void sendTestAlerts() {
        Map<String, double[]> quotes = fetchQuotes(SUMMARY_SYMBOLS);
        String body = buildSummaryBody(quotes);
        String testBody = body.isEmpty() ? "Server is up. Alerts are configured." : body;
        PushSubscriptionStore.getInstance().broadcast("Market Insights — Test Alert", testBody);
    }

    // ── Alert 1: Index drop > 1% from session open ───────────────────────────

    private void checkDropAlert() {
        ZonedDateTime ist = ZonedDateTime.now(IST);
        if (!isMarketHours(ist)) return;

        // Reset session state on a new trading day
        String today = ist.toLocalDate().toString();
        if (!today.equals(lastSessionDate)) {
            sessionOpenPrice.clear();
            dropAlertSent.clear();
            lastSessionDate = today;
        }

        Map<String, double[]> quotes = fetchQuotes(DROP_SYMBOLS);

        for (int i = 0; i < DROP_SYMBOLS.length; i++) {
            String sym  = DROP_SYMBOLS[i];
            String name = DROP_NAMES[i];
            if (dropAlertSent.contains(sym)) continue;

            double[] q = quotes.get(sym);
            if (q == null) continue; // [open, current]

            double open    = q[0];
            double current = q[1];

            // Use the first successful fetch of the day as the session open reference
            sessionOpenPrice.putIfAbsent(sym, open > 0 ? open : current);
            double sessionOpen = sessionOpenPrice.get(sym);
            if (sessionOpen <= 0) continue;

            double pct = (current - sessionOpen) / sessionOpen * 100.0;
            if (pct <= -1.0) {
                String rec   = pct <= -2.0 ? "Strong Buy on dip" : "Potential Buy on dip";
                String title = String.format("%s down %.2f%% — %s", name, Math.abs(pct), rec);
                String body  = String.format(
                    "Open: %.0f  →  Now: %.0f (%.2f%%)%nConsider accumulating if fundamentals unchanged.",
                    sessionOpen, current, pct);
                PushSubscriptionStore.getInstance().broadcast(title, body);
                dropAlertSent.add(sym);
                System.out.printf("[alerts] Drop alert sent: %s %.2f%%%n", name, pct);
            }
        }
    }

    // ── Alert 2: Market close summary at 3:31 PM IST ────────────────────────

    private void checkCloseSummary() {
        ZonedDateTime ist = ZonedDateTime.now(IST);
        DayOfWeek dow = ist.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return;

        // Fire once at 3:31 PM IST (market closes at 3:30 PM)
        if (ist.getHour() != 15 || ist.getMinute() != 31) return;

        String today = ist.toLocalDate().toString();
        if (today.equals(lastCloseSummaryDate)) return; // already sent today
        lastCloseSummaryDate = today;

        Map<String, double[]> quotes = fetchQuotes(SUMMARY_SYMBOLS);
        String body = buildSummaryBody(quotes);
        if (body.isEmpty()) return;

        PushSubscriptionStore.getInstance().broadcast("Market Closed — End of Day", body);
        System.out.println("[alerts] Close summary sent: " + body);
    }

    private String buildSummaryBody(Map<String, double[]> quotes) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < SUMMARY_SYMBOLS.length; i++) {
            double[] q = quotes.get(SUMMARY_SYMBOLS[i]);
            if (q == null || q[0] <= 0) continue;
            double pct = (q[1] - q[0]) / q[0] * 100.0;
            if (sb.length() > 0) sb.append("   |   ");
            sb.append(String.format("%s %s%.2f%%", SUMMARY_NAMES[i], pct >= 0 ? "+" : "", pct));
        }
        return sb.toString();
    }

    // ── Alert 3: Weekly RSI oversold scan at 3:35 PM IST ────────────────────

    private void checkRsiAlert() {
        ZonedDateTime ist = ZonedDateTime.now(IST);
        DayOfWeek dow = ist.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return;
        if (ist.getHour() != 15 || ist.getMinute() != 35) return;

        String today = ist.toLocalDate().toString();
        if (today.equals(lastRsiAlertDate)) return;
        lastRsiAlertDate = today;

        runRsiScan(false);
    }

    /** Callable from test endpoint — skips time/day check. */
    public void triggerRsiScan() {
        runRsiScan(true);
    }

    private void runRsiScan(boolean isTest) {
        System.out.println("[alerts] Starting weekly RSI scan for " + RSI_SYMBOLS.length + " symbols…");
        List<String> oversold   = new ArrayList<>(); // RSI 20–30
        List<String> deepOversold = new ArrayList<>(); // RSI < 20

        for (String symbol : RSI_SYMBOLS) {
            double rsi = fetchWeeklyRsi(symbol);
            if (rsi < 0) continue;
            String name = RSI_DISPLAY_NAMES.getOrDefault(symbol, symbol.replace(".NS", ""));
            if (rsi < 20) {
                deepOversold.add(String.format("%s %.1f → Strong Buy", name, rsi));
            } else if (rsi <= 30) {
                oversold.add(String.format("%s %.1f → Buy", name, rsi));
            }
            // Small delay to avoid hammering Yahoo Finance
            try { Thread.sleep(350); } catch (InterruptedException ignored) {}
        }

        System.out.printf("[alerts] RSI scan done — oversold: %d, deep oversold: %d%n",
            oversold.size(), deepOversold.size());

        if (oversold.isEmpty() && deepOversold.isEmpty()) {
            if (isTest) PushSubscriptionStore.getInstance().broadcast(
                "RSI Scan — No Oversold Stocks", "All tracked stocks are in neutral/overbought zone.");
            return;
        }

        StringBuilder body = new StringBuilder();
        if (!deepOversold.isEmpty())
            body.append("⚡ Strong Buy: ").append(String.join("  |  ", deepOversold));
        if (!oversold.isEmpty()) {
            if (body.length() > 0) body.append("\n");
            body.append("✅ Buy: ").append(String.join("  |  ", oversold));
        }

        int total = oversold.size() + deepOversold.size();
        PushSubscriptionStore.getInstance().broadcast(
            String.format("Weekly RSI — %d Potential Buy%s", total, total > 1 ? "s" : ""),
            body.toString()
        );
    }

    /**
     * Fetches 6 months of weekly closes for a symbol and returns its 14-period RSI.
     * Returns -1 if data is insufficient or fetch fails.
     */
    private double fetchWeeklyRsi(String symbol) {
        try {
            String url = "https://query1.finance.yahoo.com/v8/finance/chart/"
                + java.net.URLEncoder.encode(symbol, java.nio.charset.StandardCharsets.UTF_8)
                + "?interval=1wk&range=6mo";

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .timeout(Duration.ofSeconds(8))
                .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return -1;

            JsonArray rawCloses = gson.fromJson(resp.body(), JsonObject.class)
                .getAsJsonObject("chart")
                .getAsJsonArray("result")
                .get(0).getAsJsonObject()
                .getAsJsonObject("indicators")
                .getAsJsonArray("quote")
                .get(0).getAsJsonObject()
                .getAsJsonArray("close");

            // Filter out nulls
            List<Double> closes = new ArrayList<>();
            for (JsonElement el : rawCloses) {
                if (!el.isJsonNull()) closes.add(el.getAsDouble());
            }

            return calcRsi(closes);
        } catch (Exception e) {
            System.err.println("[alerts] RSI fetch error for " + symbol + ": " + e.getMessage());
            return -1;
        }
    }

    /**
     * 14-period RSI using Wilder's smoothing method.
     * Needs at least 15 data points (14 periods + 1 seed value).
     */
    private double calcRsi(List<Double> closes) {
        if (closes.size() < 15) return -1;

        // Seed: simple average of first 14 changes
        double avgGain = 0, avgLoss = 0;
        for (int i = 1; i <= 14; i++) {
            double change = closes.get(i) - closes.get(i - 1);
            if (change > 0) avgGain += change;
            else            avgLoss += Math.abs(change);
        }
        avgGain /= 14;
        avgLoss /= 14;

        // Wilder's exponential smoothing for remaining periods
        for (int i = 15; i < closes.size(); i++) {
            double change = closes.get(i) - closes.get(i - 1);
            avgGain = (avgGain * 13 + Math.max(change, 0))  / 14;
            avgLoss = (avgLoss * 13 + Math.max(-change, 0)) / 14;
        }

        if (avgLoss == 0) return 100;
        double rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // ── Quote fetcher ────────────────────────────────────────────────────────

    /**
     * Fetches regularMarketOpen + regularMarketPrice from Yahoo Finance v7.
     * Returns map of symbol → [open, current].
     */
    private Map<String, double[]> fetchQuotes(String[] symbols) {
        Map<String, double[]> result = new HashMap<>();
        try {
            String syms = String.join(",", symbols).replace("^", "%5E");
            String url  = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + syms
                        + "&fields=regularMarketPrice,regularMarketOpen";

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .timeout(Duration.ofSeconds(8))
                .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return result;

            JsonArray results = gson.fromJson(resp.body(), JsonObject.class)
                .getAsJsonObject("quoteResponse")
                .getAsJsonArray("result");

            for (JsonElement el : results) {
                JsonObject q   = el.getAsJsonObject();
                String sym     = q.get("symbol").getAsString();
                double price   = q.has("regularMarketPrice") ? q.get("regularMarketPrice").getAsDouble() : 0;
                double open    = q.has("regularMarketOpen")  ? q.get("regularMarketOpen").getAsDouble()  : 0;
                if (price > 0) result.put(sym, new double[]{open, price});
            }
        } catch (Exception e) {
            System.err.println("[alerts] Quote fetch error: " + e.getMessage());
        }
        return result;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private boolean isMarketHours(ZonedDateTime ist) {
        DayOfWeek dow = ist.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return false;
        int mins = ist.getHour() * 60 + ist.getMinute();
        return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30; // 9:15–15:30 IST
    }
}
