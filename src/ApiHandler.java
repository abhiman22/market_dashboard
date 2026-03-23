import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.google.gson.Gson;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class ApiHandler implements HttpHandler {
    private final StockAPIClient apiClient;
    private static final Gson gson = new Gson();
    
    // In-memory cache for quotes (Symbol -> StockQuote)
    private static final Map<String, StockQuote> quoteCache = new ConcurrentHashMap<>();
    private static final Map<String, Long> cacheTimestamps = new ConcurrentHashMap<>();
    private static final long CACHE_EXPIRY_MS = 60000; // 1 minute fresh, but keep stale indefinitely for UI stability
    private static final DateTimeFormatter RSS_DATE_FORMATTER = DateTimeFormatter.RFC_1123_DATE_TIME;
    private static final Set<String> TRUSTED_SOURCES = Set.of(
        "mint", "the economic times", "business standard", "reuters", "bloomberg", 
        "moneycontrol", "financial express", "cnbc", "yahoo finance", "business today", 
        "ndtv profit", "finshot", "the hindu business line"
    );

    // Commodities Localization Constants
    private static final String GOLD_SYMBOL = "XAUINR=X";
    private static final String SILVER_SYMBOL = "XAGINR=X";
    private static final double TROY_OZ_TO_G = 31.1034768;
    private static final double GOLD_UNIT_G = 10.0; // 10 grams
    private static final double SILVER_UNIT_G = 1000.0; // 1 kg

    public ApiHandler(StockAPIClient apiClient) {
        this.apiClient = apiClient;
    }

    private StockQuote localizeMetal(StockQuote q) {
        if (q == null) return null;
        if (!GOLD_SYMBOL.equals(q.getSymbol()) && !SILVER_SYMBOL.equals(q.getSymbol())) {
            return q;
        }

        double factor = 1.0;
        String newName = q.getName();
        
        if (GOLD_SYMBOL.equals(q.getSymbol())) {
            factor = (GOLD_UNIT_G / TROY_OZ_TO_G); // Already in INR
            newName = "Gold (10g)";
        } else if (SILVER_SYMBOL.equals(q.getSymbol())) {
            factor = (SILVER_UNIT_G / TROY_OZ_TO_G); // Already in INR
            newName = "Silver (1kg)";
        }

        return new StockQuote(
            q.getSymbol(),
            newName,
            q.getCurrentPrice() * factor,
            q.getChange() * factor,
            q.getPercentChange(),
            q.getFiftyTwoWeekHigh() * factor,
            q.getFiftyTwoWeekLow() * factor,
            "INR"
        );
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        
        // Add CORS Headers globally
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        if ("/api/quotes".equals(path)) {
            handleQuotes(exchange);
        } else if ("/api/chart".equals(path)) {
            handleChart(exchange);
        } else if ("/api/news".equals(path)) {
            handleNews(exchange);
        } else if ("/api/search".equals(path)) {
            handleSearch(exchange);
        } else if ("/api/calendar".equals(path)) {
            handleCalendar(exchange);
        } else {
            // No static handler needed since App handles it, but for safety:
            exchange.sendResponseHeaders(404, -1);
        }
    }

    private void handleCalendar(HttpExchange exchange) throws IOException {
        String json = "{\"earnings\": [" +
            "{\"company\": \"TCS\", \"date\": \"Apr 12\", \"impact\": \"HIGH\"}," +
            "{\"company\": \"Reliance\", \"date\": \"Apr 18\", \"impact\": \"MEDIUM\"}," +
            "{\"company\": \"HDFCBANK\", \"date\": \"Apr 20\", \"impact\": \"HIGH\"}" +
            "], \"ipos\": [" +
            "{\"company\": \"SolarGrid\", \"date\": \"May 02\", \"status\": \"ANNOUNCED\"}" +
            "]}";
        sendJsonResponse(exchange, 200, json);
    }

    private void handleQuotes(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || !query.contains("symbols=")) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing symbols parameter\"}");
            return;
        }
        
        String symbolsParam = null;
        for (String param : query.split("&")) {
            if (param.startsWith("symbols=")) {
                symbolsParam = param.substring("symbols=".length());
            }
        }
        
        if (symbolsParam == null) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing symbols parameter\"}");
            return;
        }

        String decodedSymbols = java.net.URLDecoder.decode(symbolsParam, StandardCharsets.UTF_8);
        String[] symbolsArr = decodedSymbols.split(",");
        
        List<StockQuote> quotesList = Collections.synchronizedList(new ArrayList<>());
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        long now = System.currentTimeMillis();

        for (String symbol : symbolsArr) {
            String trimmed = symbol.trim();
            if (trimmed.isEmpty()) continue;
            
            // Check fresh cache
            if (quoteCache.containsKey(trimmed) && (now - cacheTimestamps.getOrDefault(trimmed, 0L) < CACHE_EXPIRY_MS)) {
                quotesList.add(quoteCache.get(trimmed));
                continue;
            }

            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                try {
                    StockQuote q = apiClient.getQuote(trimmed);
                    // Localization for metals
                    q = localizeMetal(q);
                    
                    quoteCache.put(trimmed, q);
                    cacheTimestamps.put(trimmed, System.currentTimeMillis());
                    quotesList.add(q);
                } catch (Exception e) {
                    System.err.println("API Error " + trimmed + ": " + e.getMessage());
                    // Fallback to stale data if available
                    if (quoteCache.containsKey(trimmed)) {
                        quotesList.add(quoteCache.get(trimmed));
                    } else {
                        quotesList.add(new StockQuote(trimmed, "Data Unavailable", 0.0, 0.0, 0.0, 0.0, 0.0, null));
                    }
                }
            });
            futures.add(future);
        }
        
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        } catch (Exception e) {
            e.printStackTrace();
        }

        sendJsonResponse(exchange, 200, gson.toJson(quotesList));
    }

    private void handleChart(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || !query.contains("symbol=")) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing symbol parameter\"}");
            return;
        }
        
        String symbol = null;
        String range = "1y";
        for (String param : query.split("&")) {
            String[] pair = param.split("=", 2); // Limit to 2 parts
            if (pair.length == 2) {
                if ("symbol".equals(pair[0])) symbol = java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
                if ("range".equals(pair[0])) range = pair[1];
            }
        }

        if (symbol == null) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing symbol parameter\"}");
            return;
        }

        try {
            String data = apiClient.getHistoricalData(symbol, range);
            
            // If it's a metal, scale the historical data to units (already in INR)
            if (GOLD_SYMBOL.equals(symbol) || SILVER_SYMBOL.equals(symbol)) {
                double factor = GOLD_SYMBOL.equals(symbol) ? 
                               (GOLD_UNIT_G / TROY_OZ_TO_G) : 
                               (SILVER_UNIT_G / TROY_OZ_TO_G);

                com.google.gson.JsonObject json = com.google.gson.JsonParser.parseString(data).getAsJsonObject();
                if (json.has("chart")) {
                    com.google.gson.JsonObject chart = json.getAsJsonObject("chart");
                    if (chart.has("result") && !chart.get("result").isJsonNull()) {
                        com.google.gson.JsonObject result = chart.getAsJsonArray("result").get(0).getAsJsonObject();
                        com.google.gson.JsonObject indicators = result.getAsJsonObject("indicators");
                        com.google.gson.JsonArray quotes = indicators.getAsJsonArray("quote");
                        
                        if (quotes.size() > 0) {
                            com.google.gson.JsonObject quoteObj = quotes.get(0).getAsJsonObject();
                            if (quoteObj.has("close")) {
                                com.google.gson.JsonArray closeArr = quoteObj.getAsJsonArray("close");
                                com.google.gson.JsonArray newClose = new com.google.gson.JsonArray();
                                for (com.google.gson.JsonElement e : closeArr) {
                                    if (e.isJsonNull()) {
                                        newClose.add(com.google.gson.JsonNull.INSTANCE);
                                    } else {
                                        newClose.add(e.getAsDouble() * factor);
                                    }
                                }
                                quoteObj.add("close", newClose);
                            }
                        }
                    }
                }
                data = gson.toJson(json);
            }
            
            sendJsonResponse(exchange, 200, data);
        } catch (Exception e) {
            System.err.println("Chart API Error " + symbol + ": " + e.getMessage());
            sendJsonResponse(exchange, 500, "{\"error\": \"" + e.getMessage() + "\"}");
        }
    }

    private void handleSearch(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || !query.contains("q=")) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing q parameter\"}");
            return;
        }
        
        String searchTerm = "";
        for (String param : query.split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && "q".equals(pair[0])) {
                searchTerm = java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }

        try {
            String result = apiClient.searchSymbols(searchTerm);
            sendJsonResponse(exchange, 200, result);
        } catch (Exception e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"" + e.getMessage() + "\"}");
        }
    }

    private void handleNews(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String symbol = null;
        String name = "Stock Market Breaking News";
        
        if (query != null && query.contains("symbol=")) {
            symbol = query.split("symbol=")[1].split("&")[0];
            name = query.contains("name=") ? query.split("name=")[1].split("&")[0] : symbol;
        }

        String decodedName = java.net.URLDecoder.decode(name, StandardCharsets.UTF_8);
        String encodedName = java.net.URLEncoder.encode(decodedName + (symbol != null ? " stock news" : ""), StandardCharsets.UTF_8);
        
        // Source 1: Yahoo Finance RSS (only if symbol exists)
        String yahooUrl = symbol != null ? "https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + symbol : null;
        // Source 2: Google News Aggregate RSS (Search based)
        String googleUrl = "https://news.google.com/rss/search?q=" + encodedName + "&hl=en-IN&gl=IN&ceid=IN:en";
        
        HttpRequest googleReq = HttpRequest.newBuilder().uri(URI.create(googleUrl)).header("User-Agent", "Mozilla/5.0").build();
        CompletableFuture<HttpResponse<String>> googleFuture = apiClient.sendAsyncRequest(googleReq);
        
        CompletableFuture<HttpResponse<String>> yahooFuture = null;
        if (yahooUrl != null) {
            HttpRequest yahooReq = HttpRequest.newBuilder().uri(URI.create(yahooUrl)).header("User-Agent", "Mozilla/5.0").build();
            yahooFuture = apiClient.sendAsyncRequest(yahooReq);
        }

        CompletableFuture<Void> allFutures = yahooFuture != null ? CompletableFuture.allOf(yahooFuture, googleFuture) : CompletableFuture.allOf(googleFuture);

        final CompletableFuture<HttpResponse<String>> finalYahooFuture = yahooFuture;
        allFutures.thenAccept(v -> {
            try {
                List<NewsItem> allItems = new ArrayList<>();
                if (finalYahooFuture != null) {
                    allItems.addAll(parseRssItems(finalYahooFuture.join().body(), "Yahoo Finance", 10));
                }
                allItems.addAll(parseRssItems(googleFuture.join().body(), "Google News", 15));

                // Filter by Trusted Sources, Deduplicate by Title, and Sort by Date
                List<NewsItem> curatedItems = allItems.stream()
                    .filter(item -> isTrusted(item.title, item.publisher))
                    .collect(Collectors.toMap(
                        item -> item.title.toLowerCase().replaceAll("[^a-z0-9]", ""), // dedupe key
                        item -> item,
                        (existing, replacement) -> existing.timestamp >= replacement.timestamp ? existing : replacement
                    ))
                    .values().stream()
                    .sorted(Comparator.comparingLong((NewsItem i) -> i.timestamp).reversed())
                    .limit(12)
                    .collect(Collectors.toList());

                String lexiconJson = analyzeLexicon(curatedItems);
                String semanticJson = analyzeSemantic(curatedItems, decodedName);
                
                String newsArrayJson = curatedItems.stream()
                    .map(item -> String.format("{\"title\":\"%s\", \"link\":\"%s\", \"publisher\":\"%s\", \"date\":\"%s\"}", 
                        escapeJson(item.title), escapeJson(item.link), escapeJson(item.publisher), escapeJson(item.date)))
                    .collect(Collectors.joining(","));

                sendJsonResponse(exchange, 200, String.format("{\"news\": [%s], \"lexicon\": %s, \"semantic\": %s}", newsArrayJson, lexiconJson, semanticJson));
            } catch (IOException e) {
                e.printStackTrace();
            }
        });
    }

    private static class NewsItem {
        String title, link, publisher, date;
        long timestamp;
        NewsItem(String t, String l, String p, String d, long ts) { 
            title = t; link = l; publisher = p; date = d; timestamp = ts; 
        }
    }

    private String analyzeLexicon(List<NewsItem> items) {
        int bullishCount = 0;
        int bearishCount = 0;
        List<String> insights = new ArrayList<>();

        String[] bullKeywords = {"record", "profit", "growth", "dividend", "upgrade", "buy", "bullish", "positive", "expansion", "surpasses", "partnership", "acquisition", "strong", "rally", "gain", "high"};
        String[] bearKeywords = {"loss", "decline", "crash", "sell", "bearish", "negative", "downgrade", "debt", "litigation", "penalty", "dip", "fall", "uncertainty", "weak", "low", "slump"};

        for (NewsItem item : items) {
            String text = item.title.toLowerCase();
            for (String k : bullKeywords) {
                if (text.contains(k)) { bullishCount++; if (!insights.contains(k)) insights.add(k); }
            }
            for (String k : bearKeywords) {
                if (text.contains(k)) { bearishCount++; if (!insights.contains(k)) insights.add(k); }
            }
        }

        double score = (bullishCount + bearishCount == 0) ? 0 : (double)(bullishCount - bearishCount) / (bullishCount + bearishCount);
        String recommendation = (score > 0.2) ? "BUY" : (score < -0.2 ? "SELL" : "HOLD");
        String summary = insights.isEmpty() ? "No keyword drivers found." : "Keywords: " + String.join(", ", insights);
        
        return String.format("{\"recommendation\": \"%s\", \"summary\": \"%s\"}", recommendation, escapeJson(summary));
    }

    private String analyzeSemantic(List<NewsItem> items, String companyName) {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            return "{\"recommendation\": \"DEMO\", \"summary\": \"Connect Gemini API key to enable Deep Semantic Analysis.\", \"isLocked\": true}";
        }

        StringBuilder prompt = new StringBuilder("Analyze these financial headlines for " + companyName + ". Provide a 1-word recommendation (BUY/SELL/HOLD) and a 1-sentence reasoning.\n\n");
        for (NewsItem item : items) prompt.append("- ").append(item.title).append("\n");

        try {
            String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
            String body = "{\"contents\":[{\"parts\":[{\"text\":\"" + escapeJson(prompt.toString()) + "\"}]}]}";
            
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            // Note: In a production app, we'd use async, but for this handler we'll join it since news is already async
            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                // Simplified parsing of Gemini response
                String text = response.body();
                // Find "text": "..." in JSON
                int start = text.indexOf("\"text\": \"") + 9;
                int end = text.indexOf("\"", start);
                String aiResponse = text.substring(start, end).replace("\\n", " ");
                
                String recommendation = "HOLD";
                if (aiResponse.toUpperCase().contains("BUY")) recommendation = "BUY";
                else if (aiResponse.toUpperCase().contains("SELL")) recommendation = "SELL";
                
                return String.format("{\"recommendation\": \"%s\", \"summary\": \"%s\", \"isLocked\": false}", recommendation, escapeJson(aiResponse));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "{\"recommendation\": \"ERROR\", \"summary\": \"AI Analysis temporarily unavailable.\", \"isLocked\": false}";
    }

    private boolean isTrusted(String title, String publisher) {
        String combined = (title + " " + publisher).toLowerCase();
        return TRUSTED_SOURCES.stream().anyMatch(combined::contains);
    }

    private List<NewsItem> parseRssItems(String xml, String publisher, int limit) {
        List<NewsItem> items = new ArrayList<>();
        Pattern itemPattern = Pattern.compile("<item>(.*?)</item>", Pattern.DOTALL);
        Pattern titlePattern = Pattern.compile("<title>(.*?)</title>", Pattern.DOTALL);
        Pattern linkPattern = Pattern.compile("<link>(.*?)</link>", Pattern.DOTALL);
        Pattern datePattern = Pattern.compile("<pubDate>(.*?)</pubDate>", Pattern.DOTALL);

        Matcher itemMatcher = itemPattern.matcher(xml);
        int count = 0;
        while (itemMatcher.find() && count < limit) {
            String itemXml = itemMatcher.group(1);
            String title = extractTag(itemXml, titlePattern);
            String link = extractTag(itemXml, linkPattern);
            String date = extractTag(itemXml, datePattern);
            
            long ts = 0;
            try {
                if (!date.isEmpty()) {
                    ts = ZonedDateTime.parse(date, RSS_DATE_FORMATTER).toInstant().toEpochMilli();
                }
            } catch (Exception e) {
                // If parse fails, use current time but prioritize sorted items
                ts = System.currentTimeMillis() - (count * 1000);
            }

            items.add(new NewsItem(title, link, publisher, date, ts));
            count++;
        }
        return items;
    }

    private String extractTag(String xml, Pattern pattern) {
        Matcher m = pattern.matcher(xml);
        if (m.find()) {
            return m.group(1).trim().replaceAll("<!\\[CDATA\\[(.*?)\\]\\]>", "$1");
        }
        return "";
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\b", "\\b")
                    .replace("\f", "\\f")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
    }

    private void sendJsonResponse(HttpExchange exchange, int statusCode, String responseJson) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        byte[] bytes = responseJson.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
