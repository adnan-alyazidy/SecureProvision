package com.example.demo.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * Handles account creation, email verification, and login for the
 * SecureProvision frontend's sidebar auth forms. Entirely separate
 * from NetworkChatController — does not touch it or its routes.
 *
 * All three endpoints accept a simple Map<String, String> body and
 * return { "status": "success" | "error", "message": "..." } (plus
 * "username"/"role" on a successful login), so they're easy to wire
 * up directly from fetch() without needing extra request DTOs.
 */
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signup(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.signUp(
                    request.get("username"),
                    request.get("email"),
                    request.get("password")
            );
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.verifyCode(
                    request.get("email"),
                    request.get("code")
            );
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            User user = authService.login(
                    request.get("username"),
                    request.get("password")
            );
            response.put("status", "success");
            response.put("message", "Login successful.");
            response.put("username", user.getUsername());
            response.put("role", user.getRole().name());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
        }
    }

    @PostMapping("/grant-developer")
    public ResponseEntity<Map<String, Object>> grantDeveloper(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.grantDeveloperRole(
                    request.get("ownerUsername"),
                    request.get("targetUsername")
            );
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(response);
        }
    }

    @PostMapping("/revoke-developer")
    public ResponseEntity<Map<String, Object>> revokeDeveloper(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.revokeDeveloperRole(
                    request.get("ownerUsername"),
                    request.get("targetUsername")
            );
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(response);
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, Object>> forgotPassword(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.sendPasswordResetCode(request.get("username"));
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String message = authService.resetPassword(
                    request.get("email"),
                    request.get("code"),
                    request.get("newPassword")
            );
            response.put("status", "success");
            response.put("message", message);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @org.springframework.web.bind.annotation.GetMapping("/users")
    public ResponseEntity<Map<String, Object>> getAllUsers(@org.springframework.web.bind.annotation.RequestHeader("X-User-Username") String requester) {
        Map<String, Object> response = new HashMap<>();
        try {
            response.put("status", "success");
            response.put("users", authService.getAllUsers(requester));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(response);
        }
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/users/{targetUsername}")
    public ResponseEntity<Map<String, Object>> deleteUserAccount(
            @org.springframework.web.bind.annotation.RequestHeader("X-User-Username") String requester,
            @org.springframework.web.bind.annotation.PathVariable String targetUsername) {
        Map<String, Object> response = new HashMap<>();
        try {
            response.put("status", "success");
            response.put("message", authService.deleteUserAccount(requester, targetUsername));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(response);
        }
    }

}