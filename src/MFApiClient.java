import com.google.gson.*;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MFApiClient {
    private static final String BASE_URL = "https://api.mfapi.in";

    // HTTP/2 for /mf/search — small responses, multiplexing is fine
    private final HttpClient http2Client;
    // HTTP/1.1 for /mf/{code} history — server sends RST_STREAM on concurrent HTTP/2 streams
    private final HttpClient http1Client;

    // Per-scheme computed data cached for 30 minutes
    private final Map<Integer, MutualFundData> navCache = new ConcurrentHashMap<>();
    private final Map<Integer, Long>           navCacheTime = new ConcurrentHashMap<>();
    private static final long NAV_CACHE_TTL = 30 * 60 * 1000L;

    // Raw history cached alongside computed data (for the chart endpoint)
    private final Map<Integer, String[]> histDatesCache = new ConcurrentHashMap<>(); // "DD-MM-YYYY", newest first
    private final Map<Integer, double[]> histNavsCache  = new ConcurrentHashMap<>();

    private static final Pattern NAV_RECORD = Pattern.compile("\"date\":\"([^\"]+)\",\"nav\":\"([^\"]+)\"");

    // India 10-year bond yield used as risk-free rate for Sharpe/Sortino
    private static final double RISK_FREE_RATE = 0.065;

    public MFApiClient() {
        this.http2Client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        this.http1Client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    /** Simple holder for chart history data. */
    public static class NavHistory {
        public final String[] dates; // "DD-MM-YYYY", newest first
        public final double[] navs;
        NavHistory(String[] dates, double[] navs) { this.dates = dates; this.navs = navs; }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Searches for schemes matching the query. Returns [{schemeCode, schemeName}].
     */
    public List<JsonObject> searchSchemes(String query) throws IOException, InterruptedException {
        String encoded = java.net.URLEncoder.encode(query, StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/mf/search?q=" + encoded))
                .header("User-Agent", "Mozilla/5.0")
                .build();
        HttpResponse<String> resp = http2Client.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new IOException("MF search failed: HTTP " + resp.statusCode());
        }
        JsonArray arr = JsonParser.parseString(resp.body()).getAsJsonArray();
        List<JsonObject> schemes = new ArrayList<>();
        arr.forEach(el -> schemes.add(el.getAsJsonObject()));
        return schemes;
    }

    /**
     * Fetches NAV history from /mf/{code} and computes all metrics:
     * 52-week high/low, returns (1W/1M/3M/6M), CAGR (1Y/3Y/5Y/inception),
     * volatility, max drawdown, downside deviation, Sharpe, Sortino.
     *
     * Uses ofInputStream() to safely read the partial body delivered by mfapi.in's
     * nginx (which closes the connection before fulfilling its Content-Length promise).
     * All ~1800 delivered records are captured via regex — enough for 5-year metrics.
     *
     * Result is cached for 30 minutes.
     */
    public MutualFundData getSchemeData(int schemeCode) throws IOException, InterruptedException {
        long now = System.currentTimeMillis();
        Long ts = navCacheTime.get(schemeCode);
        if (ts != null && (now - ts) < NAV_CACHE_TTL && navCache.containsKey(schemeCode)) {
            return navCache.get(schemeCode);
        }

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/mf/" + schemeCode))
                .header("User-Agent", "Mozilla/5.0")
                .build();

        HttpResponse<InputStream> streamResp = http1Client.send(req, HttpResponse.BodyHandlers.ofInputStream());
        if (streamResp.statusCode() != 200) {
            streamResp.body().close();
            throw new IOException("Failed to fetch NAV history for scheme " + schemeCode
                    + ": HTTP " + streamResp.statusCode());
        }

        byte[] buf = new byte[8192];
        ByteArrayOutputStream baos = new ByteArrayOutputStream(131072);
        try (InputStream is = streamResp.body()) {
            int n;
            while (true) {
                try { n = is.read(buf); } catch (IOException e) { break; }
                if (n < 0) break;
                baos.write(buf, 0, n);
            }
        }
        String body = baos.toString(StandardCharsets.UTF_8.name());
        if (body.isEmpty()) throw new IOException("Empty response for scheme " + schemeCode);

        // Extract meta fields
        String schemeName = extractMetaField(body, "scheme_name", "Unknown");
        String fundHouse  = extractMetaField(body, "fund_house",  "Unknown");
        String category   = extractMetaField(body, "scheme_category", "");

        // Extract ALL available NAV records (up to ~1800 from truncated response)
        Matcher m = NAV_RECORD.matcher(body);
        List<String> dateList = new ArrayList<>();
        List<Double>  navList  = new ArrayList<>();
        while (m.find()) {
            try {
                navList.add(Double.parseDouble(m.group(2)));
                dateList.add(m.group(1));
            } catch (NumberFormatException ignored) {}
        }
        int n = navList.size();
        if (n == 0) throw new IOException("No NAV data found for scheme " + schemeCode);

        double[] navs  = navList.stream().mapToDouble(Double::doubleValue).toArray();
        String[] dates = dateList.toArray(new String[0]);

        // Cache raw history for the chart endpoint
        histDatesCache.put(schemeCode, dates);
        histNavsCache.put(schemeCode, navs);

        // ---- 52-week (newest 252 records, data is newest-first) ----
        int w52 = Math.min(252, n);
        double high52w = 0, low52w = Double.MAX_VALUE;
        for (int i = 0; i < w52; i++) {
            if (navs[i] > high52w) high52w = navs[i];
            if (navs[i] < low52w)  low52w  = navs[i];
        }
        if (low52w == Double.MAX_VALUE) low52w = navs[0];

        double change        = n > 1 ? navs[0] - navs[1] : 0;
        double percentChange = n > 1 && navs[1] != 0 ? (change / navs[1]) * 100 : 0;
        double deltaHigh     = high52w != 0 ? ((navs[0] - high52w) / high52w) * 100 : 0;

        MutualFundData mf = new MutualFundData(schemeCode, schemeName, fundHouse, category,
                                               navs[0], dates[0], change, percentChange,
                                               high52w, low52w, deltaHigh);

        // ---- Simple returns ----
        mf.setRet1w(simpleReturn(navs, n, 5));
        mf.setRet1m(simpleReturn(navs, n, 21));
        mf.setRet3m(simpleReturn(navs, n, 63));
        mf.setRet6m(simpleReturn(navs, n, 126));

        // ---- CAGR ----
        mf.setCagr1y (cagrByIndex(navs, n, 252,  1.0));
        mf.setCagr3y (cagrByIndex(navs, n, 756,  3.0));
        mf.setCagr5y (cagrByIndex(navs, n, 1260, 5.0));

        long latestDay    = parseEpochDays(dates[0]);
        long inceptionDay = parseEpochDays(dates[n - 1]);
        double yearsSinceInception = (latestDay - inceptionDay) / 365.25;
        if (yearsSinceInception > 0 && navs[n - 1] > 0) {
            mf.setCagrSinceInception(
                (Math.pow(navs[0] / navs[n - 1], 1.0 / yearsSinceInception) - 1) * 100);
        }

        // ---- Volatility & downside deviation (last 1Y of log returns) ----
        int volWindow = Math.min(252, n - 1);
        if (volWindow >= 5) {
            double[] logRets = new double[volWindow];
            List<Double> negRets = new ArrayList<>();
            for (int i = 0; i < volWindow; i++) {
                if (navs[i + 1] > 0) {
                    double r = Math.log(navs[i] / navs[i + 1]);
                    logRets[i] = r;
                    if (r < 0) negRets.add(r);
                }
            }
            double vol = stdDev(logRets) * Math.sqrt(252) * 100;
            mf.setVolatility(vol);

            if (!negRets.isEmpty()) {
                double[] negArr = negRets.stream().mapToDouble(Double::doubleValue).toArray();
                double dd = stdDev(negArr) * Math.sqrt(252) * 100;
                mf.setDownsideDeviation(dd);
            }
        }

        // ---- Max drawdown (over all available history, oldest→newest scan) ----
        double peak = navs[n - 1];
        double maxDD = 0;
        for (int i = n - 1; i >= 0; i--) {
            if (navs[i] > peak) peak = navs[i];
            double dd = peak > 0 ? (navs[i] - peak) / peak * 100 : 0;
            if (dd < maxDD) maxDD = dd;
        }
        mf.setMaxDrawdown(maxDD);

        // ---- Sharpe & Sortino ----
        double cagr1y = mf.getCagr1y();
        double vol    = mf.getVolatility();
        double dsDev  = mf.getDownsideDeviation();
        if (cagr1y != 0 && vol > 0) {
            mf.setSharpe((cagr1y / 100 - RISK_FREE_RATE) / (vol / 100));
        }
        if (cagr1y != 0 && dsDev > 0) {
            mf.setSortino((cagr1y / 100 - RISK_FREE_RATE) / (dsDev / 100));
        }

        navCache.put(schemeCode, mf);
        navCacheTime.put(schemeCode, now);
        return mf;
    }

    /**
     * Returns the cached raw NAV history for a scheme (populated by getSchemeData).
     * If not yet cached, fetches it first.
     */
    public NavHistory getNavHistory(int schemeCode) throws IOException, InterruptedException {
        if (!histDatesCache.containsKey(schemeCode)) {
            getSchemeData(schemeCode);
        }
        return new NavHistory(histDatesCache.get(schemeCode), histNavsCache.get(schemeCode));
    }

    // -------------------------------------------------------------------------
    // Computation helpers
    // -------------------------------------------------------------------------

    /** Simple point-to-point % return from index 0 to index `offset`. */
    private static double simpleReturn(double[] navs, int n, int offset) {
        if (n <= offset || navs[offset] == 0) return 0;
        return (navs[0] - navs[offset]) / navs[offset] * 100;
    }

    /** CAGR using index-based approximation (assumes ~252 trading days/year). */
    private static double cagrByIndex(double[] navs, int n, int idx, double years) {
        if (n <= idx || navs[idx] == 0) return 0;
        return (Math.pow(navs[0] / navs[idx], 1.0 / years) - 1) * 100;
    }

    /** Sample standard deviation. */
    private static double stdDev(double[] values) {
        if (values.length < 2) return 0;
        double mean = 0;
        for (double v : values) mean += v;
        mean /= values.length;
        double variance = 0;
        for (double v : values) { double d = v - mean; variance += d * d; }
        return Math.sqrt(variance / (values.length - 1));
    }

    /** Parse "DD-MM-YYYY" → epoch days (days since 1970-01-01). */
    private static long parseEpochDays(String dateStr) {
        try {
            String[] p = dateStr.split("-");
            return LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]))
                            .toEpochDay();
        } catch (Exception e) { return 0; }
    }

    private static String extractMetaField(String body, String key, String defaultValue) {
        Pattern p = Pattern.compile("\"" + key + "\":\"([^\"]+)\"");
        Matcher m = p.matcher(body);
        return m.find() ? m.group(1) : defaultValue;
    }
}
