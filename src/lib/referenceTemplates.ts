/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const referenceTemplates = {
  dockerCompose: `version: '3.8'

services:
  mysql-db:
    image: mysql:8.0
    container_name: mysql_splitwise
    ports:
      - "3306:3306"
    environment:
      MYSQL_DATABASE: splitwise_db
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_PASSWORD: dbpassword
      MYSQL_USER: dbuser
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - splitwise-network

  backend-api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: spring_boot_splitwise
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql-db:3306/splitwise_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
      SPRING_DATASOURCE_USERNAME: dbuser
      SPRING_DATASOURCE_PASSWORD: dbpassword
      JWT_SECRET: mySuperSecretSecureKeyWithMoreThan256BitsToAvoidErrors!
    depends_on:
      - mysql-db
    networks:
      - splitwise-network

  frontend-app:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: angular_splitwise
    ports:
      - "80:80"
    depends_on:
      - backend-api
    networks:
      - splitwise-network

volumes:
  mysql-data:

networks:
  splitwise-network:
    driver: bridge`,

  backendDockerfile: `FROM maven:3.8.5-openjdk-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM openjdk:17-jdk-slim
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]`,

  frontendDockerfile: `FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build --configuration=production

FROM nginx:alpine
COPY --from=build /app/dist/splitwise-angular /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,

  mysqlSchema: `CREATE DATABASE IF NOT EXISTS splitwise_db;
USE splitwise_db;

CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shared_groups (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    currency VARCHAR(10) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_members (
    group_id VARCHAR(255),
    user_id VARCHAR(255),
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES shared_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE expenses (
    id VARCHAR(255) PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    paid_by VARCHAR(255) NOT NULL,
    split_method VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES shared_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by) REFERENCES users(id)
);

CREATE TABLE expense_splits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    expense_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    shares INT,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE invites (
    id VARCHAR(255) PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES shared_groups(id) ON DELETE CASCADE
);`,

  springController: `package com.splitwise.api.controller;

import com.splitwise.api.model.*;
import com.splitwise.api.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ExpenseController {

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private GroupService groupService;

    @Autowired
    private UserService userService;

    // Fetch groups for logged-in user
    @GetMapping("/groups")
    public ResponseEntity<List<Group>> getMyGroups(@RequestAttribute("userId") String userId) {
        return ResponseEntity.ok(groupService.getGroupsByUserId(userId));
    }

    // Create shared group
    @PostMapping("/groups")
    public ResponseEntity<Group> createGroup(@RequestBody GroupDto groupDto, @RequestAttribute("userId") String userId) {
        return ResponseEntity.ok(groupService.createGroup(groupDto, userId));
    }

    // Add itemized expense
    @PostMapping("/groups/{groupId}/expenses")
    public ResponseEntity<Expense> addExpense(
            @PathVariable String groupId,
            @RequestBody ExpenseDto expenseDto,
            @RequestAttribute("userId") String userId) {
        return ResponseEntity.ok(expenseService.addExpense(groupId, expenseDto, userId));
    }

    // Secure endpoint requiring JWT role validation (Master Admin Panel action)
    @PutMapping("/admin/users/{userId}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<User> updateUserRole(
            @PathVariable String userId,
            @RequestParam String role) {
        return ResponseEntity.ok(userService.updateUserRole(userId, role));
    }

    // Currency conversion proxy endpoint
    @GetMapping("/rates")
    public ResponseEntity<CurrencyResponse> getConversionRates() {
        return ResponseEntity.ok(expenseService.getRates());
    }
}`,

  angularService: `import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private apiUrl = \`\${environment.apiUrl}/api\`;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('jwt_token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${token}\`
    });
  }

  getGroups(): Observable<any[]> {
    return this.http.get<any[]>(\`\${this.apiUrl}/groups\`, { headers: this.getHeaders() });
  }

  createGroup(groupData: any): Observable<any> {
    return this.http.post<any>(\`\${this.apiUrl}/groups\`, groupData, { headers: this.getHeaders() });
  }

  addExpense(groupId: string, expenseData: any): Observable<any> {
    return this.http.post<any>(\`\${this.apiUrl}/groups/\${groupId}/expenses\`, expenseData, { headers: this.getHeaders() });
  }

  getSystemAnalytics(): Observable<any> {
    return this.http.get<any>(\`\${this.apiUrl}/admin/analytics\`, { headers: this.getHeaders() });
  }

  sendEmailInvite(inviteData: any): Observable<any> {
    return this.http.post<any>(\`\${this.apiUrl}/invite/send\`, inviteData, { headers: this.getHeaders() });
  }
}`
};
