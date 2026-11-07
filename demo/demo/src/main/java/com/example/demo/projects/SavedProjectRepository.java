package com.example.demo.projects;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SavedProjectRepository extends JpaRepository<SavedProject, Long> {

    List<SavedProject> findByOwnerUsernameOrderByUpdatedAtDesc(String ownerUsername);

    Optional<SavedProject> findByIdAndOwnerUsername(Long id, String ownerUsername);

    Optional<SavedProject> findByOwnerUsernameAndNameIgnoreCase(String ownerUsername, String name);
}
