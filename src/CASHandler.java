import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * HTTP handler for CAS (Consolidated Account Statement) PDF upload and parsing.
 * Endpoint: POST /api/cas/upload
 * Body: JSON { "pdf": "<base64-encoded PDF>", "password": "<PDF password>" }
 */
public class CASHandler implements HttpHandler {
    private static final Gson gson = new Gson();

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonObject req = gson.fromJson(body, JsonObject.class);

            if (!req.has("pdf") || req.get("pdf").getAsString().isEmpty()) {
                sendJson(exchange, 400, "{\"error\":\"No PDF data provided\"}");
                return;
            }

            byte[] pdfBytes;
            try {
                pdfBytes = Base64.getDecoder().decode(req.get("pdf").getAsString());
            } catch (IllegalArgumentException e) {
                sendJson(exchange, 400, "{\"error\":\"Invalid PDF encoding\"}");
                return;
            }

            String password = req.has("password") ? req.get("password").getAsString() : "";

            String result = CASParser.parse(pdfBytes, password);
            sendJson(exchange, 200, result);

        } catch (Exception e) {
            sendJson(exchange, 500, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "Unknown error";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
