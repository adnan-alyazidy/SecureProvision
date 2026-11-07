package com.example.demo.projects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One saved canvas design, owned by a single user. The full serialized
 * vis-network state (nodes, positions, edges, ports, counters) is stored
 * as an opaque JSON string in {@code data} — the backend never needs to
 * understand it, which keeps this feature decoupled from the topology model.
 */
@Entity
@Table(name = "saved_projects")
public class SavedProject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String ownerUsername;

    @Column(nullable = false)
    private String name;

    @Lob
    @Column(nullable = false)
    private String data;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public SavedProject() {}

    public Long getId() { return id; }
    public String getOwnerUsername() { return ownerUsername; }
    public void setOwnerUsername(String ownerUsername) { this.ownerUsername = ownerUsername; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
