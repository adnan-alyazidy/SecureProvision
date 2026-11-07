package com.example.demo.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Handles chat messages sent from the SecureProvision frontend, along
 * with the current network topology snapshot the user was working on
 * when they sent the message.
 *
 * The user's message and the topology are combined into a single text
 * prompt and forwarded to Google's Gemini API (generateContent endpoint,
 * e.g. gemini-1.5-flash).
 *
 * Conversation memory: this controller keeps an in-memory chatHistory
 * list, formatted the way Gemini expects ("contents"), and sends the
 * FULL history on every request so Gemini has the context of prior
 * turns. This is a single global conversation for simplicity — it is
 * NOT scoped per user/session, so all clients share one memory. For a
 * real multi-user deployment, key this by session ID instead.
 *
 * NOTE: this deliberately avoids com.fasterxml.jackson.databind
 * (ObjectMapper / JsonNode). Both the request body and the parsed
 * response are handled as plain java.util.Map / List instead, using
 * RestTemplate's built-in Map conversion.
 */
@RestController
@RequestMapping("/api/chat")
@CrossOrigin(origins = {"http://127.0.0.1:5500", "http://localhost:5500"})
public class NetworkChatController {

    private static final Logger log = LoggerFactory.getLogger(NetworkChatController.class);

    private final RestTemplate restTemplate = new RestTemplate();

    // Shared conversation memory, sent in full with every Gemini request.
    // synchronizedList since Spring may serve requests concurrently.
    private final List<Map<String, Object>> chatHistory =
            Collections.synchronizedList(new ArrayList<>());

    // Configure these in application.properties (or an environment-backed
    // properties source — never commit a real key to source control):
    //   gemini.api.url=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
    //   gemini.api.key=AIza...
    @Value("${gemini.api.url}")
    private String apiUrl;

    @Value("${gemini.api.key}")
    private String apiKey;

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE,
                 produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ChatResponse> handleChat(@RequestBody ChatRequest request) {

        log.info("Received chat message: {}", request.getMessage());
        log.info("Topology snapshot - {} device(s), {} connection(s)",
                request.getDeviceCount(), request.getConnectionCount());

        if (request.getDevices() != null) {
            for (Device device : request.getDevices()) {
                log.info("  Device -> {}", device);
            }
        }

        if (request.getConnections() != null) {
            for (Connection connection : request.getConnections()) {
                log.info("  Connection -> {}", connection);
            }
        }

        String prompt = buildPrompt(request);
        log.debug("Constructed LLM prompt:\n{}", prompt);

        // Append this turn to the shared conversation history in Gemini's
        // expected shape before calling the API, so the API call itself
        // always sends the complete history including the new message.
        chatHistory.add(buildTurn("user", prompt));

        // callLlmApi() handles all of its own error cases internally
        // (including the 503 "high traffic" case below) and always
        // returns a usable reply string, so no try/catch is needed here.
        String replyText = callLlmApi();
        chatHistory.add(buildTurn("model", replyText));

        return ResponseEntity.ok(new ChatResponse(replyText));
    }

    /**
     * Clears the in-memory conversation history — call this whenever the
     * user starts a fresh project on the frontend so Gemini stops
     * referencing a topology/chat that no longer exists.
     */
    @GetMapping("/reset")
    public ResponseEntity<Map<String, Object>> resetChat() {
        chatHistory.clear();
        log.info("Chat history cleared.");

        Map<String, Object> result = new HashMap<>();
        result.put("status", "success");
        result.put("message", "Chat history cleared.");
        return ResponseEntity.ok(result);
    }

    /**
     * Builds a single Gemini "content" turn:
     * { "role": "user" | "model", "parts": [ { "text": "..." } ] }
     */
    private Map<String, Object> buildTurn(String role, String text) {
        Map<String, Object> part = new HashMap<>();
        part.put("text", text);

        Map<String, Object> turn = new HashMap<>();
        turn.put("role", role);
        turn.put("parts", List.of(part));
        return turn;
    }

