// Device.java
package com.example.demo.controller;

public class Device {

    private Long id;
    private String label;
    private String deviceType;

    public Device() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(String deviceType) {
        this.deviceType = deviceType;
    }

    @Override
    public String toString() {
        return "Device{id=" + id + ", label='" + label + "', deviceType='" + deviceType + "'}";
    }
}