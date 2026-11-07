// ChatRequest.java
package com.example.demo.controller;

import java.util.List;

public class ChatRequest {

    private String message;
    private int deviceCount;
    private int connectionCount;
    private List<Device> devices;
    private List<Connection> connections;

    public ChatRequest() {
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public int getDeviceCount() {
        return deviceCount;
    }

    public void setDeviceCount(int deviceCount) {
        this.deviceCount = deviceCount;
    }

    public int getConnectionCount() {
        return connectionCount;
    }

    public void setConnectionCount(int connectionCount) {
        this.connectionCount = connectionCount;
    }

    public List<Device> getDevices() {
        return devices;
    }

    public void setDevices(List<Device> devices) {
        this.devices = devices;
    }

    public List<Connection> getConnections() {
        return connections;
    }

    public void setConnections(List<Connection> connections) {
        this.connections = connections;
    }

    @Override
    public String toString() {
        return "ChatRequest{" +
                "message='" + message + '\'' +
                ", deviceCount=" + deviceCount +
                ", connectionCount=" + connectionCount +
                ", devices=" + devices +
                ", connections=" + connections +
                '}';
    }
}