import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public class StockAPIClient {
    private static final String API_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
    private final HttpClient httpClient;

    public StockAPIClient() {
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public StockQuote getQuote(String symbol) throws IOException, InterruptedException {
        try {
            // Enriched fetch: 5y daily data gives us CAGR 1Y/3Y/5Y + YTD + correct previous close
            return doGetQuote(symbol, "?range=5y&interval=1d", true);
        } catch (IOException e) {
            // Some symbols (currency crosses, certain futures) don't support 1y/1mo —
            // fall back to bare URL; CAGR and YTD will be 0
            return doGetQuote(symbol, "", false);
        }
    }

    private StockQuote doGetQuote(String symbol, String params, boolean enriched)
            throws IOException, InterruptedException {
        String encodedSymbol = java.net.URLEncoder.encode(symbol, java.nio.charset.StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_URL + encodedSymbol + params))
                .header("User-Agent", "Mozilla/5.0")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            JsonObject jsonObject = JsonParser.parseString(response.body()).getAsJsonObject();
            JsonObject chart = jsonObject.getAsJsonObject("chart");

            if (chart.has("result") && !chart.get("result").isJsonNull()) {
                JsonObject result = chart.getAsJsonArray("result").get(0).getAsJsonObject();
                JsonObject meta = result.getAsJsonObject("meta");

                String currentSymbol = meta.has("symbol") ? meta.get("symbol").getAsString() : symbol;

                String name = currentSymbol;
                if (meta.has("shortName")) {
                    name = meta.get("shortName").getAsString();
                } else if (meta.has("longName")) {
                    name = meta.get("longName").getAsString();
                }

                double currentPrice = meta.has("regularMarketPrice") ? meta.get("regularMarketPrice").getAsDouble()
                        : 0.0;

                double fiftyTwoWeekHigh = meta.has("fiftyTwoWeekHigh") ? meta.get("fiftyTwoWeekHigh").getAsDouble()
                        : currentPrice;
                double fiftyTwoWeekLow = meta.has("fiftyTwoWeekLow") ? meta.get("fiftyTwoWeekLow").getAsDouble()
                        : currentPrice;

                String currency = meta.has("currency") ? meta.get("currency").getAsString() : "INR";

                // Default previous close — overridden from daily close array when enriched
                double previousClose = meta.has("chartPreviousClose")
                        ? meta.get("chartPreviousClose").getAsDouble()
                        : currentPrice;

                double ytdChange = 0.0;
                double cagr1y = 0.0, cagr3y = 0.0, cagr5y = 0.0;
                if (enriched) {
                    try {
                        com.google.gson.JsonArray timestamps = result.getAsJsonArray("timestamp");
                        com.google.gson.JsonArray closes = result
                                .getAsJsonObject("indicators")
                                .getAsJsonArray("quote").get(0).getAsJsonObject()
                                .getAsJsonArray("close");

                        // Derive previous close from daily close array (accurate regardless of range)
                        java.util.List<Double> validCloses = new java.util.ArrayList<>();
                        for (int i = 0; i < closes.size(); i++) {
                            if (!closes.get(i).isJsonNull()) validCloses.add(closes.get(i).getAsDouble());
                        }
                        if (validCloses.size() >= 2) {
                            double lastClose = validCloses.get(validCloses.size() - 1);
                            previousClose = Math.abs(lastClose - currentPrice) < 0.01 * currentPrice
                                    ? validCloses.get(validCloses.size() - 2)  // settled close — prev is second-to-last
                                    : lastClose;                                // intraday — last bar is yesterday
                        } else if (validCloses.size() == 1) {
                            previousClose = validCloses.get(0);
                        }

                        long now = System.currentTimeMillis() / 1000;
                        long target1y = now - (long)(365.25 * 86400);
                        long target3y = now - (long)(3 * 365.25 * 86400);
                        long target5y = now - (long)(5 * 365.25 * 86400);
                        long jan1Epoch = java.time.LocalDate.now().withDayOfYear(1)
                                .atStartOfDay(java.time.ZoneOffset.UTC).toEpochSecond();

                        double price1y = Double.NaN, price3y = Double.NaN, price5y = Double.NaN;
                        double ytdStart = Double.NaN;
                        boolean found1y = false, found3y = false, found5y = false, foundYtd = false;

                        for (int i = 0; i < timestamps.size(); i++) {
                            if (closes.get(i).isJsonNull()) continue;
                            long ts = timestamps.get(i).getAsLong();
                            double close = closes.get(i).getAsDouble();
                            if (!found5y  && ts >= target5y)  { price5y  = close; found5y  = true; }
                            if (!found3y  && ts >= target3y)  { price3y  = close; found3y  = true; }
                            if (!found1y  && ts >= target1y)  { price1y  = close; found1y  = true; }
                            if (!foundYtd && ts >= jan1Epoch) { ytdStart = close; foundYtd = true; }
                        }

                        if (!Double.isNaN(ytdStart) && ytdStart != 0)
                            ytdChange = ((currentPrice - ytdStart) / ytdStart) * 100;
                        if (!Double.isNaN(price1y) && price1y != 0)
                            cagr1y = ((currentPrice - price1y) / price1y) * 100;
                        if (!Double.isNaN(price3y) && price3y != 0)
                            cagr3y = (Math.pow(currentPrice / price3y, 1.0 / 3) - 1) * 100;
                        if (!Double.isNaN(price5y) && price5y != 0)
                            cagr5y = (Math.pow(currentPrice / price5y, 1.0 / 5) - 1) * 100;

                        // Compute 52W high/low from last 252 trading days of close data.
                        // Overrides meta fields which are absent for many NSE sectoral indices (^CNX*).
                        if (!validCloses.isEmpty()) {
                            int from = Math.max(0, validCloses.size() - 252);
                            double computed52wHigh = validCloses.get(from);
                            double computed52wLow  = validCloses.get(from);
                            for (int i = from + 1; i < validCloses.size(); i++) {
                                double c = validCloses.get(i);
                                if (c > computed52wHigh) computed52wHigh = c;
                                if (c < computed52wLow)  computed52wLow  = c;
                            }
                            fiftyTwoWeekHigh = computed52wHigh;
                            fiftyTwoWeekLow  = computed52wLow;
                        }
                    } catch (Exception ignored) {}
                }

                double change = currentPrice - previousClose;
                double percentChange = previousClose != 0 ? (change / previousClose) * 100 : 0.0;

                return new StockQuote(currentSymbol, name, currentPrice, change, percentChange, fiftyTwoWeekHigh,
                        fiftyTwoWeekLow, currency, ytdChange, cagr1y, cagr3y, cagr5y);
            } else if (chart.has("error") && !chart.get("error").isJsonNull()) {
                String errorDesc = chart.getAsJsonObject("error").get("description").getAsString();
                throw new IOException("API Error for " + symbol + ": " + errorDesc);
            }
        }

        throw new IOException("Failed to get quote for " + symbol + ". Status code: " + response.statusCode());
    }

    public String getHistoricalData(String symbol, String range) throws IOException, InterruptedException {
        return getHistoricalData(symbol, range, null);
    }

    public String getHistoricalData(String symbol, String range, String customInterval) throws IOException, InterruptedException {
        String encodedSymbol = java.net.URLEncoder.encode(symbol, StandardCharsets.UTF_8);
        String interval;
        if (customInterval != null && !customInterval.isEmpty()) {
            interval = customInterval;
        } else {
            interval = "1d";
            if ("1d".equals(range))
                interval = "1m";
            else if ("5d".equals(range))
                interval = "15m";
            else if ("max".equals(range))
                interval = "1mo";
        }

        String url = API_URL + encodedSymbol + "?range=" + range + "&interval=" + interval;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            return response.body();
        }

        throw new IOException(
                "Failed to get historical data for " + symbol + ". Status code: " + response.statusCode());
    }

    public CompletableFuture<HttpResponse<String>> sendAsyncRequest(HttpRequest request) {
        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
    }

    public String searchSymbols(String query) throws IOException, InterruptedException {
        String encodedQuery = java.net.URLEncoder.encode(query, StandardCharsets.UTF_8);
        String url = "https://query2.finance.yahoo.com/v1/finance/search?q=" + encodedQuery
                + "&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_quote_search_api&multiQuoteQueryId=tss_multi_quote_search_api&enableCb=true&enableNavLinks=true&enableEnhancedTrivialQuery=true";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }
}