    /**
     * Combines the user's message with a clear, readable summary of the
     * current topology (devices and connections) into a single prompt
     * suitable for sending to an LLM. Each connection now includes both
     * ends' port/interface names so Gemini has full cabling context.
     */
    private String buildPrompt(ChatRequest request) {
        StringBuilder sb = new StringBuilder();

        sb.append("You are a network security and provisioning assistant. ")
          .append("A user is working on a network topology diagram and just sent you a message. ")
          .append("Use the topology summary below as context for your answer.\n\n");

        sb.append("User message: ").append(request.getMessage()).append("\n\n");

        sb.append("Current network topology summary:\n");
        sb.append("- Total devices: ").append(request.getDeviceCount()).append("\n");
        sb.append("- Total connections: ").append(request.getConnectionCount()).append("\n\n");

        List<Device> devices = request.getDevices();
        sb.append("Devices:\n");
        if (devices != null && !devices.isEmpty()) {
            for (Device d : devices) {
                sb.append(String.format("  - [ID %s] %s (Type: %s)%n",
                        d.getId(), d.getLabel(), d.getDeviceType()));
            }
        } else {
            sb.append("  (none)\n");
        }

        List<Connection> connections = request.getConnections();
        sb.append("\nConnections:\n");
        if (connections != null && !connections.isEmpty()) {
            for (Connection c : connections) {
                String fromLabel = findLabelById(devices, c.getFrom());
                String toLabel = findLabelById(devices, c.getTo());
                String fromPort = portOrUnassigned(c.getFromPort());
                String toPort = portOrUnassigned(c.getToPort());
                sb.append(String.format(
                        "  - Connection -> Connection{from='%s' (port: %s), to='%s' (port: %s)}%n",
                        fromLabel, fromPort, toLabel, toPort));
            }
        } else {
            sb.append("  (none)\n");
        }

        return sb.toString();
    }

    private String portOrUnassigned(String port) {
        return (port != null && !port.isBlank()) ? port : "unassigned";
    }

    private String findLabelById(List<Device> devices, Long id) {
        if (devices == null || id == null) {
            return "Unknown device";
        }
        for (Device d : devices) {
            if (id.equals(d.getId())) {
                return d.getLabel();
            }
        }
        return "Unknown device";
    }

    /**
     * Sends the full chatHistory (not just the latest prompt) to the
     * Gemini API and returns the extracted reply text. Handles its own
     * errors internally so callers always get back a usable string —
     * a 503 from Gemini gets a specific, user-friendly "high traffic"
     * message; any other failure gets a generic fallback.
     */
    private String callLlmApi() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        // Gemini expects the API key in this header, not as a Bearer token.
        headers.set("x-goog-api-key", apiKey);

        Map<String, Object> requestBody = buildRequestBody();
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            // postForObject with Map.class lets RestTemplate's default
            // Jackson HttpMessageConverter deserialize the JSON response
            // straight into nested Map/List objects — no manual
            // ObjectMapper/JsonNode needed.
            Map<String, Object> response = restTemplate.postForObject(apiUrl, entity, Map.class);
            return extractReplyText(response);
        } catch (HttpServerErrorException e) {
            if (e.getStatusCode().value() == 503) {
                log.warn("Gemini API returned 503 Service Unavailable (high traffic): {}", e.getMessage());
                return "The AI servers are currently experiencing high traffic. Please wait a moment and try again.";
            }
            log.error("Gemini API returned a server error: {}", e.getStatusCode(), e);
            return "Sorry, the AI service returned an error (" + e.getStatusCode().value() + "). Please try again.";
        } catch (Exception e) {
            log.error("Failed to get a response from the Gemini API", e);
            return "Sorry, I couldn't reach the AI service right now. Please try again shortly.";
        }
    }

    /**
     * Builds Gemini's generateContent request body using the ENTIRE
     * conversation history as "contents", so Gemini has full context:
     * { "contents": [ { "role": "...", "parts": [ { "text": "..." } ] }, ... ] }
     */
    private Map<String, Object> buildRequestBody() {
        Map<String, Object> body = new HashMap<>();
        // Snapshot the list so it isn't mutated mid-serialization by
        // another concurrent request.
        body.put("contents", new ArrayList<>(chatHistory));
        return body;
    }

    /**
     * Parses Gemini's generateContent response — already deserialized
     * into nested Map/List by RestTemplate — and pulls out the reply text:
     * { "candidates": [ { "content": { "parts": [ { "text": "..." } ] } } ] }
     */
    @SuppressWarnings("unchecked")
    private String extractReplyText(Map<String, Object> response) {
        try {
            if (response == null) {
                return "The AI service returned no response body.";
            }

            List<Object> candidates = (List<Object>) response.get("candidates");
            if (candidates == null || candidates.isEmpty()) {
                return "The AI service returned no candidates.";
            }

            Map<String, Object> firstCandidate = (Map<String, Object>) candidates.get(0);
            Map<String, Object> content = (Map<String, Object>) firstCandidate.get("content");
            if (content == null) {
                return "The AI service response was missing content.";
            }

            List<Object> parts = (List<Object>) content.get("parts");
            if (parts == null || parts.isEmpty()) {
                return "The AI service response was missing parts.";
            }

            Map<String, Object> firstPart = (Map<String, Object>) parts.get(0);
            Object text = firstPart.get("text");
            if (text == null || text.toString().isBlank()) {
                return "The AI service returned an empty response.";
            }

            return text.toString();
        } catch (ClassCastException e) {
            log.error("Unexpected response shape from Gemini API: {}", response, e);
            return "Sorry, I received an unexpected response format from the AI service.";
        }
    }
}
