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

        // Initialise Web Push (VAPID)
        String vapidPriv = System.getenv("VAPID_PRIVATE_KEY");
        String vapidPub  = System.getenv("VAPID_PUBLIC_KEY");
        if (vapidPriv != null && vapidPub != null) {
            try { WebPushSender.init(vapidPriv, vapidPub); }
            catch (Exception e) { System.err.println("Failed to load VAPID keys: " + e.getMessage()); }
        } else {
            try {
                System.out.println("=== VAPID keys not set. Copy these into Render environment variables: ===");
                System.out.println(WebPushSender.generateKeys());
                System.out.println("=== Push notifications disabled until env vars are configured. ===");
            } catch (Exception e) { System.err.println("Failed to generate VAPID keys: " + e.getMessage()); }
        }

        // Warm up subscription store
        PushSubscriptionStore.getInstance();

        // Start alert scheduler
        AlertScheduler alertScheduler = new AlertScheduler();
        alertScheduler.start();
        ApiHandler.setAlertScheduler(alertScheduler);

        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        System.out.println("Web Server started on http://localhost:" + port);
    }
}
