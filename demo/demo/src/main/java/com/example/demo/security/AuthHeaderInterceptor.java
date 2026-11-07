package com.example.demo.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthHeaderInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Let CORS preflight requests through unconditionally, before any
        // header checks — the browser's OPTIONS request never carries
        // X-User-Username itself.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_OK);
            return true;
        }

        // Protect these paths
        String path = request.getRequestURI();
        if (path.startsWith("/api/chat") || path.startsWith("/api/labs/upload") || path.startsWith("/api/projects")) {
            String username = request.getHeader("X-User-Username");
            if (username == null || username.trim().isEmpty()) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return false;
            }
        }
        return true;
    }
}
