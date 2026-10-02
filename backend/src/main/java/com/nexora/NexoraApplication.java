package com.nexora;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class NexoraApplication {

	public static void main(String[] args) {
		SpringApplication.run(NexoraApplication.class, args);
	}

}
