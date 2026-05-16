import javax.crypto.*;
import javax.crypto.spec.*;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.*;
import java.security.spec.*;
import java.util.*;

/**
 * Sends Web Push notifications using VAPID authentication (RFC 8292)
 * and aes128gcm message encryption (RFC 8291).
 *
 * No extra JARs required — uses only standard Java 11 crypto.
 *
 * Setup:
 *   1. On first run without env vars, VAPID key pair is printed to stdout.
 *   2. Set VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY in Render environment.
 */
public class WebPushSender {

    private static volatile ECPrivateKey vapidPrivateKey;
    private static volatile String       vapidPublicKeyB64;

    private static final java.net.http.HttpClient HTTP = java.net.http.HttpClient.newHttpClient();

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    /** Call once at startup with values from environment variables. */
    public static void init(String privKeyB64, String pubKeyB64) throws Exception {
        vapidPublicKeyB64 = pubKeyB64;

        AlgorithmParameters ecParams = AlgorithmParameters.getInstance("EC");
        ecParams.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecSpec = ecParams.getParameterSpec(ECParameterSpec.class);

        byte[] privBytes = Base64.getUrlDecoder().decode(pad(privKeyB64));
        BigInteger s = new BigInteger(1, privBytes);
        vapidPrivateKey = (ECPrivateKey) KeyFactory.getInstance("EC")
                .generatePrivate(new ECPrivateKeySpec(s, ecSpec));

        System.out.println("VAPID keys loaded — push notifications enabled.");
    }

    /** Generates a fresh VAPID key pair and returns the env-var lines to copy into Render. */
    public static String generateKeys() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair kp = kpg.generateKeyPair();
        ECPrivateKey priv = (ECPrivateKey) kp.getPrivate();
        ECPublicKey  pub  = (ECPublicKey)  kp.getPublic();

