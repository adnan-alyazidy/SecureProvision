package com.example.demo.controller;

/**
 * Maps a single connection/edge from the vis.js topology JSON,
 * expressed as device IDs plus each end's port/interface name:
 * { "from": 1, "to": 2, "fromPort": "g0/0", "toPort": "Fa0/1" }
 *
 * fromPort/toPort may be null when the user hasn't labeled that end
 * of the cable yet.
 */
public class Connection {

    private Long from;
    private Long to;
    private String fromPort;
    private String toPort;

    public Connection() {
        // Required no-args constructor for Jackson deserialization
    }

    public Connection(Long from, Long to, String fromPort, String toPort) {
        this.from = from;
        this.to = to;
        this.fromPort = fromPort;
        this.toPort = toPort;
    }

    public Long getFrom() {
        return from;
    }

    public void setFrom(Long from) {
        this.from = from;
    }

    public Long getTo() {
        return to;
    }

    public void setTo(Long to) {
        this.to = to;
    }

    public String getFromPort() {
        return fromPort;
    }

    public void setFromPort(String fromPort) {
        this.fromPort = fromPort;
    }

    public String getToPort() {
        return toPort;
    }

    public void setToPort(String toPort) {
        this.toPort = toPort;
    }

    @Override
    public String toString() {
        return "Connection{from=" + from + ", to=" + to +
                ", fromPort='" + fromPort + "', toPort='" + toPort + "'}";
    }
}
