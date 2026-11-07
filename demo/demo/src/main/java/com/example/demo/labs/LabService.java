package com.example.demo.labs;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;

@Service
public class LabService {

    private final LabModuleRepository labModuleRepository;

    // Directory where uploaded .pkt/.pka files are stored on disk,
    // relative to wherever the Spring Boot app is run from.
    private static final String UPLOAD_DIR = "./uploads";

    public LabService(LabModuleRepository labModuleRepository) {
        this.labModuleRepository = labModuleRepository;
    }

    /**
     * Validates the title/category/file, stores the file under
     * ./uploads with a collision-proof generated name, and saves the
     * metadata row. Throws IllegalArgumentException with a user-facing
     * message on any validation failure.
     */
    public LabModule uploadLab(String title, String categoryRaw, MultipartFile file) throws IOException {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("Title is required.");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("A .pkt or .pka file is required.");
        }

        LabModule.Category category = parseCategory(categoryRaw);

        String originalName = file.getOriginalFilename();
        String extension = "";
        if (originalName != null && originalName.contains(".")) {
            extension = originalName.substring(originalName.lastIndexOf('.'));
        }
        if (!extension.equalsIgnoreCase(".pkt") && !extension.equalsIgnoreCase(".pka")) {
            throw new IllegalArgumentException("Only .pkt or .pka files are accepted.");
        }

        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        // A generated name (not the user's original filename) so two
        // uploads with the same filename never collide on disk.
        String storedFileName = UUID.randomUUID() + extension;
        Path destination = uploadPath.resolve(storedFileName);
        Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING);

        LabModule lab = new LabModule();
        lab.setTitle(title);
        lab.setCategory(category);
        lab.setFileName(storedFileName);
        return labModuleRepository.save(lab);
    }

    public List<LabModule> getLabsByCategory(String categoryRaw) {
        LabModule.Category category = parseCategory(categoryRaw);
        return labModuleRepository.findByCategory(category);
    }

    /**
     * Deletes both the stored file and the database record. If the file
     * is already missing from disk for some reason, the record is still
     * removed rather than leaving an orphaned entry the UI can't clear.
     */
    public void deleteLab(Long id) throws IOException {
        LabModule lab = labModuleRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Lab not found."));

        Path filePath = Paths.get(UPLOAD_DIR).resolve(lab.getFileName());
        Files.deleteIfExists(filePath);

        labModuleRepository.delete(lab);
    }

    private LabModule.Category parseCategory(String categoryRaw) {
        if (categoryRaw == null) {
            throw new IllegalArgumentException("Category must be TRAINING or TROUBLESHOOTING.");
        }
        try {
            return LabModule.Category.valueOf(categoryRaw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Category must be TRAINING or TROUBLESHOOTING.");
        }
    }
}
