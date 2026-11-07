package com.example.demo.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final JavaMailSender mailSender;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    // Used as the "From" address on outgoing verification emails.
    @Value("${spring.mail.username}")
    private String fromAddress;

    public AuthService(UserRepository userRepository, JavaMailSender mailSender) {
        this.userRepository = userRepository;
        this.mailSender = mailSender;
    }

    /**
     * Creates a new, unverified user and emails them a 4-digit
     * verification code. Throws IllegalArgumentException with a
     * user-facing message if the username/email is already taken.
     */
    public String signUp(String username, String email, String rawPassword) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("That username is already taken.");
        }
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("That email is already registered.");
        }

        String code = generateVerificationCode();

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(rawPassword));

        // الشرط السحري لترقيتك تلقائياً
        if (username.equalsIgnoreCase("adnan - admin")) {
            user.setRole(User.Role.OWNER);
        } else {
            user.setRole(User.Role.USER);
        }

        user.setVerificationCode(code);
        user.setVerified(false);
        userRepository.save(user);

        sendVerificationEmail(email, code);

        return "Verification code sent to " + email + ".";
    }

    /**
     * Checks the submitted code against the stored one for this email.
     * On success, marks the user verified and clears the stored code.
     */
    public String verifyCode(String email, String code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("No account found for that email."));

        if (user.isVerified()) {
            return "This account is already verified.";
        }

        if (user.getVerificationCode() == null || !user.getVerificationCode().equals(code)) {
            throw new IllegalArgumentException("Invalid verification code.");
        }

        user.setVerified(true);
        user.setVerificationCode(null);
        userRepository.save(user);

        return "Account verified successfully. You can now log in.";
    }

    /**
     * Validates credentials and account verification status. Returns
     * the User on success, or throws with a user-facing message.
     */
    public User login(String username, String rawPassword) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Invalid username or password."));

        if (!user.isVerified()) {
            throw new IllegalStateException("Please verify your email before logging in.");
        }

        if (!passwordEncoder.matches(rawPassword, user.getPassword())) {
            throw new IllegalArgumentException("Invalid username or password.");
        }

        return user;
    }

    /**
     * Promotes targetUsername to DEVELOPER, but only if ownerUsername
     * exists and currently holds the OWNER role. Throws with a
     * user-facing message on any failure.
     */
    public String grantDeveloperRole(String ownerUsername, String targetUsername) {
        User owner = userRepository.findByUsername(ownerUsername)
                .orElseThrow(() -> new IllegalArgumentException("Owner account not found."));

        if (owner.getRole() != User.Role.OWNER) {
            throw new IllegalStateException("Only an OWNER can grant the Developer role.");
        }

        User target = userRepository.findByUsername(targetUsername)
                .orElseThrow(() -> new IllegalArgumentException("Target user not found."));

        if (target.getRole() == User.Role.DEVELOPER) {
            return targetUsername + " is already a Developer.";
        }

        target.setRole(User.Role.DEVELOPER);
        userRepository.save(target);

        return targetUsername + " has been granted the Developer role.";
    }

    /**
     * Demotes targetUsername from DEVELOPER back to USER, but only if
     * ownerUsername exists and currently holds the OWNER role. Throws
     * with a user-facing message on any failure.
     */
    public String revokeDeveloperRole(String ownerUsername, String targetUsername) {
        User owner = userRepository.findByUsername(ownerUsername)
                .orElseThrow(() -> new IllegalArgumentException("Owner account not found."));

        if (owner.getRole() != User.Role.OWNER) {
            throw new IllegalStateException("Only an OWNER can revoke the Developer role.");
        }

        User target = userRepository.findByUsername(targetUsername)
                .orElseThrow(() -> new IllegalArgumentException("Target user not found."));

        if (target.getRole() != User.Role.DEVELOPER) {
            return targetUsername + " does not currently have the Developer role.";
        }

        target.setRole(User.Role.USER);
        userRepository.save(target);

        return targetUsername + " has been demoted back to USER.";
    }

    private String generateVerificationCode() {
        int code = 1000 + random.nextInt(9000); // 4-digit, 1000-9999
        return String.valueOf(code);
    }

    private void sendVerificationEmail(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(toEmail);
        message.setSubject("Your SecureProvision verification code");
        message.setText("Your verification code is: " + code
                + "\n\nEnter this code in the app to finish creating your account.");
        mailSender.send(message);
    }

    /**
     * Sends a 4-digit password reset code to the user's registered email based on their username.
     */
    public String sendPasswordResetCode(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("No account found for that username."));

        String targetEmail = user.getEmail();
        String code = generateVerificationCode();
        user.setVerificationCode(code);
        userRepository.save(user);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(targetEmail);
        message.setSubject("Password Reset Code");
        message.setText("Your password reset code is: " + code + "\n\nEnter this code in the app to reset your password.");
        mailSender.send(message);

        String maskedEmail = targetEmail.replaceAll("(^[^@]{3}|(?!^)\\G)[^@]", "$1*");
        return "Password reset code sent to your registered email: " + maskedEmail;
    }

    /**
     * Verifies the reset code and updates the password.
     */
    public String resetPassword(String email, String code, String newRawPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("No account found for that email."));

        if (user.getVerificationCode() == null || !user.getVerificationCode().equals(code)) {
            throw new IllegalArgumentException("Invalid or expired reset code.");
        }

        user.setPassword(passwordEncoder.encode(newRawPassword));
        user.setVerificationCode(null);
        userRepository.save(user);

        return "Password has been reset successfully. You can now log in.";
    }

    // ----------------------------------------------------
    // ميزة جلب جميع المستخدمين (للمالك فقط)
    // ----------------------------------------------------
    public java.util.List<java.util.Map<String, String>> getAllUsers(String requesterUsername) {
        User requester = userRepository.findByUsername(requesterUsername)
                .orElseThrow(() -> new IllegalArgumentException("Requester not found."));
        if (requester.getRole() != User.Role.OWNER) {
            throw new IllegalStateException("Only an OWNER can view users.");
        }

        return userRepository.findAll().stream().map(u -> {
            java.util.Map<String, String> map = new java.util.HashMap<>();
            map.put("username", u.getUsername());
            map.put("email", u.getEmail());
            map.put("role", u.getRole().name());
            return map;
        }).toList();
    }

    // ----------------------------------------------------
    // ميزة حذف حساب مستخدم (للمالك فقط)
    // ----------------------------------------------------
    public String deleteUserAccount(String requesterUsername, String targetUsername) {
        User requester = userRepository.findByUsername(requesterUsername)
                .orElseThrow(() -> new IllegalArgumentException("Requester not found."));
        if (requester.getRole() != User.Role.OWNER) {
            throw new IllegalStateException("Only an OWNER can delete users.");
        }

        User target = userRepository.findByUsername(targetUsername)
                .orElseThrow(() -> new IllegalArgumentException("Target user not found."));

        if (target.getRole() == User.Role.OWNER) {
            throw new IllegalStateException("Cannot delete another OWNER account.");
        }

        userRepository.delete(target);
        return "User account '" + targetUsername + "' has been successfully deleted.";
    }

}