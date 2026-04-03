import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;

public class StaticFileHandler implements HttpHandler {
    private static final String WEB_ROOT = "web";

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/")) {
            path = "/index.html";
        }
        
        File file = new File(WEB_ROOT + path);
        
        if (file.exists() && !file.isDirectory()) {
            String contentType = "text/plain";
            if (path.endsWith(".html")) contentType = "text/html";
            else if (path.endsWith(".css")) contentType = "text/css";
            else if (path.endsWith(".js")) contentType = "application/javascript";
            else if (path.endsWith(".json")) contentType = "application/json";
            else if (path.endsWith(".svg"))  contentType = "image/svg+xml";
            else if (path.endsWith(".ico"))  contentType = "image/x-icon";
            else if (path.endsWith(".png"))  contentType = "image/png";

            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, file.length());
            
            try (OutputStream os = exchange.getResponseBody()) {
                Files.copy(file.toPath(), os);
            }
        } else {
            String response = "404 File not found";
            exchange.sendResponseHeaders(404, response.length());
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        }
    }
}
