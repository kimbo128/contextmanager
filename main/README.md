# MCP Context Manager

A unified Model Context Protocol (MCP) server that orchestrates multiple domain-specific MCP servers. This context manager provides a central interface for accessing and managing context across different knowledge domains.

## Features

- **Domain Management**: Set and switch between different context domains (developer, project, student, etc.)
- **Session Management**: Create and manage sessions for different domains
- **Context Operations**: Build, load, and manipulate context for different entity types
- **Cross-Domain Support**: Work with multiple knowledge domains through a single interface, including creating relationships between entities in different domains
- **Domain Discovery**: Explore available domains and their entity types
- **Direct Integration**: Communicates directly with domain-specific MCP servers

## Implementation

The Context Manager uses the MCP Client SDK to communicate with domain-specific MCP servers. It:

1. Maintains a registry of domain servers with their connection information
2. Creates MCP clients to connect to each domain server
3. Routes requests to the appropriate domain server based on the active domain
4. Provides cross-domain functionality for relating entities across domains

## Path Resolution

The Context Manager uses absolute paths constructed at runtime to locate domain servers. This approach:

- Ensures consistent path resolution regardless of the current working directory
- Makes the code portable and sharable on GitHub
- Uses Node.js's `path.resolve()` with `import.meta.url` to create absolute paths relative to the context manager's location

If you need to modify paths to domain servers, update the `domains` array in `main/index.ts`.

## Available Domains

The context manager provides access to the following domains:

1. **Developer Domain**: Software development context with entities like projects, components, and tasks
2. **Project Domain**: Project management context with entities like projects, tasks, and resources
3. **Student Domain**: Educational context with entities like courses, assignments, and exams
4. **Qualitative Research Domain**: Qualitative research context with entities like studies, participants, and interviews
5. **Quantitative Research Domain**: Quantitative research context with entities like datasets, variables, and analyses

## Usage

### Starting the Server

```bash
npm install
npm run build
npm start
```

### Command-Line Arguments

The Context Manager accepts the following command-line arguments:

```bash
# Run on a specific port (default: 3000)
npm start -- --port 3001

# Enable debug logging
npm start -- --debug

# Specify a config file
npm start -- --config ./my-config.json

# Run only specific domain servers
npm start -- --domains developer,project
```

### Domain Management

Use the `setActiveDomain` tool to select which domain you want to work with:

```
setActiveDomain(domain="developer")
```

### Session Management

Start a new session for the active domain:

```
startsession(domain="developer")
```

End a session when you're done:

```
endsession(sessionId="session_id_here", stage="completed", stageNumber=1, totalStages=1, nextStageNeeded=false)
```

### Context Operations

Build context for the active domain:

```
buildcontext(type="entities", data={...})
```

Load context for a specific entity:

```
loadcontext(entityName="MyProject", entityType="project")
```

Delete context:

```
deletecontext(type="entities", data={...})
```

### Cross-Domain Operations

Create relationships between entities in different domains:

```
relateCrossDomain(fromDomain="developer", fromEntity="ProjectX", toDomain="project", toEntity="ProjectX", relationType="manages")
```

### Exploring Available Entities

List all entity types available in the current domain:

```
listAllEntities()
```

## Troubleshooting

### Common Issues

1. **Path Resolution Errors**:
   ```
   Error: Cannot find module '...'
   ```
   Solution: Ensure all paths in the `domains` array in `main/index.ts` are correctly specified.

2. **Connection to Domain Server Failed**:
   ```
   Error: Failed to connect to domain server: 'developer'
   ```
   Solution: Check that the domain server is running and accessible.

3. **Method Not Found**:
   ```
   Error: Method 'buildcontext' not found in domain 'developer'
   ```
   Solution: Verify the method name and ensure it is supported by the domain server.

## Architecture

The Context Manager is a proxy that:

1. Receives MCP protocol messages from clients
2. Routes these messages to the appropriate domain server
3. Returns responses back to the client

Each domain server runs as a separate process, and the Context Manager communicates with them using the MCP protocol.

## Versioning

This package follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

Current version: 1.0.0

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

## Development

To extend the Context Manager with new domains or functionality:

1. Add the new domain to the `domains` array in `main/index.ts`
2. Specify the connection information for the domain server
3. Update tests and documentation

## License

MIT 