import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;

public class App {
    public static void main(String[] args) throws Exception {
        String envPort = System.getenv("PORT");
        int port = envPort != null ? Integer.parseInt(envPort) : 8080;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        
        // Serve frontend files
        server.createContext("/", new StaticFileHandler());
        
        // API Endpoints
        StockAPIClient apiClient = new StockAPIClient();
        MFApiClient mfApiClient = new MFApiClient();
        server.createContext("/api/cas", new CASHandler());
        server.createContext("/api/market-context", new MarketContextHandler());
        server.createContext("/api/", new ApiHandler(apiClient, mfApiClient));

        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        System.out.println("Web Server started on http://localhost:" + port);
    }
}
