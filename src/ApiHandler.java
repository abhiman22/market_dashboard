import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
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
    private final MFApiClient mfApiClient;
    private static final Gson gson = new Gson();
    
    // In-memory cache for quotes (Symbol -> StockQuote)
    private static final Map<String, StockQuote> quoteCache = new ConcurrentHashMap<>();
    private static final Map<String, Long> cacheTimestamps = new ConcurrentHashMap<>();
    private static final long CACHE_EXPIRY_MS = 60000; // 1 minute fresh, but keep stale indefinitely for UI stability

    // In-memory cache for YouTube live stream video IDs (channelId -> videoId)
    private static final Map<String, String> liveStreamCache = new ConcurrentHashMap<>();
    private static final Map<String, Long> liveStreamCacheTimestamps = new ConcurrentHashMap<>();
    private static final long LIVE_STREAM_CACHE_MS = 30 * 60 * 1000L; // 30 minutes
    private static final DateTimeFormatter RSS_DATE_FORMATTER = DateTimeFormatter.RFC_1123_DATE_TIME;
    private static final Set<String> TRUSTED_SOURCES = Set.of(
        // Indian sources
        "mint", "livemint", "the economic times", "et markets", "economictimes",
        "business standard", "moneycontrol", "financial express", "business today",
        "ndtv profit", "ndtvprofit", "finshot", "the hindu business line", "hindu business line",
        "zeebiz", "cnbctv18", "the ken", "inc42", "entrackr", "vccircle",
        // Global sources
        "reuters", "bloomberg", "cnbc", "yahoo finance", "marketwatch",
        "wall street journal", "wsj", "financial times", "ft.com",
        "morningstar", "benzinga", "seeking alpha", "investopedia",
        "barron", "fortune", "forbes", "business insider", "markets insider",
        "associated press", "ap news", "the guardian", "bbc"
    );

    // Commodities Localization Constants (GC=F / SI=F are in USD — converted to INR at runtime)
    private static final String GOLD_SYMBOL   = "GC=F";
    private static final String SILVER_SYMBOL = "SI=F";
    private static final double TROY_OZ_TO_G  = 31.1034768;
    private static final double GOLD_UNIT_G   = 10.0;    // per 10 grams
    private static final double SILVER_UNIT_G = 1000.0;  // per 1 kg

    // AMC names that match the start of scheme names in the mfapi.in dataset
    private static final List<String> KNOWN_AMCS = Arrays.asList(
        "Aditya Birla Sun Life", "Axis", "Bandhan", "Canara Robeco", "DSP",
        "Edelweiss", "Franklin India", "HDFC", "HSBC", "ICICI Prudential",
        "IDBI", "IDFC", "Invesco India", "ITI", "JM Financial", "Kotak",
        "LIC MF", "Mahindra Manulife", "Mirae Asset", "Motilal Oswal",
        "Navi", "Nippon India", "PGIM India", "Parag Parikh",
        "Quantum", "SBI", "Sundaram", "Tata", "Taurus",
        "Union", "UTI", "WhiteOak Capital", "Zerodha"
    );

    // Category keywords to match inside scheme names (case-insensitive)
    private static final Map<String, String> MF_CATEGORY_KEYWORDS = Map.of(
        "large-cap",  "large cap fund",
        "mid-cap",    "mid cap fund",
        "small-cap",  "small cap fund",
        "flexi-cap",  "flexi cap fund"
    );

    // AMC priority order per category — approximates descending AUM rank
    private static final Map<String, List<String>> MF_AMC_PRIORITY = Map.of(
        "large-cap",  Arrays.asList("HDFC", "Nippon India", "ICICI Prudential", "SBI", "Kotak",
                                    "Mirae Asset", "Axis", "UTI", "Canara Robeco", "Franklin India"),
        "mid-cap",    Arrays.asList("HDFC", "Nippon India", "Kotak", "SBI", "Axis",
                                    "Tata", "DSP", "Mirae Asset", "Franklin India", "UTI"),
        "small-cap",  Arrays.asList("Nippon India", "SBI", "HDFC", "Kotak", "Axis",
                                    "Tata", "DSP", "Franklin India", "Mirae Asset", "UTI"),
        "flexi-cap",  Arrays.asList("HDFC", "Parag Parikh", "Kotak", "Franklin India",
                                    "UTI", "SBI", "Axis", "DSP", "Mirae Asset", "Nippon India")
    );

    public ApiHandler(StockAPIClient apiClient, MFApiClient mfApiClient) {
        this.apiClient = apiClient;
        this.mfApiClient = mfApiClient;
    }

    private StockQuote localizeMetal(StockQuote q, double usdToInr) {
        if (q == null) return null;
        String sym = q.getSymbol();
        if (!GOLD_SYMBOL.equals(sym) && !SILVER_SYMBOL.equals(sym)) return q;

        // GC=F / SI=F are priced in USD per troy oz — convert to INR per local unit
        double factor;
        String newName;
        if (GOLD_SYMBOL.equals(sym)) {
            factor = usdToInr * (GOLD_UNIT_G / TROY_OZ_TO_G);
            newName = "Gold (10g)";
        } else {
            factor = usdToInr * (SILVER_UNIT_G / TROY_OZ_TO_G);
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
            "INR",
            q.getYtdChange(),
            q.getCagr1y()
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
            try { handleNews(exchange); }
            catch (Exception e) {
                System.err.println("handleNews exception: " + e);
                e.printStackTrace();
                try { sendJsonResponse(exchange, 200, "{\"news\":[],\"lexicon\":null,\"semantic\":null}"); } catch (Exception ignored) {}
            }
        } else if ("/api/search".equals(path)) {
            handleSearch(exchange);
        } else if ("/api/calendar".equals(path)) {
            handleCalendar(exchange);
        } else if ("/api/live-stream".equals(path)) {
            handleLiveStream(exchange);
        } else if (path.startsWith("/api/mf")) {
            handleMF(exchange, path);
        } else {
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
        
        // Get USD→INR rate for metal conversion (use cache if fresh, else fetch)
        double usdInrRate = 85.0;
        StockQuote cachedUsdInr = quoteCache.get("USDINR=X");
        if (cachedUsdInr != null && cachedUsdInr.getCurrentPrice() > 0) {
            usdInrRate = cachedUsdInr.getCurrentPrice();
        } else {
            try {
                StockQuote r = apiClient.getQuote("USDINR=X");
                if (r != null && r.getCurrentPrice() > 0) {
                    usdInrRate = r.getCurrentPrice();
                    quoteCache.put("USDINR=X", r);
                    cacheTimestamps.put("USDINR=X", System.currentTimeMillis());
                }
            } catch (Exception ignored) {}
        }
        final double usdInr = usdInrRate;

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
                    // Localization for metals (USD→INR conversion)
                    q = localizeMetal(q, usdInr);
                    
                    quoteCache.put(trimmed, q);
                    cacheTimestamps.put(trimmed, System.currentTimeMillis());
                    quotesList.add(q);
                } catch (Exception e) {
                    System.err.println("API Error " + trimmed + ": " + e.getMessage());
                    // Fallback to stale data if available
                    if (quoteCache.containsKey(trimmed)) {
                        quotesList.add(quoteCache.get(trimmed));
                    } else {
                        quotesList.add(new StockQuote(trimmed, "Fallback", 0.0, 0.0, 0.0, 0.0, 0.0, null, 0.0, 0.0));
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
            
            sendJsonResponse(exchange, 200, data);
        } catch (Exception e) {
            System.err.println("Chart API Error " + symbol + ": " + e.getMessage());
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
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
            String[] pair = param.split("=", 2); // Limit to 2 parts so queries containing '=' are not broken
            if (pair.length == 2 && "q".equals(pair[0])) {
                searchTerm = java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }

        try {
            String result = apiClient.searchSymbols(searchTerm);
            sendJsonResponse(exchange, 200, result);
        } catch (Exception e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
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
        boolean alreadyMarketTerm = decodedName.toLowerCase().contains("stock market") || decodedName.toLowerCase().contains("market news");
        String searchTerm = decodedName + (symbol != null && !alreadyMarketTerm ? " stock news" : "");
        String encodedTerm = java.net.URLEncoder.encode(searchTerm, StandardCharsets.UTF_8);

        // Source 1: Yahoo Finance RSS (symbol-specific, may not exist for all tickers)
        String yahooUrl = symbol != null ? "https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + java.net.URLEncoder.encode(symbol, StandardCharsets.UTF_8) : null;
        // Source 2: Google News RSS
        String googleUrl = "https://news.google.com/rss/search?q=" + encodedTerm + "&hl=en-IN&gl=IN&ceid=IN:en";
        // Source 3: Bing News RSS — broad coverage, good for Indian tickers not in Yahoo RSS
        String bingUrl = "https://www.bing.com/news/search?q=" + encodedTerm + "&format=rss";

        java.time.Duration NEWS_TIMEOUT = java.time.Duration.ofSeconds(8);
        HttpRequest googleReq = HttpRequest.newBuilder().uri(URI.create(googleUrl)).header("User-Agent", "Mozilla/5.0").timeout(NEWS_TIMEOUT).build();
        HttpRequest bingReq   = HttpRequest.newBuilder().uri(URI.create(bingUrl)).header("User-Agent", "Mozilla/5.0").timeout(NEWS_TIMEOUT).build();
        CompletableFuture<HttpResponse<String>> googleFuture = apiClient.sendAsyncRequest(googleReq).exceptionally(e -> null);
        CompletableFuture<HttpResponse<String>> bingFuture   = apiClient.sendAsyncRequest(bingReq).exceptionally(e -> null);

        CompletableFuture<HttpResponse<String>> yahooFuture = null;
        if (yahooUrl != null) {
            HttpRequest yahooReq = HttpRequest.newBuilder().uri(URI.create(yahooUrl)).header("User-Agent", "Mozilla/5.0").timeout(NEWS_TIMEOUT).build();
            yahooFuture = apiClient.sendAsyncRequest(yahooReq).exceptionally(e -> null);
        }

        CompletableFuture<Void> allFutures = yahooFuture != null
            ? CompletableFuture.allOf(yahooFuture, googleFuture, bingFuture)
            : CompletableFuture.allOf(googleFuture, bingFuture);

        final CompletableFuture<HttpResponse<String>> finalYahooFuture = yahooFuture;
        try {
            allFutures.thenAccept(v -> {
                try {
                    List<NewsItem> allItems = new ArrayList<>();
                    HttpResponse<String> yahooResp  = finalYahooFuture != null ? finalYahooFuture.join() : null;
                    HttpResponse<String> googleResp = googleFuture.join();
                    HttpResponse<String> bingResp   = bingFuture.join();
                    if (yahooResp  != null && yahooResp.body()  != null) allItems.addAll(parseRssItems(yahooResp.body(),  "Yahoo Finance", 10));
                    if (googleResp != null && googleResp.body() != null) allItems.addAll(parseRssItems(googleResp.body(), "Google News",   15));
                    if (bingResp   != null && bingResp.body()   != null) allItems.addAll(parseRssItems(bingResp.body(),   "Bing News",     10));

                    Map<String, NewsItem> dedupedMap = allItems.stream()
                        .collect(Collectors.toMap(
                            item -> item.title.toLowerCase().replaceAll("[^a-z0-9]", ""),
                            item -> item,
                            (existing, replacement) -> existing.timestamp >= replacement.timestamp ? existing : replacement
                        ));

                    List<NewsItem> curatedItems = dedupedMap.values().stream()
                        .filter(item -> isTrusted(item.title, item.publisher))
                        .sorted(Comparator.comparingLong((NewsItem i) -> i.timestamp).reversed())
                        .limit(12)
                        .collect(Collectors.toList());

                    if (curatedItems.size() < 3) {
                        Set<String> usedKeys = curatedItems.stream()
                            .map(i -> i.title.toLowerCase().replaceAll("[^a-z0-9]", ""))
                            .collect(Collectors.toSet());
                        List<NewsItem> extras = dedupedMap.values().stream()
                            .filter(item -> !usedKeys.contains(item.title.toLowerCase().replaceAll("[^a-z0-9]", "")))
                            .sorted(Comparator.comparingLong((NewsItem i) -> i.timestamp).reversed())
                            .limit(12 - curatedItems.size())
                            .collect(Collectors.toList());
                        curatedItems.addAll(extras);
                        curatedItems.sort(Comparator.comparingLong((NewsItem i) -> i.timestamp).reversed());
                    }

                    String lexiconJson = analyzeLexicon(curatedItems);
                    String semanticJson = analyzeSemantic(curatedItems, decodedName);

                    String newsArrayJson = curatedItems.stream()
                        .map(item -> String.format("{\"title\":\"%s\", \"link\":\"%s\", \"publisher\":\"%s\", \"date\":\"%s\", \"description\":\"%s\"}",
                            escapeJson(item.title), escapeJson(item.link), escapeJson(item.publisher), escapeJson(item.date), escapeJson(item.description)))
                        .collect(Collectors.joining(","));

                    sendJsonResponse(exchange, 200, String.format("{\"news\": [%s], \"lexicon\": %s, \"semantic\": %s}", newsArrayJson, lexiconJson, semanticJson));
                } catch (Exception e) {
                    System.err.println("News handler error: " + e);
                    e.printStackTrace();
                    try { sendJsonResponse(exchange, 200, "{\"news\": [], \"lexicon\": null, \"semantic\": null}"); } catch (IOException ignored) {}
                }
            }).join();
        } catch (Exception e) {
            System.err.println("News handler outer error: " + e);
            e.printStackTrace();
            sendJsonResponse(exchange, 200, "{\"news\": [], \"lexicon\": null, \"semantic\": null}");
        }
    }

    private static class NewsItem {
        String title, link, publisher, date, description;
        long timestamp;
        NewsItem(String t, String l, String p, String d, String desc, long ts) {
            title = t; link = l; publisher = p; date = d; description = desc; timestamp = ts;
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
                int textIdx = text.indexOf("\"text\": \"");
                if (textIdx < 0) {
                    return "{\"recommendation\": \"ERROR\", \"summary\": \"AI response format unrecognized.\", \"isLocked\": false}";
                }
                int start = textIdx + 9;
                int end = text.indexOf("\"", start);
                if (end < 0) {
                    return "{\"recommendation\": \"ERROR\", \"summary\": \"AI response format unrecognized.\", \"isLocked\": false}";
                }
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

    private List<NewsItem> parseRssItems(String xml, String feedName, int limit) {
        List<NewsItem> items = new ArrayList<>();
        Pattern itemPattern = Pattern.compile("<item>(.*?)</item>", Pattern.DOTALL);
        Pattern titlePattern = Pattern.compile("<title>(.*?)</title>", Pattern.DOTALL);
        Pattern linkPattern  = Pattern.compile("<link>(.*?)</link>", Pattern.DOTALL);
        Pattern datePattern  = Pattern.compile("<pubDate>(.*?)</pubDate>", Pattern.DOTALL);
        Pattern descPattern  = Pattern.compile("<description>(.*?)</description>", Pattern.DOTALL);
        // Google News and Bing News emit <source url="...">Publisher Name</source> per item
        Pattern sourcePattern = Pattern.compile("<source[^>]*>(.*?)</source>", Pattern.DOTALL);

        Matcher itemMatcher = itemPattern.matcher(xml);
        int count = 0;
        while (itemMatcher.find() && count < limit) {
            String itemXml = itemMatcher.group(1);
            String title = extractTag(itemXml, titlePattern);
            String link  = extractTag(itemXml, linkPattern);
            String date  = extractTag(itemXml, datePattern);

            // Extract description, strip HTML tags, and trim to a readable length
            String rawDesc = extractTag(itemXml, descPattern);
            String description = rawDesc.replaceAll("<[^>]+>", "").replaceAll("\\s+", " ").trim();
            if (description.length() > 280) {
                description = description.substring(0, 277) + "...";
            }

            // Resolve real publisher so isTrusted() can match against actual outlet names:
            // 1. Prefer <source> tag (Google News, Bing News include this per item)
            // 2. Fall back to "Title - Publisher" tail pattern (common in both feeds)
            // 3. Use the feed name as last resort
            String publisher = extractTag(itemXml, sourcePattern);
            if (publisher.isEmpty()) {
                int dashIdx = title.lastIndexOf(" - ");
                if (dashIdx > 20) { // guard: title part must be meaningful length
                    publisher = title.substring(dashIdx + 3).trim();
                    title     = title.substring(0, dashIdx).trim();
                } else {
                    publisher = feedName;
                }
            }

            long ts = 0;
            try {
                if (!date.isEmpty()) {
                    ts = ZonedDateTime.parse(date, RSS_DATE_FORMATTER).toInstant().toEpochMilli();
                }
            } catch (Exception e) {
                ts = System.currentTimeMillis() - (count * 1000);
            }

            items.add(new NewsItem(title, link, publisher, date, description, ts));
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

    // -------------------------------------------------------------------------
    // Mutual Fund handlers
    // -------------------------------------------------------------------------

    private void handleMF(HttpExchange exchange, String path) throws IOException {
        String sub = path.substring("/api/mf".length()).replaceAll("/$", "");
        String query = exchange.getRequestURI().getQuery();
        if ("/category".equals(sub))  { handleMFCategory(exchange, query); }
        else if ("/houses".equals(sub))    { handleMFHouses(exchange); }
        else if ("/house".equals(sub))     { handleMFHouse(exchange, query); }
        else if ("/chart".equals(sub))     { handleMFChart(exchange, query); }
        else { exchange.sendResponseHeaders(404, -1); }
    }

    /**
     * Returns top-10 Direct-Growth schemes for a category, sorted by AMC priority.
     * Searches per AMC in parallel using /mf/search (reliable), then fetches /latest NAV.
     */
    private void handleMFCategory(HttpExchange exchange, String queryStr) throws IOException {
        String cat = "";
        if (queryStr != null) {
            for (String p : queryStr.split("&")) {
                String[] kv = p.split("=", 2);
                if (kv.length == 2 && "cat".equals(kv[0])) cat = kv[1].toLowerCase();
            }
        }
        String keyword = MF_CATEGORY_KEYWORDS.get(cat);
        if (keyword == null) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Unknown category: " + escapeJson(cat) + "\"}");
            return;
        }
        List<String> priority = MF_AMC_PRIORITY.getOrDefault(cat, Collections.emptyList());
        try {
            // Search per AMC in parallel: "<AMC> <category keyword>" → pick first Direct Growth result
            final String kw = keyword;
            List<CompletableFuture<Optional<Integer>>> searchFutures = priority.stream()
                .map(amc -> CompletableFuture.supplyAsync(() -> {
                    try {
                        List<JsonObject> hits = mfApiClient.searchSchemes(amc + " " + kw);
                        return hits.stream()
                            .filter(s -> {
                                String n = s.get("schemeName").getAsString().toLowerCase();
                                return n.contains("direct") && n.contains("growth");
                            })
                            .findFirst()
                            .map(s -> s.get("schemeCode").getAsInt());
                    } catch (Exception e) {
                        System.err.println("MF search error for " + amc + ": " + e.getMessage());
                        return Optional.<Integer>empty();
                    }
                }))
                .collect(Collectors.toList());

            CompletableFuture.allOf(searchFutures.toArray(new CompletableFuture[0])).join();

            // Collect codes in AMC priority order, up to 10
            List<Integer> codes = new ArrayList<>();
            for (CompletableFuture<Optional<Integer>> f : searchFutures) {
                if (codes.size() >= 10) break;
                f.join().ifPresent(codes::add);
            }

            if (codes.isEmpty()) {
                sendJsonResponse(exchange, 200, "[]");
                return;
            }
            List<MutualFundData> results = fetchSchemeDataConcurrently(codes);
            Map<Integer, MutualFundData> byCode = new java.util.HashMap<>();
            results.forEach(mf -> byCode.put(mf.getSchemeCode(), mf));
            List<MutualFundData> ordered = codes.stream()
                .filter(byCode::containsKey).map(byCode::get).collect(Collectors.toList());

            sendJsonResponse(exchange, 200, gson.toJson(ordered));
        } catch (Exception e) {
            System.err.println("MF category error: " + e.getMessage());
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    /** Returns the hardcoded list of known AMC names (no API call needed). */
    private void handleMFHouses(HttpExchange exchange) throws IOException {
        sendJsonResponse(exchange, 200, gson.toJson(KNOWN_AMCS));
    }

    /** Returns up to 15 Direct-Growth schemes for a given AMC with latest NAVs. */
    private void handleMFHouse(HttpExchange exchange, String queryStr) throws IOException {
        String amc = "";
        if (queryStr != null) {
            for (String p : queryStr.split("&")) {
                String[] kv = p.split("=", 2);
                if (kv.length == 2 && "amc".equals(kv[0])) {
                    amc = java.net.URLDecoder.decode(kv[1], java.nio.charset.StandardCharsets.UTF_8);
                }
            }
        }
        if (amc.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing amc parameter\"}");
            return;
        }
        try {
            // Append "direct growth" so the search API returns only relevant Direct Plan schemes
            List<JsonObject> hits = mfApiClient.searchSchemes(amc + " direct growth");
            List<Integer> codes = hits.stream()
                .filter(s -> {
                    String n = s.get("schemeName").getAsString().toLowerCase();
                    return n.contains("direct") && n.contains("growth");
                })
                .limit(15)
                .map(s -> s.get("schemeCode").getAsInt())
                .collect(Collectors.toList());

            if (codes.isEmpty()) {
                sendJsonResponse(exchange, 200, "[]");
                return;
            }
            List<MutualFundData> results = fetchSchemeDataConcurrently(codes);
            results.sort(Comparator.comparing(MutualFundData::getSchemeName));
            sendJsonResponse(exchange, 200, gson.toJson(results));
        } catch (Exception e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    /**
     * Returns raw NAV history for a scheme as {dates: [...], navs: [...]}, newest-first.
     * Reuses the same cached history that getSchemeData() already populated.
     */
    private void handleMFChart(HttpExchange exchange, String queryStr) throws IOException {
        int code = 0;
        if (queryStr != null) {
            for (String p : queryStr.split("&")) {
                String[] kv = p.split("=", 2);
                if (kv.length == 2 && "code".equals(kv[0])) {
                    try { code = Integer.parseInt(kv[1]); } catch (NumberFormatException ignored) {}
                }
            }
        }
        if (code == 0) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing or invalid code parameter\"}");
            return;
        }
        try {
            MFApiClient.NavHistory hist = mfApiClient.getNavHistory(code);
            StringBuilder sb = new StringBuilder("{\"dates\":[");
            for (int i = 0; i < hist.dates.length; i++) {
                if (i > 0) sb.append(',');
                sb.append('"').append(hist.dates[i]).append('"');
            }
            sb.append("],\"navs\":[");
            for (int i = 0; i < hist.navs.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(hist.navs[i]);
            }
            sb.append("]}");
            sendJsonResponse(exchange, 200, sb.toString());
        } catch (Exception e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private List<MutualFundData> fetchSchemeDataConcurrently(List<Integer> codes) {
        List<MutualFundData> results = Collections.synchronizedList(new ArrayList<>());
        List<CompletableFuture<Void>> futures = codes.stream()
            .map(code -> CompletableFuture.runAsync(() -> {
                try {
                    results.add(mfApiClient.getSchemeData(code));
                } catch (Exception e) {
                    System.err.println("MF data error for " + code + ": " + e.getMessage());
                }
            }))
            .collect(Collectors.toList());
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        return results;
    }

    private void handleLiveStream(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String channelId = null;
        if (query != null) {
            for (String param : query.split("&")) {
                String[] pair = param.split("=", 2);
                if (pair.length == 2 && "channelId".equals(pair[0])) {
                    channelId = pair[1];
                }
            }
        }
        if (channelId == null || channelId.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing channelId parameter\"}");
            return;
        }

        String apiKey = System.getenv("YOUTUBE_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            sendJsonResponse(exchange, 503, "{\"error\": \"YOUTUBE_API_KEY not configured\"}");
            return;
        }

        long now = System.currentTimeMillis();
        if (liveStreamCache.containsKey(channelId) &&
                (now - liveStreamCacheTimestamps.getOrDefault(channelId, 0L)) < LIVE_STREAM_CACHE_MS) {
            sendJsonResponse(exchange, 200, "{\"videoId\": \"" + escapeJson(liveStreamCache.get(channelId)) + "\"}");
            return;
        }

        try {
            String url = "https://www.googleapis.com/youtube/v3/search"
                    + "?part=id"
                    + "&channelId=" + channelId
                    + "&eventType=live"
                    + "&type=video"
                    + "&maxResults=1"
                    + "&key=" + apiKey;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .build();

            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                sendJsonResponse(exchange, response.statusCode(), "{\"error\": \"YouTube API error\"}");
                return;
            }

            JsonObject json = gson.fromJson(response.body(), JsonObject.class);
            if (!json.has("items") || json.getAsJsonArray("items").size() == 0) {
                sendJsonResponse(exchange, 404, "{\"error\": \"No live stream found\"}");
                return;
            }

            String videoId = json.getAsJsonArray("items")
                    .get(0).getAsJsonObject()
                    .getAsJsonObject("id")
                    .get("videoId").getAsString();

            liveStreamCache.put(channelId, videoId);
            liveStreamCacheTimestamps.put(channelId, now);

            sendJsonResponse(exchange, 200, "{\"videoId\": \"" + escapeJson(videoId) + "\"}");
        } catch (Exception e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"" + escapeJson(e.getMessage()) + "\"}");
        }
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
