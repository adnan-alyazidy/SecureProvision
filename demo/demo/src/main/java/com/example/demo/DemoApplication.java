package com.example.demo;

import com.example.demo.auth.User;
import com.example.demo.auth.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.util.Optional;

@SpringBootApplication
public class DemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }

    /*
     * One-time startup bootstrap: promotes a designated test account to
     * OWNER, since there's no signup path that grants that role directly
     * (signUp() in AuthService always assigns Role.USER). Without this,
     * there would be no account able to call /api/auth/grant-developer.
     *
     * Replace "your-test-username" below with the actual username of an
     * account you've already signed up and verified. Uses the Role enum
     * directly (Role.OWNER), not a String, so it can't drift out of sync
     * with the column's actual stored representation.
     */
    @Bean
    CommandLineRunner promoteTestAccountToOwner(UserRepository userRepository) {
        return args -> {
            String testUsername = "adnan - admin"; //

            Optional<User> maybeUser = userRepository.findByUsername(testUsername);
            if (maybeUser.isEmpty()) {
                System.out.println("[SecureProvision] No user named '" + testUsername
                        + "' found — skipping OWNER bootstrap. Sign up and verify that account first.");
                return;
            }

            User user = maybeUser.get();
            if (user.getRole() == User.Role.OWNER) {
                System.out.println("[SecureProvision] '" + testUsername + "' is already OWNER.");
                return;
            }

            user.setRole(User.Role.OWNER);
            userRepository.save(user);
            System.out.println("[SecureProvision] Promoted '" + testUsername + "' to OWNER.");
        };
    }
}
