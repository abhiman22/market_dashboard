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
import java.util.*;
import java.util.concurrent.CompletableFuture;

public class ApiHandler implements HttpHandler {
    private final StockAPIClient apiClient;
    private final Gson gson;
    private final HttpClient httpClient;

    public ApiHandler() {
        this.apiClient = new StockAPIClient();
        this.gson = new Gson();
        this.httpClient = HttpClient.newHttpClient();
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
        } else if ("/api/search".equals(path)) {
            handleSearch(exchange);
        } else {
            exchange.sendResponseHeaders(404, -1);
        }
    }

    private void handleQuotes(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || !query.startsWith("symbols=")) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing symbols parameter\"}");
            return;
        }
        
        String symbolsParam = query.substring("symbols=".length());
        String[] symbols = symbolsParam.split(",");
        
        List<StockQuote> quotes = Collections.synchronizedList(new ArrayList<>());
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (String symbol : symbols) {
            String trimmed = symbol.trim();
            if (trimmed.isEmpty()) continue;
            
            CompletableFuture<Void> future = CompletableFuture.supplyAsync(() -> {
                try {
                    return apiClient.getQuote(trimmed);
                } catch (Exception e) {
                    System.err.println("API Error " + trimmed + ": " + e.getMessage());
                    return new StockQuote(trimmed, "Fallback", 0.0, 0.0, 0.0, 0.0, 0.0);
                }
            }).thenAccept(quote -> {
                quotes.add(quote);
            });
            futures.add(future);
        }
        
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        } catch (Exception e) {
            e.printStackTrace();
        }

        sendJsonResponse(exchange, 200, gson.toJson(quotes));
    }

    private void handleSearch(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || !query.startsWith("q=")) {
            sendJsonResponse(exchange, 400, "{\"error\": \"Missing q parameter\"}");
            return;
        }
        
        String q = query.substring("q=".length());
        String encodedQ = java.net.URLEncoder.encode(q, StandardCharsets.UTF_8);
        String url = "https://query2.finance.yahoo.com/v1/finance/search?q=" + encodedQ + "&quotesCount=8&newsCount=0";
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .GET()
                .build();
        
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            sendJsonResponse(exchange, 200, response.body());
        } catch (InterruptedException e) {
            sendJsonResponse(exchange, 500, "{\"error\": \"Search interrupted\"}");
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
