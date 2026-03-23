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
        String encodedSymbol = java.net.URLEncoder.encode(symbol, java.nio.charset.StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_URL + encodedSymbol))
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
                double previousClose = meta.has("chartPreviousClose") ? meta.get("chartPreviousClose").getAsDouble()
                        : currentPrice;

                double fiftyTwoWeekHigh = meta.has("fiftyTwoWeekHigh") ? meta.get("fiftyTwoWeekHigh").getAsDouble()
                        : currentPrice;
                double fiftyTwoWeekLow = meta.has("fiftyTwoWeekLow") ? meta.get("fiftyTwoWeekLow").getAsDouble()
                        : currentPrice;

                double change = currentPrice - previousClose;
                double percentChange = previousClose != 0 ? (change / previousClose) * 100 : 0.0;
                String currency = meta.has("currency") ? meta.get("currency").getAsString() : "INR";

                if (currentSymbol.contains("GC=F") || currentSymbol.contains("SI=F")) {
                    System.out.println(
                            "DEBUG: Raw Quote for " + currentSymbol + ": Price=" + currentPrice + " Curr=" + currency);
                }

                return new StockQuote(currentSymbol, name, currentPrice, change, percentChange, fiftyTwoWeekHigh,
                        fiftyTwoWeekLow, currency);
            } else if (chart.has("error") && !chart.get("error").isJsonNull()) {
                String errorDesc = chart.getAsJsonObject("error").get("description").getAsString();
                throw new IOException("API Error for " + symbol + ": " + errorDesc);
            }
        }

        throw new IOException("Failed to get quote for " + symbol + ". Status code: " + response.statusCode()
                + " Request URL: " + API_URL + encodedSymbol);
    }

    public String getHistoricalData(String symbol, String range) throws IOException, InterruptedException {
        String encodedSymbol = java.net.URLEncoder.encode(symbol, StandardCharsets.UTF_8);
        String interval = "1d";
        if ("1d".equals(range))
            interval = "1m";
        else if ("5d".equals(range))
            interval = "15m";

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
