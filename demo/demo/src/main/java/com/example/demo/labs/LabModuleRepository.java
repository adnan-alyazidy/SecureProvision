package com.example.demo.labs;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LabModuleRepository extends JpaRepository<LabModule, Long> {

    List<LabModule> findByCategory(LabModule.Category category);
}
