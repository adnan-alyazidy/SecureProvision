package com.example.demo.labs;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Manages Packet Tracer lab uploads (.pkt / .pka) for the Training and
 * Troubleshooting workspaces. Entirely separate from
 * NetworkChatController and the auth controllers — doesn't touch either.
 */
@RestController
@RequestMapping("/api/labs")
@CrossOrigin(origins = "*")
public class LabController {

    private final LabService labService;

    public LabController(LabService labService) {
        this.labService = labService;
    }

    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> uploadLab(
            @RequestParam("title") String title,
            @RequestParam("category") String category,
            @RequestParam("file") MultipartFile file) {

        Map<String, Object> response = new HashMap<>();
        try {
            LabModule saved = labService.uploadLab(title, category, file);
            response.put("status", "success");
            response.put("message", "Lab '" + saved.getTitle() + "' uploaded successfully.");
            response.put("lab", saved);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @GetMapping("/{category}")
    public ResponseEntity<Map<String, Object>> listLabsByCategory(@PathVariable String category) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<LabModule> labs = labService.getLabsByCategory(category);
            response.put("status", "success");
            response.put("labs", labs);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteLab(@PathVariable Long id) {
        Map<String, Object> response = new HashMap<>();
        try {
            labService.deleteLab(id);
            response.put("status", "success");
            response.put("message", "Lab deleted.");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }
}