        String privB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(toBytes32(priv.getS()));
        String pubB64  = Base64.getUrlEncoder().withoutPadding().encodeToString(encodePoint(pub.getW()));
        return "VAPID_PRIVATE_KEY=" + privB64 + "\nVAPID_PUBLIC_KEY=" + pubB64;
    }

    public static String  getPublicKeyB64() { return vapidPublicKeyB64; }
    public static boolean isConfigured()    { return vapidPrivateKey != null; }

    // -------------------------------------------------------------------------
    // Sending
    // -------------------------------------------------------------------------

    /**
     * Encrypts and delivers a push message to a single subscription.
     * Silently removes the subscription if the push service reports it as expired.
     */
    public static void send(String endpoint, String p256dhB64, String authB64, String title, String body) {
        if (vapidPrivateKey == null) {
            System.err.println("[push] VAPID keys not configured — skipping notification.");
            return;
        }
        try {
            byte[] recipientPub = Base64.getUrlDecoder().decode(pad(p256dhB64));
            byte[] authSecret   = Base64.getUrlDecoder().decode(pad(authB64));

            String payload = "{\"title\":\"" + esc(title) + "\",\"body\":\"" + esc(body)
                    + "\",\"icon\":\"/icon-192.png\",\"badge\":\"/icon-192.png\"}";
            byte[] encrypted = encrypt(payload.getBytes(StandardCharsets.UTF_8), recipientPub, authSecret);

            String audience = URI.create(endpoint).getScheme() + "://" + URI.create(endpoint).getHost();
            String jwt      = buildVapidJwt(audience);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/octet-stream")
                    .header("Content-Encoding", "aes128gcm")
                    .header("Authorization", "vapid t=" + jwt + ",k=" + vapidPublicKeyB64)
                    .header("TTL", "86400")
                    .header("Urgency", "high")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(encrypted))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            int status = resp.statusCode();
            if (status == 410 || status == 404) {
                PushSubscriptionStore.getInstance().remove(endpoint);
                System.out.println("[push] Removed expired subscription.");
            } else if (status >= 400) {
                System.err.println("[push] Delivery failed: HTTP " + status);
            }
        } catch (Exception e) {
            System.err.println("[push] Send error: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Encryption — RFC 8291 aes128gcm
    // -------------------------------------------------------------------------

    private static byte[] encrypt(byte[] plaintext, byte[] recipientPubBytes, byte[] authSecret) throws Exception {
        // Generate ephemeral sender key pair
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair senderKP = kpg.generateKeyPair();
        byte[]       senderPubBytes = encodePoint(((ECPublicKey) senderKP.getPublic()).getW());

        // Decode recipient public key
        AlgorithmParameters ecParams = AlgorithmParameters.getInstance("EC");
        ecParams.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec ecSpec = ecParams.getParameterSpec(ECParameterSpec.class);
        ECPoint W = new ECPoint(
                new BigInteger(1, Arrays.copyOfRange(recipientPubBytes, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(recipientPubBytes, 33, 65)));
        ECPublicKey recipientPub = (ECPublicKey) KeyFactory.getInstance("EC")
                .generatePublic(new ECPublicKeySpec(W, ecSpec));

        // ECDH shared secret (x-coordinate only)
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(senderKP.getPrivate());
        ka.doPhase(recipientPub, true);
        byte[] ecdhSecret = padLeft32(ka.generateSecret());

        // HKDF: derive IKM using auth secret
        byte[] prkKey = hkdfExtract(authSecret, ecdhSecret);
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII),
                recipientPubBytes, senderPubBytes);
        byte[] ikm = hkdfExpand(prkKey, keyInfo, 32);

        // HKDF: derive CEK + nonce using random salt
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        byte[] prk   = hkdfExtract(salt, ikm);
        byte[] cek   = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

        // AES-128-GCM encrypt (append 0x02 padding delimiter — last-record marker)
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[]{0x02}));

        // RFC 8291 header: salt(16) + rs(4) + idlen(1) + senderPub(65) + ciphertext
        ByteBuffer buf = ByteBuffer.allocate(16 + 4 + 1 + senderPubBytes.length + ciphertext.length);
        buf.put(salt);
        buf.putInt(4096);                          // record size
        buf.put((byte) senderPubBytes.length);     // idlen = 65
        buf.put(senderPubBytes);
        buf.put(ciphertext);
        return buf.array();
    }

    // -------------------------------------------------------------------------
    // VAPID JWT — RFC 8292
    // -------------------------------------------------------------------------

    private static String buildVapidJwt(String audience) throws Exception {
        long exp = System.currentTimeMillis() / 1000 + 43200; // 12 hours
        String header  = b64("{\"typ\":\"JWT\",\"alg\":\"ES256\"}");
        String payload = b64("{\"aud\":\"" + audience + "\",\"exp\":" + exp
                + ",\"sub\":\"mailto:push@market-insights.app\"}");
        String input   = header + "." + payload;

        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(vapidPrivateKey);
        sig.update(input.getBytes(StandardCharsets.UTF_8));
        byte[] raw = derToRaw(sig.sign());
        return input + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    /** Converts Java's DER-encoded ECDSA signature to raw R||S (64 bytes). */
    private static byte[] derToRaw(byte[] der) {
        int idx = 2; // skip 0x30 and total-length byte
        // r
        int rLen = der[idx + 1] & 0xff;
        byte[] r = Arrays.copyOfRange(der, idx + 2, idx + 2 + rLen);
        idx += 2 + rLen;
        // s
        int sLen = der[idx + 1] & 0xff;
        byte[] s = Arrays.copyOfRange(der, idx + 2, idx + 2 + sLen);

        byte[] raw = new byte[64];
        byte[] rn = stripLeadingZero(r), sn = stripLeadingZero(s);
        System.arraycopy(rn, 0, raw, 32 - rn.length, rn.length);
        System.arraycopy(sn, 0, raw, 64 - sn.length, sn.length);
        return raw;
    }

    private static byte[] stripLeadingZero(byte[] b) {
        if (b.length == 33 && b[0] == 0) return Arrays.copyOfRange(b, 1, 33);
        return b;
    }

    // -------------------------------------------------------------------------
    // HKDF helpers (RFC 5869, SHA-256)
    // -------------------------------------------------------------------------

    private static byte[] hkdfExtract(byte[] salt, byte[] ikm) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        return mac.doFinal(ikm);
    }

    private static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 0x01);
        return Arrays.copyOf(mac.doFinal(), length);
    }

    // -------------------------------------------------------------------------
    // EC / byte utilities
    // -------------------------------------------------------------------------

    /** Encodes an EC point as an uncompressed 65-byte array (0x04 | x | y). */
    private static byte[] encodePoint(ECPoint p) {
        byte[] result = new byte[65];
        result[0] = 0x04;
        byte[] x = toBytes32(p.getAffineX()), y = toBytes32(p.getAffineY());
        System.arraycopy(x, 0, result,  1, 32);
        System.arraycopy(y, 0, result, 33, 32);
        return result;
    }

    /** Converts a BigInteger to a 32-byte big-endian array, stripping or padding as needed. */
    private static byte[] toBytes32(BigInteger n) {
        byte[] raw = n.toByteArray();
        if (raw.length == 32) return raw;
        if (raw.length == 33 && raw[0] == 0) return Arrays.copyOfRange(raw, 1, 33);
        byte[] out = new byte[32];
        System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        return out;
    }

    /** Ensures ECDH output is exactly 32 bytes (left-pad with zeros if short). */
    private static byte[] padLeft32(byte[] b) {
        if (b.length == 32) return b;
        byte[] out = new byte[32];
        System.arraycopy(b, 0, out, 32 - b.length, b.length);
        return out;
    }

    private static byte[] concat(byte[]... arrays) {
        int len = 0;
        for (byte[] a : arrays) len += a.length;
        byte[] out = new byte[len];
        int pos = 0;
        for (byte[] a : arrays) { System.arraycopy(a, 0, out, pos, a.length); pos += a.length; }
        return out;
    }

    private static String b64(String s) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    private static String pad(String s) {
        switch (s.length() % 4) {
            case 2: return s + "==";
            case 3: return s + "=";
            default: return s;
        }
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }
}
