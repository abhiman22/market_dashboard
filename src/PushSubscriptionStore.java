import com.google.gson.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Thread-safe store for Web Push subscriptions.
 * Persists to data/subscriptions.json.
 *
 * Note: Render's free tier has an ephemeral filesystem — subscriptions survive
 * server restarts but are lost on re-deploys. Add a Render Persistent Disk
 * (mounted at /data) and set DATA_DIR=/data to persist across deploys.
 */
public class PushSubscriptionStore {

    public static class Subscription {
        public final String endpoint;
        public final String p256dh;
        public final String auth;

        public Subscription(String endpoint, String p256dh, String auth) {
            this.endpoint = endpoint;
            this.p256dh   = p256dh;
            this.auth     = auth;
        }
    }

    private static final String DATA_DIR  = System.getenv("DATA_DIR") != null ? System.getenv("DATA_DIR") : "data";
    private static final String FILE_PATH = DATA_DIR + "/subscriptions.json";
    private static final Gson   gson      = new Gson();

    private static final PushSubscriptionStore INSTANCE = new PushSubscriptionStore();
    public  static PushSubscriptionStore getInstance() { return INSTANCE; }

    private final List<Subscription> subs = new CopyOnWriteArrayList<>();

    private PushSubscriptionStore() {
        new File(DATA_DIR).mkdirs();
        load();
    }

    public void add(String endpoint, String p256dh, String auth) {
        subs.removeIf(s -> s.endpoint.equals(endpoint)); // replace if already present
        subs.add(new Subscription(endpoint, p256dh, auth));
        save();
        System.out.println("[push] Subscribed. Total subscribers: " + subs.size());
    }

    public void remove(String endpoint) {
        subs.removeIf(s -> s.endpoint.equals(endpoint));
        save();
        System.out.println("[push] Unsubscribed. Total subscribers: " + subs.size());
    }

    public List<Subscription> getAll() {
        return Collections.unmodifiableList(new ArrayList<>(subs));
    }

    /** Sends the same notification to every stored subscription. */
    public void broadcast(String title, String body) {
        List<Subscription> all = getAll();
        if (all.isEmpty()) return;
        System.out.println("[push] Broadcasting to " + all.size() + " subscriber(s): " + title);
        for (Subscription s : all) {
            WebPushSender.send(s.endpoint, s.p256dh, s.auth, title, body);
        }
    }

    private void load() {
        try {
            File f = new File(FILE_PATH);
            if (!f.exists()) return;
            String json = new String(Files.readAllBytes(f.toPath()));
            JsonArray arr = gson.fromJson(json, JsonArray.class);
            if (arr == null) return;
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                subs.add(new Subscription(
                        o.get("endpoint").getAsString(),
                        o.get("p256dh").getAsString(),
                        o.get("auth").getAsString()));
            }
            System.out.println("[push] Loaded " + subs.size() + " subscription(s).");
        } catch (Exception e) {
            System.err.println("[push] Could not load subscriptions: " + e.getMessage());
        }
    }

    private void save() {
        try {
            JsonArray arr = new JsonArray();
            for (Subscription s : subs) {
                JsonObject o = new JsonObject();
                o.addProperty("endpoint", s.endpoint);
                o.addProperty("p256dh",   s.p256dh);
                o.addProperty("auth",     s.auth);
                arr.add(o);
            }
            Files.write(Paths.get(FILE_PATH), gson.toJson(arr).getBytes());
        } catch (Exception e) {
            System.err.println("[push] Could not save subscriptions: " + e.getMessage());
        }
    }
}
