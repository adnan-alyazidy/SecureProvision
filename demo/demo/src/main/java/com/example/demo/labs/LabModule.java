package com.example.demo.labs;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// NOTE: uses jakarta.persistence (Spring Boot 3.x / Java 17+), matching
// the User entity elsewhere in this project. Switch to javax.persistence
// if your project is on Spring Boot 2.x.

@Entity
@Table(name = "lab_modules")
public class LabModule {

    public enum Category {
        TRAINING, TROUBLESHOOTING
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category;

    // The name the file is actually stored under in ./uploads (a
    // generated UUID + original extension, not the user's original
    // filename — see LabService.uploadLab).
    @Column(nullable = false)
    private String fileName;

    public LabModule() {
        // Required no-args constructor for JPA
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }
}
