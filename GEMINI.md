# Project Overview

This project, "EnvSync-LE" is a Visual Studio Code extension designed to detect and compare `.env` files across a workspace. It helps developers maintain consistency in their environment variable configurations by highlighting differences and providing tools for managing them. The extension is built using TypeScript and targets VS Code API version 1.70.0 or higher.

**Key Features:**
- Detection of `.env` files within the workspace.
- Comparison of `.env` files to identify missing or differing keys.
- Commands for comparing selected files, ignoring files, and setting template files.
- Configurable settings for watch patterns, exclude patterns, notification levels, and comparison modes.

**Technologies Used:**
- **TypeScript:** Primary language for development.
- **Node.js:** Runtime environment.
- **VS Code API:** For extension development.
- **Vitest:** Testing framework.
- **Biome:** Linter and formatter.
- **dotenv:** For parsing `.env` files.

# Building and Running

To set up and run this project, follow these steps:

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Clean Project:**
    ```bash
    npm run clean
    ```

3.  **Build the Extension:**
    ```bash
    npm run build
    ```

4.  **Watch for Changes (Development):**
    ```bash
    npm run watch
    ```

5.  **Run Tests:**
    ```bash
    npm test
    # or for watch mode
    npm run test:watch
    # or with coverage
    npm run test:coverage
    # or with UI
    npm run test:ui
    ```

6.  **Linting:**
    ```bash
    npm run lint
    # To fix linting issues
    npm run lint:fix
    ```

7.  **Package the Extension (for publishing):**
    ```bash
    npm run package
    ```

# Development Conventions

-   **Linting and Formatting:** The project uses `Biome` for code linting and formatting. Ensure you run `npm run lint:fix` before committing changes to adhere to the established code style.
-   **Testing:** `Vitest` is used for unit and integration testing. New features and bug fixes should be accompanied by relevant tests. Run `npm test` to execute the test suite.
-   **TypeScript:** Adhere to TypeScript best practices, including strong typing and clear interfaces.
-   **VS Code API Usage:** Follow the official VS Code extension development guidelines for API usage and extension structure.
