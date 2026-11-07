package com.example.demo.projects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Per-user project persistence. Every query is filtered by the
 * X-User-Username header, so a user can only ever list, load, overwrite
 * or delete their own projects. (Same header-trust model as the rest of
 * the app — see AuthHeaderInterceptor.)
 *
 * POST /api/projects            body {name, data, overwrite?}
 *      -> 201 saved | 409 {error:"exists", id} when the name is taken
 *         and overwrite is not true
 * GET  /api/projects            -> [{id, name, createdAt, updatedAt}]
 * GET  /api/projects/{id}       -> {id, name, createdAt, updatedAt, data}
 * DELETE /api/projects/{id}     -> 200
 */
@RestController
@RequestMapping("/api/projects")
@CrossOrigin(origins = "*")
public class ProjectController {

    private static final int MAX_NAME_LENGTH = 100;

    private final SavedProjectRepository repository;

    public ProjectController(SavedProjectRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> save(
            @RequestHeader(value = "X-User-Username", required = false) String username,
            @RequestBody Map<String, Object> body) {

        if (isBlank(username)) return error(HttpStatus.UNAUTHORIZED, "Login required.");

        String name = body.get("name") == null ? "" : body.get("name").toString().trim();
        String data = body.get("data") == null ? "" : body.get("data").toString();
        boolean overwrite = Boolean.parseBoolean(String.valueOf(body.get("overwrite")));

        if (name.isEmpty()) return error(HttpStatus.BAD_REQUEST, "Project name is required.");
        if (name.length() > MAX_NAME_LENGTH) {
            return error(HttpStatus.BAD_REQUEST, "Project name must be at most " + MAX_NAME_LENGTH + " characters.");
        }
        if (data.isEmpty()) return error(HttpStatus.BAD_REQUEST, "Project data is required.");

        Optional<SavedProject> existing = repository.findByOwnerUsernameAndNameIgnoreCase(username, name);
        Instant now = Instant.now();
        SavedProject project;

        if (existing.isPresent()) {
            if (!overwrite) {
                Map<String, Object> conflict = new HashMap<>();
                conflict.put("error", "exists");
                conflict.put("message", "A project named \"" + name + "\" already exists.");
                conflict.put("id", existing.get().getId());
                return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict);
            }
            project = existing.get();
        } else {
            project = new SavedProject();
            project.setOwnerUsername(username);
            project.setCreatedAt(now);
        }

        project.setName(name);
        project.setData(data);
        project.setUpdatedAt(now);
        project = repository.save(project);

        return ResponseEntity.status(HttpStatus.CREATED).body(summary(project));
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(
            @RequestHeader(value = "X-User-Username", required = false) String username) {

        if (isBlank(username)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        List<Map<String, Object>> result = new ArrayList<>();
        for (SavedProject p : repository.findByOwnerUsernameOrderByUpdatedAtDesc(username)) {
            result.add(summary(p));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(
            @RequestHeader(value = "X-User-Username", required = false) String username,
            @PathVariable Long id) {

        if (isBlank(username)) return error(HttpStatus.UNAUTHORIZED, "Login required.");

        Optional<SavedProject> found = repository.findByIdAndOwnerUsername(id, username);
        if (found.isEmpty()) return error(HttpStatus.NOT_FOUND, "Project not found.");

        Map<String, Object> out = summary(found.get());
        out.put("data", found.get().getData());
        return ResponseEntity.ok(out);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Username", required = false) String username,
            @PathVariable Long id) {

        if (isBlank(username)) return error(HttpStatus.UNAUTHORIZED, "Login required.");

        Optional<SavedProject> found = repository.findByIdAndOwnerUsername(id, username);
        if (found.isEmpty()) return error(HttpStatus.NOT_FOUND, "Project not found.");

        repository.delete(found.get());
        Map<String, Object> ok = new HashMap<>();
        ok.put("message", "Project deleted.");
        return ResponseEntity.ok(ok);
    }

    private static Map<String, Object> summary(SavedProject p) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", p.getId());
        m.put("name", p.getName());
        m.put("createdAt", p.getCreatedAt().toString());
        m.put("updatedAt", p.getUpdatedAt().toString());
        return m;
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> m = new HashMap<>();
        m.put("error", message);
        m.put("message", message);
        return ResponseEntity.status(status).body(m);
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
