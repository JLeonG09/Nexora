package com.nexora.riendas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RiendasApplication {

	public static void main(String[] args) {
		SpringApplication.run(RiendasApplication.class, args);
	}

}
